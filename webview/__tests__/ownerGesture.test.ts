import { describe, expect, it } from 'vitest';
import { pastThreshold, SUPPLEMENTAL_OWNER_ROLES } from '../ownerGesture.js';

describe('SUPPLEMENTAL_OWNER_ROLES', () => {
  it('covers the roles stickyflow.js will not move or resize, and excludes the ones it owns', () => {
    for (const role of ['frame', 'swimlane', 'table', 'chart']) {
      expect(SUPPLEMENTAL_OWNER_ROLES.has(role)).toBe(true);
    }
    for (const role of ['entity', 'link', 'path']) {
      expect(SUPPLEMENTAL_OWNER_ROLES.has(role)).toBe(false);
    }
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
