import { countBySectionClubWide } from '../shared/section-counts.ts';
import { BADGE_SECTIONS, SECTION_PATH_ID, SECTION_PINS } from '../shared/section-map-pins.ts';
import { readBoolPref, writeBoolPref } from './prefs.ts';
import { store } from './store.ts';

const SVG_NS = 'http://www.w3.org/2000/svg';
const EXPANDED_PREF_KEY = 'pdd-section-map-expanded';

let cachedSvgText: Promise<string> | null = null;
function fetchMapSvg(): Promise<string> {
  if (!cachedSvgText) cachedSvgText = fetch('/section-map.svg').then((r) => r.text());
  return cachedSvgText;
}

export interface SectionMapHandle {
  update(): void;
}

export function mountSectionMap(container: HTMLElement, opts: { alwaysExpanded?: boolean } = {}): SectionMapHandle {
  const alwaysExpanded = !!opts.alwaysExpanded;
  let expanded = alwaysExpanded || readBoolPref(EXPANDED_PREF_KEY, true);

  const wrapper = document.createElement('div');
  wrapper.className = 'section-map';

  let toggleBtn: HTMLButtonElement | null = null;
  if (!alwaysExpanded) {
    toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'section-map-toggle';
    wrapper.appendChild(toggleBtn);
  }

  const body = document.createElement('div');
  body.className = 'section-map-body';
  body.classList.toggle('hidden', !expanded);
  wrapper.appendChild(body);

  const svgHolder = document.createElement('div');
  svgHolder.className = 'section-map-svg-holder';
  body.appendChild(svgHolder);

  const badgeRow = document.createElement('div');
  badgeRow.className = 'section-map-badges';
  body.appendChild(badgeRow);

  container.appendChild(wrapper);

  function updateToggleLabel(): void {
    if (!toggleBtn) return;
    toggleBtn.textContent = expanded ? 'Section Map ▾' : 'Section Map ▸';
  }
  updateToggleLabel();

  const pinEls = new Map<string, { circle: SVGCircleElement; title: SVGTitleElement }>();
  const pathEls = new Map<string, SVGElement>();
  const badgeEls = new Map<string, HTMLElement>();
  let ready = false;

  fetchMapSvg().then((svgText) => {
    svgHolder.innerHTML = svgText;
    const svgEl = svgHolder.querySelector('svg');
    if (!svgEl) return;

    for (const pathId of new Set(Object.values(SECTION_PATH_ID))) {
      const el = svgEl.querySelector(`#${CSS.escape(pathId)}`);
      if (el) pathEls.set(pathId, el as SVGElement);
    }

    const pinLayer = document.createElementNS(SVG_NS, 'g');
    pinLayer.setAttribute('class', 'section-map-pins');
    svgEl.appendChild(pinLayer);

    for (const pin of SECTION_PINS) {
      const circle = document.createElementNS(SVG_NS, 'circle');
      circle.setAttribute('cx', String(pin.x));
      circle.setAttribute('cy', String(pin.y));
      circle.setAttribute('r', '4');
      circle.setAttribute('class', 'section-pin');
      const title = document.createElementNS(SVG_NS, 'title');
      circle.appendChild(title);
      pinLayer.appendChild(circle);
      pinEls.set(pin.section, { circle, title });
    }

    for (const section of BADGE_SECTIONS) {
      const badge = document.createElement('div');
      badge.className = 'section-map-badge';
      badgeRow.appendChild(badge);
      badgeEls.set(section, badge);
    }

    ready = true;
    applyCounts();
  });

  function applyCounts(): void {
    if (!ready) return;
    const counts = countBySectionClubWide(store.get().data.qsos.values());

    for (const [section, { circle, title }] of pinEls) {
      const count = counts[section] ?? 0;
      circle.setAttribute('r', String(4 + Math.min(10, Math.sqrt(count) * 3)));
      circle.classList.toggle('section-pin-active', count > 0);
      title.textContent = `${section}: ${count} QSO${count === 1 ? '' : 's'}`;
    }

    const workedPaths = new Set<string>();
    for (const [section, pathId] of Object.entries(SECTION_PATH_ID)) {
      if ((counts[section] ?? 0) > 0) workedPaths.add(pathId);
    }
    for (const [pathId, el] of pathEls) {
      el.classList.toggle('section-path-worked', workedPaths.has(pathId));
    }

    for (const [section, badge] of badgeEls) {
      const count = counts[section] ?? 0;
      badge.textContent = `${section}: ${count}`;
      badge.classList.toggle('section-map-badge-active', count > 0);
    }
  }

  toggleBtn?.addEventListener('click', () => {
    expanded = !expanded;
    writeBoolPref(EXPANDED_PREF_KEY, expanded);
    body.classList.toggle('hidden', !expanded);
    updateToggleLabel();
    if (expanded) applyCounts();
  });

  return { update: applyCounts };
}
