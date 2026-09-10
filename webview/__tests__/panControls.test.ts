import { describe, expect, it } from 'vitest';
import { panGesture, wheelPanDelta, wheelPixels } from '../panControls.js';

describe('panGesture', () => {
  it('middle button is always a pan', () => {
    expect(panGesture(1, false, false, false)).toBe('middle');
    expect(panGesture(1, false, false, true)).toBe('middle'); // even over a shape
  });

  it('left button pans only off the background', () => {
    expect(panGesture(0, false, false, false)).toBe('background');
    expect(panGesture(0, false, false, true)).toBe('none'); // on a shape/handle
  });

  it('leaves Ctrl / Cmd presses to the viewer’s own pan path', () => {
    expect(panGesture(0, true, false, false)).toBe('none');
    expect(panGesture(1, false, true, false)).toBe('none');
  });

  it('ignores right button and other buttons', () => {
    expect(panGesture(2, false, false, false)).toBe('none');
  });
});

describe('wheelPixels', () => {
  it('passes pixel-mode deltas through', () => {
    expect(wheelPixels(-3, 40, 0)).toEqual({ x: -3, y: 40 });
  });

  it('scales line- and page-mode deltas up', () => {
    expect(wheelPixels(0, 3, 1)).toEqual({ x: 0, y: 48 });
    expect(wheelPixels(0, 1, 2)).toEqual({ x: 0, y: 400 });
  });
});

describe('wheelPanDelta', () => {
  it('scrolls the view opposite the wheel (content follows the wheel)', () => {
    expect(wheelPanDelta(0, 30, 0, false)).toEqual({ dx: 0, dy: -30 });
    expect(wheelPanDelta(-12, 0, 0, false)).toEqual({ dx: 12, dy: 0 });
  });

  it('maps Shift + vertical wheel to horizontal panning', () => {
    expect(wheelPanDelta(0, 30, 0, true)).toEqual({ dx: -30, dy: 0 });
  });

  it('keeps a real horizontal delta horizontal even with Shift held', () => {
    expect(wheelPanDelta(-10, 4, 0, true)).toEqual({ dx: 10, dy: -4 });
  });
});
