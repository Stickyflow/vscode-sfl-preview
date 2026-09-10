import { describe, expect, it } from 'vitest';
import { applyRouteChange, nextRoute, ROUTES } from '../linkRoute';

describe('nextRoute', () => {
  it('cycles orthogonal -> curved -> straight -> orthogonal', () => {
    expect(nextRoute('orthogonal')).toBe('curved');
    expect(nextRoute('curved')).toBe('straight');
    expect(nextRoute('straight')).toBe('orthogonal');
  });

  it('starts the cycle for an unknown or absent current route', () => {
    expect(nextRoute(undefined)).toBe(ROUTES[0]);
    expect(nextRoute(null)).toBe(ROUTES[0]);
    expect(nextRoute('elbow')).toBe(ROUTES[0]);
  });
});

describe('applyRouteChange', () => {
  it('replaces an existing direct route on its own line, indentation kept', () => {
    const sfl = [
      'sfl 1.2',
      'Model M {',
      '  Link e {',
      '    from: a, right (0.5)',
      '    route: orthogonal',
      '    to: b, left (0.5)',
      '  }',
      '}',
    ].join('\n');
    const next = applyRouteChange(sfl, 'e', 'curved');
    expect(next).toContain('    route: curved');
    expect(next).not.toContain('route: orthogonal');
    expect(next.match(/route:/g)).toHaveLength(1);
    expect(next).toContain('    from: a, right (0.5)'); // untouched sibling
  });

  it('replaces a route packed onto the header line', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e { route: straight; from: a; to: b }\n}\n';
    const next = applyRouteChange(sfl, 'e', 'orthogonal');
    expect(next).toContain('Link e { route: orthogonal; from: a; to: b }');
    expect(next.match(/route:/g)).toHaveLength(1);
  });

  it('inserts route on its own line for a multi-line block that has none', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e {\n    from: a, right (0.5)\n    to: b, left (0.5)\n  }\n}\n';
    const next = applyRouteChange(sfl, 'e', 'curved');
    expect(next).toBe(
      'sfl 1.2\nModel M {\n  Link e {\n    route: curved\n    from: a, right (0.5)\n    to: b, left (0.5)\n  }\n}\n',
    );
  });

  it('inserts route into a one-line block, before the closing brace', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e { from: a; to: b }\n}\n';
    const next = applyRouteChange(sfl, 'e', 'straight');
    expect(next).toContain('  Link e { from: a; to: b; route: straight }');
  });

  it('inserts route into an empty one-line block without a stray semicolon', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e { }\n}\n';
    const next = applyRouteChange(sfl, 'e', 'straight');
    expect(next).toContain('  Link e { route: straight }');
  });

  it('replaces a tightly-packed route with no space before the closing brace', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e {route: orthogonal}\n}\n';
    const next = applyRouteChange(sfl, 'e', 'curved');
    expect(next).toContain('  Link e {route: curved}');
    expect(next.match(/route:/g)).toHaveLength(1);
  });

  it('adds a direct override rather than touching a route inside a nested style block', () => {
    const sfl = [
      'sfl 1.2',
      'Model M {',
      '  Link e {',
      '    from: a',
      '    to: b',
      '    style {',
      '      route: orthogonal',
      '      stroke: "#000"',
      '    }',
      '  }',
      '}',
    ].join('\n');
    const next = applyRouteChange(sfl, 'e', 'curved');
    expect(next).toContain('      route: orthogonal'); // nested one untouched
    expect(next).toContain('    route: curved'); // new direct override
    expect(next.match(/route:/g)).toHaveLength(2);
  });

  it('is a no-op when the link already routes that way', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e {\n    route: curved\n    from: a\n    to: b\n  }\n}\n';
    expect(applyRouteChange(sfl, 'e', 'curved')).toBe(sfl);
  });

  it('is a no-op for an unknown link id', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e {\n    from: a\n    to: b\n  }\n}\n';
    expect(applyRouteChange(sfl, 'missing', 'curved')).toBe(sfl);
  });

  it('is a no-op for a non-route value', () => {
    const sfl = 'sfl 1.2\nModel M {\n  Link e {\n    from: a\n    to: b\n  }\n}\n';
    expect(applyRouteChange(sfl, 'e', 'elbow' as never)).toBe(sfl);
  });

  it('ignores the word Link inside a string value', () => {
    const sfl = [
      'sfl 1.2',
      'Model M {',
      '  Entity a { text: "Link e { route: curved }" }',
      '  Link e {',
      '    from: a',
      '    to: b',
      '  }',
      '}',
    ].join('\n');
    const next = applyRouteChange(sfl, 'e', 'straight');
    expect(next).toContain('text: "Link e { route: curved }"'); // string body untouched
    expect(next).toContain('    route: straight');
    expect(next.match(/route: straight/g)).toHaveLength(1);
  });

  it('changes only the targeted link when several are present', () => {
    const sfl = [
      'sfl 1.2',
      'Model M {',
      '  Link e1 { from: a; to: b }',
      '  Link e2 { from: b; to: c }',
      '  Link e3 { from: c; to: d }',
      '}',
    ].join('\n');
    const next = applyRouteChange(sfl, 'e2', 'curved');
    expect(next).toContain('  Link e1 { from: a; to: b }');
    expect(next).toContain('  Link e2 { from: b; to: c; route: curved }');
    expect(next).toContain('  Link e3 { from: c; to: d }');
  });

  it('preserves comments and blank lines around the edit', () => {
    const sfl = [
      'sfl 1.2',
      '',
      '// the main flow link',
      'Model M {',
      '  Link e {',
      '    from: a // start',
      '    to: b',
      '  }',
      '}',
      '',
    ].join('\n');
    const next = applyRouteChange(sfl, 'e', 'curved');
    expect(next).toContain('// the main flow link');
    expect(next).toContain('    from: a // start');
    expect(next).toContain('    route: curved');
  });
});
