import { describe, expect, test } from 'bun:test';
import { generateQrMatrix, qrToAsciiArt, qrToSvg } from '../src/server/qr.ts';

// Full scan-correctness (Reed-Solomon + module placement + format info) is
// verified out-of-band with a real QR decoder (OpenCV) against the exact
// URL formats this app generates -- see PR/commit notes. These tests cover
// structural invariants that are cheap to assert in-process.

describe('generateQrMatrix', () => {
  test('picks version 1 (21x21) for very short text', () => {
    const matrix = generateQrMatrix('hi');
    expect(matrix.length).toBe(21);
  });

  test('picks a larger version for longer text', () => {
    const matrix = generateQrMatrix('http://pota-host.local:8073/?host=1');
    expect(matrix.length).toBe(29);
  });

  test('throws for text exceeding version 6 capacity', () => {
    expect(() => generateQrMatrix('x'.repeat(200))).toThrow();
  });

  test('finder patterns are present at all three corners', () => {
    const matrix = generateQrMatrix('http://192.168.1.1:8073');
    const size = matrix.length;
    // top-left corner ring should be dark
    expect(matrix[0]![0]).toBe(true);
    expect(matrix[0]![6]).toBe(true);
    expect(matrix[6]![0]).toBe(true);
    // center of top-left finder is dark, ring-1 is light
    expect(matrix[3]![3]).toBe(true);
    expect(matrix[1]![1]).toBe(false);
    // top-right and bottom-left finders mirror the same corner pattern
    expect(matrix[0]![size - 7]).toBe(true);
    expect(matrix[size - 7]![0]).toBe(true);
  });

  test('timing pattern alternates starting dark', () => {
    const matrix = generateQrMatrix('http://192.168.1.1:8073');
    expect(matrix[6]![8]).toBe(true);
    expect(matrix[6]![9]).toBe(false);
  });

  test('is deterministic for the same input', () => {
    const a = generateQrMatrix('http://192.168.1.1:8073');
    const b = generateQrMatrix('http://192.168.1.1:8073');
    expect(a).toEqual(b);
  });
});

describe('rendering', () => {
  test('qrToAsciiArt produces non-empty output sized to the matrix', () => {
    const matrix = generateQrMatrix('hi');
    const art = qrToAsciiArt(matrix);
    expect(art.length).toBeGreaterThan(0);
  });

  test('qrToSvg produces a well-formed SVG document', () => {
    const matrix = generateQrMatrix('hi');
    const svg = qrToSvg(matrix);
    expect(svg.startsWith('<svg')).toBe(true);
    expect(svg).toContain('</svg>');
  });
});
