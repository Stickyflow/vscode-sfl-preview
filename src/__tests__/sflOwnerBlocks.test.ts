import { describe, expect, it } from 'vitest';
import { findEnclosingOwnerId, findOwnerRange } from '../sflOwnerBlocks';

// Same board as the vision paper's Listing 1 motivating example.
const BOARD = `sfl 1.2

Layout SlotSize { size: 288, 130 }

Style PillStyle { shape: pill; stroke: "#bbff00"; fontSize: 26 }

Model board {
  text: "Board"

  Entity documents_received : PillStyle & SlotSize {
    kind: process
    text: "Documents received"
    layout {
      position: 120, 100
      order: 1
    }
  }

  Entity documents_complete : PillStyle & SlotSize {
    kind: decision
    text: "Documents complete?"
    layout {
      position: 520, 100
      order: 0
    }
    style {
      dash: [5, 5]
    }
  }

  Link check_documents {
    from: documents_received, right (0.5)
    to: documents_complete, left (0.5)
  }
}`;

describe('findOwnerRange', () => {
  it('finds a top-level Entity block by id', () => {
    const lines = BOARD.split('\n');
    const range = findOwnerRange(lines, 'documents_received');
    expect(range).not.toBeNull();
    expect(lines[range!.start]).toContain('Entity documents_received');
    expect(lines[range!.end].trim()).toBe('}');
  });

  it('finds a Link block by id', () => {
    const lines = BOARD.split('\n');
    const range = findOwnerRange(lines, 'check_documents');
    expect(range).not.toBeNull();
    expect(lines[range!.start]).toContain('Link check_documents');
  });

  it('returns null for an unknown id', () => {
    expect(findOwnerRange(BOARD.split('\n'), 'does_not_exist')).toBeNull();
  });

  it('ignores braces inside string values and comments', () => {
    const src = [
      'Entity a {',
      '  text: "contains { and } characters"',
      '  // a comment with a stray brace }',
      '  layout { position: 0, 0 }',
      '}',
      'Entity b {',
      '  text: "second"',
      '}',
    ].join('\n');
    const lines = src.split('\n');
    expect(findOwnerRange(lines, 'a')).toEqual({ start: 0, end: 4 });
    expect(findOwnerRange(lines, 'b')).toEqual({ start: 5, end: 7 });
  });
});

describe('findEnclosingOwnerId', () => {
  it('finds the entity enclosing a line inside its body', () => {
    const lines = BOARD.split('\n');
    const line = lines.findIndex((l) => l.includes('Documents complete?'));
    expect(findEnclosingOwnerId(lines, line)).toBe('documents_complete');
  });

  it('returns null for a line outside any owner block', () => {
    const lines = BOARD.split('\n');
    expect(findEnclosingOwnerId(lines, 1)).toBeNull(); // blank line after `sfl 1.2`
  });

  it('resolves to the innermost owner for nested blocks', () => {
    const src = [
      'Container frame_a {',
      '  kind: frame',
      '  Entity child {',
      '    text: "inside"',
      '    layout { position: 0, 0 }',
      '  }',
      '}',
    ].join('\n');
    const lines = src.split('\n');
    const childLine = lines.findIndex((l) => l.includes('inside'));
    expect(findEnclosingOwnerId(lines, childLine)).toBe('child');

    // A line inside the container's own body but outside the nested child
    // (its `kind:` property) should resolve to the container itself.
    const kindLine = lines.findIndex((l) => l.includes('kind: frame'));
    expect(findEnclosingOwnerId(lines, kindLine)).toBe('frame_a');
  });
});
