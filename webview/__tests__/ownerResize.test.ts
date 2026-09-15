import { describe, expect, it } from 'vitest';
import { MIN_SIZE, resizedBounds, resizeHandleCenters } from '../ownerResize.js';

const START = { x: 100, y: 100, width: 200, height: 100 };

describe('resizedBounds', () => {
  it('bottom-right: only width/height grow toward the pointer, origin fixed', () => {
    expect(resizedBounds(START, 'bottom-right', { x: 360, y: 260 })).toEqual({ x: 100, y: 100, width: 260, height: 160 });
  });

  it('top-left: origin follows the pointer, the opposite corner stays put', () => {
    expect(resizedBounds(START, 'top-left', { x: 60, y: 70 })).toEqual({ x: 60, y: 70, width: 240, height: 130 });
  });

  it('right: only width changes', () => {
    expect(resizedBounds(START, 'right', { x: 250, y: 999 })).toEqual({ x: 100, y: 100, width: 150, height: 100 });
  });

  it('top: only y/height change', () => {
    expect(resizedBounds(START, 'top', { x: 999, y: 140 })).toEqual({ x: 100, y: 140, width: 200, height: 60 });
  });

  it('left: only x/width change', () => {
    expect(resizedBounds(START, 'left', { x: 150, y: 0 })).toEqual({ x: 150, y: 100, width: 150, height: 100 });
  });

  it('bottom-left: x follows, right edge fixed, height grows', () => {
    expect(resizedBounds(START, 'bottom-left', { x: 80, y: 300 })).toEqual({ x: 80, y: 100, width: 220, height: 200 });
  });

  it('clamps each axis to MIN_SIZE and flips the origin when dragged past the fixed edge', () => {
    // drag the bottom-right corner up-left past the top-left origin
    const b = resizedBounds(START, 'bottom-right', { x: 100 - 5, y: 100 - 5 });
    expect(b.width).toBe(MIN_SIZE);
    expect(b.height).toBe(MIN_SIZE);
    // fixed corner is the original top-left (100,100); pointer is above-left of
    // it, so the box sits to its left/up, MIN_SIZE wide/tall
    expect(b.x).toBe(95);
    expect(b.y).toBe(95);
  });

  it('respects a custom minimum', () => {
    expect(resizedBounds(START, 'right', { x: 100, y: 0 }, 40).width).toBe(40);
  });
});

describe('resizeHandleCenters', () => {
  it('places 8 handles at the corners and edge midpoints', () => {
    const centers = resizeHandleCenters(START);
    expect(centers).toHaveLength(8);
    const byName = Object.fromEntries(centers.map(([x, y, name]) => [name, [x, y]]));
    expect(byName['top-left']).toEqual([100, 100]);
    expect(byName['bottom-right']).toEqual([300, 200]);
    expect(byName['top']).toEqual([200, 100]);
    expect(byName['left']).toEqual([100, 150]);
  });
});
