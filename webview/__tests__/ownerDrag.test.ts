import { describe, expect, it } from 'vitest';
import { pastThreshold, SUPPLEMENTAL_MOVE_ROLES, userDelta, withTranslate } from '../ownerDrag';

describe('SUPPLEMENTAL_MOVE_ROLES', () => {
  it('covers the roles bindEditing() will not drag, and excludes the ones it owns', () => {
    for (const role of ['frame', 'swimlane', 'table', 'chart']) {
      expect(SUPPLEMENTAL_MOVE_ROLES.has(role)).toBe(true);
    }
    for (const role of ['entity', 'link', 'path']) {
      expect(SUPPLEMENTAL_MOVE_ROLES.has(role)).toBe(false);
    }
  });
});

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

describe('pastThreshold', () => {
  it('is false below the default 3px and true at or beyond it', () => {
    expect(pastThreshold(0, 0, 2, 1)).toBe(false); // hypot ~2.24
    expect(pastThreshold(10, 10, 12, 12)).toBe(false); // hypot ~2.83
    expect(pastThreshold(0, 0, 3, 0)).toBe(true);
    expect(pastThreshold(0, 0, 30, 40)).toBe(true); // hypot 50
  });

  it('respects a custom threshold', () => {
    expect(pastThreshold(0, 0, 5, 0, 10)).toBe(false);
    expect(pastThreshold(0, 0, 10, 0, 10)).toBe(true);
  });
});

describe('withTranslate', () => {
  it('prepends a translate, keeping any existing transform', () => {
    expect(withTranslate(null, 5, -3)).toBe('translate(5 -3)');
    expect(withTranslate('rotate(10)', 5, -3)).toBe('translate(5 -3) rotate(10)');
  });
});
