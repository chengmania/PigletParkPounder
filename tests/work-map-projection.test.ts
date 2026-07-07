import { describe, expect, test } from 'bun:test';
import { project } from '../src/client/work-map.ts';

// Expected pixel positions were derived by calibrating against public/world-map.svg's
// own drawn coastlines (not the naive assumption that the file's viewBox is a tight
// -180..180/-90..90 grid -- it isn't, see the calibration note in work-map.ts). A prior
// version of project() used that naive assumption and placed pins tens of degrees off
// (e.g. California's centroid landed in Kansas); these checks pin the calibrated
// constants in place so that regression can't silently reappear.
describe('project', () => {
  test('California centroid lands on the California coast/valley, not further east', () => {
    const { x, y } = project(36.778261, -119.417932);
    expect(x).toBeCloseTo(357.06, 0);
    expect(y).toBeCloseTo(474.63, 0);
  });

  test('Pennsylvania centroid lands in the mid-Atlantic, not off the Nova Scotia coast', () => {
    const { x, y } = project(41.203322, -77.194525);
    expect(x).toBeCloseTo(679.93, 0);
    expect(y).toBeCloseTo(440.32, 0);
  });

  test('Tokyo lands in Japan', () => {
    const { x, y } = project(35.6762, 139.6503);
    expect(x).toBeCloseTo(2338.05, 0);
    expect(y).toBeCloseTo(483.17, 0);
  });

  test('longitude increases left-to-right and latitude increases bottom-to-top (never flipped)', () => {
    const west = project(40, -100);
    const east = project(40, -90);
    expect(east.x).toBeGreaterThan(west.x);

    const south = project(30, 0);
    const north = project(40, 0);
    expect(north.y).toBeLessThan(south.y);
  });
});
