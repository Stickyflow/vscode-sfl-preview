import { describe, expect, it } from 'vitest';
import { userDelta, withTranslate } from '../ownerDrag.js';

describe('userDelta', () => {
  it('divides the screen delta by the SVG on-screen scale', () => {
    expect(userDelta(2, 2, 40, 20)).toEqual({ dx: 20, dy: 10 });
  });

  it('handles independent x/y scale', () => {
    expect(userDelta(4, 2, 40, 20)).toEqual({ dx: 10, dy: 10 });
  });

  it('falls back to 1:1 for a zero or missing scale', () => {
    expect(userDelta(0, 0, 15, -9)).toEqual({ dx: 15, dy: -9 });
  });
});

describe('withTranslate', () => {
  it('prepends a translate, keeping any existing transform', () => {
    expect(withTranslate(null, 5, -3)).toBe('translate(5 -3)');
    expect(withTranslate('rotate(10)', 5, -3)).toBe('translate(5 -3) rotate(10)');
  });
});
