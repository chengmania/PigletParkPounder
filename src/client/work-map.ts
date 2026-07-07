import { lookupHunterLocation, type HunterLocation } from '../shared/hunter-locations.ts';
import { splitParkList } from '../shared/validate.ts';
import { loadParks, lookupPark } from './parks.ts';
import { store } from './store.ts';

export interface WorkMapHandle {
  update(): void;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
// public/world-map.svg's own viewBox ("0 0 2752.766 1537.631", see that
// file's attribution comment) is NOT a tight -180..180/-90..90 equirectangular
// grid -- the source file pads the drawn landmass with margin on each side,
// so a naive full-viewBox projection lands pins tens of degrees off (verified
// by projecting reference cities/state centroids against the actual
// coastlines: e.g. California's centroid landed in Kansas). The real
// lat/lon-to-viewBox-unit mapping was calibrated by cross-checking country
// path bounding boxes (Germany, mainland France) against their well-known
// real-world extents: longitude 0 sits at x=1270.2 (not the naive 1376.4),
// and the drawn landmass spans y=61.99 (north pole) to y=1457.56 (south
// pole), not the full 0..1537.631 viewBox height.
const MAP_WIDTH = 2752.766;
const MAP_HEIGHT = 1537.631;
const FULL_VIEW: ViewBox = { x: 0, y: 0, w: MAP_WIDTH, h: MAP_HEIGHT };
// x at longitude 0 -- see calibration note above.
const LON0_X = 1270.2;
// y range spanned by the actual drawn map (latitude +90 to -90) within the
// padded viewBox -- see calibration note above.
const MAP_TOP_Y = 61.99;
const MAP_DRAWN_HEIGHT = 1395.57;
// How far in you can zoom -- 0.04 means the narrowest visible slice is ~4%
// of the full map's width (roughly country-to-small-region scale).
const MIN_ZOOM_SCALE = 0.04;

interface ViewBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function project(lat: number, lon: number): { x: number; y: number } {
  return { x: LON0_X + (lon / 360) * MAP_WIDTH, y: MAP_TOP_Y + ((90 - lat) / 180) * MAP_DRAWN_HEIGHT };
}

function clampView(v: ViewBox): ViewBox {
  const w = Math.min(FULL_VIEW.w, Math.max(FULL_VIEW.w * MIN_ZOOM_SCALE, v.w));
  const h = w * (FULL_VIEW.h / FULL_VIEW.w); // fixed aspect ratio, never distort
  const x = Math.min(FULL_VIEW.w - w, Math.max(0, v.x));
  const y = Math.min(FULL_VIEW.h - h, Math.max(0, v.y));
  return { x, y, w, h };
}

let cachedSvgText: Promise<string> | null = null;
function fetchMapSvg(): Promise<string> {
  if (!cachedSvgText) cachedSvgText = fetch('/world-map.svg').then((r) => r.text());
  return cachedSvgText;
}

// Live scatter plot of every park referenced in the log (our stations' own
// parks + any park-to-park hunters' parks), sized by QSO count, plotted
// directly on the bundled world map (own SVG coordinate space, so pins and
// coastlines can never drift out of alignment) using coordinates from the
// synced park database (parks.ts). Parks not yet in the cache just don't
// get a pin -- this degrades gracefully and is never a hard dependency for
// logging. Pan (drag) and zoom (scroll wheel) are implemented as plain
// viewBox manipulation -- no map-tile library, no network access, works
// exactly the same with zero signal as it does online.
export function mountWorkMap(container: HTMLElement): WorkMapHandle {
  const wrapper = document.createElement('div');
  wrapper.className = 'work-map';

  const toolbar = document.createElement('div');
  toolbar.className = 'work-map-toolbar';
  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset View';
  toolbar.appendChild(resetBtn);
  wrapper.appendChild(toolbar);

  const svgHolder = document.createElement('div');
  svgHolder.className = 'work-map-svg-holder';
  wrapper.appendChild(svgHolder);

  const emptyMsg = document.createElement('p');
  emptyMsg.className = 'work-map-empty hidden';
  emptyMsg.textContent =
    "No pins yet -- sync the park database in Captain's Station (Parks tab) for park pins, or log a QSO with a recognized state/country in \"Their State\" for a rough hunter-location pin.";
  wrapper.appendChild(emptyMsg);

  container.appendChild(wrapper);

  let pinsLayer: SVGGElement | null = null;
  let statePinsLayer: SVGGElement | null = null;
  let svgEl: SVGSVGElement | null = null;
  let view: ViewBox = { ...FULL_VIEW };

  function applyView(): void {
    svgEl?.setAttribute('viewBox', `${view.x} ${view.y} ${view.w} ${view.h}`);
  }

  resetBtn.addEventListener('click', () => {
    view = { ...FULL_VIEW };
    applyView();
  });

  fetchMapSvg().then((svgText) => {
    svgHolder.innerHTML = svgText;
    svgEl = svgHolder.querySelector('svg');
    if (!svgEl) return;

    // State-level pins are drawn first, so precise park pins always render
    // on top of them where they'd otherwise overlap.
    statePinsLayer = document.createElementNS(SVG_NS, 'g');
    statePinsLayer.setAttribute('class', 'work-map-state-pins');
    svgEl.appendChild(statePinsLayer);

    pinsLayer = document.createElementNS(SVG_NS, 'g');
    pinsLayer.setAttribute('class', 'work-map-pins');
    svgEl.appendChild(pinsLayer);
    svgEl.classList.add('work-map-interactive');
    applyView();
    wirePanZoom(svgEl);
    update();
  });

  function wirePanZoom(svg: SVGSVGElement): void {
    svg.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        const rect = svg.getBoundingClientRect();
        const fracX = (e.clientX - rect.left) / rect.width;
        const fracY = (e.clientY - rect.top) / rect.height;
        const anchorX = view.x + fracX * view.w;
        const anchorY = view.y + fracY * view.h;

        const zoomFactor = e.deltaY < 0 ? 0.88 : 1 / 0.88;
        const newW = view.w * zoomFactor;
        const newH = view.h * zoomFactor;
        view = clampView({ x: anchorX - fracX * newW, y: anchorY - fracY * newH, w: newW, h: newH });
        applyView();
      },
      { passive: false },
    );

    let dragging = false;
    let dragStartClient = { x: 0, y: 0 };
    let dragStartView = { ...view };

    svg.addEventListener('pointerdown', (e) => {
      dragging = true;
      dragStartClient = { x: e.clientX, y: e.clientY };
      dragStartView = { ...view };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('work-map-dragging');
    });
    svg.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const rect = svg.getBoundingClientRect();
      const dxMap = ((e.clientX - dragStartClient.x) / rect.width) * dragStartView.w;
      const dyMap = ((e.clientY - dragStartClient.y) / rect.height) * dragStartView.h;
      view = clampView({ x: dragStartView.x - dxMap, y: dragStartView.y - dyMap, w: dragStartView.w, h: dragStartView.h });
      applyView();
    });
    const endDrag = () => {
      dragging = false;
      svg.classList.remove('work-map-dragging');
    };
    svg.addEventListener('pointerup', endDrag);
    svg.addEventListener('pointercancel', endDrag);
    svg.addEventListener('dblclick', () => {
      view = { ...FULL_VIEW };
      applyView();
    });
  }

  function addPin(layer: SVGGElement, x: number, y: number, count: number, label: string, className: string): void {
    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', String(x));
    circle.setAttribute('cy', String(y));
    circle.setAttribute('r', String(6 + Math.min(24, Math.sqrt(count) * 6)));
    circle.setAttribute('class', className);
    const title = document.createElementNS(SVG_NS, 'title');
    title.textContent = `${label}: ${count} QSO${count === 1 ? '' : 's'}`;
    circle.appendChild(title);
    layer.appendChild(circle);
  }

  function update(): void {
    if (!pinsLayer || !statePinsLayer) return;

    const qsos = [...store.get().data.qsos.values()].filter((q) => !q.deleted);
    const parkCounts = new Map<string, number>();
    // Non-P2P hunters only -- a park-to-park contact already gets a precise
    // pin from their park number, so a second rough state/country-level pin
    // for the same QSO would just be confusing clutter.
    const stateCounts = new Map<string, { loc: HunterLocation; count: number }>();

    for (const q of qsos) {
      for (const park of splitParkList(q.myPark)) parkCounts.set(park, (parkCounts.get(park) ?? 0) + 1);
      if (q.theirPark) {
        parkCounts.set(q.theirPark, (parkCounts.get(q.theirPark) ?? 0) + 1);
      } else if (q.theirState) {
        const loc = lookupHunterLocation(q.theirState);
        if (loc) {
          const entry = stateCounts.get(loc.label) ?? { loc, count: 0 };
          entry.count += 1;
          stateCounts.set(loc.label, entry);
        }
      }
    }

    pinsLayer.innerHTML = '';
    statePinsLayer.innerHTML = '';
    let plotted = 0;

    for (const { loc, count } of stateCounts.values()) {
      plotted += 1;
      const { x, y } = project(loc.lat, loc.lon);
      addPin(statePinsLayer, x, y, count, loc.label, 'work-map-state-pin');
    }

    for (const [ref, count] of parkCounts) {
      const record = lookupPark(ref);
      if (!record || record.lat === undefined || record.lon === undefined) continue;
      plotted += 1;
      const { x, y } = project(record.lat, record.lon);
      addPin(pinsLayer, x, y, count, `${ref} -- ${record.name}${record.state ? `, ${record.state}` : ''}`, 'work-map-pin');
    }

    emptyMsg.classList.toggle('hidden', plotted > 0);
  }

  loadParks().then(update);
  return { update };
}
