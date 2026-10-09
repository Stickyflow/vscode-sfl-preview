// "Export TOON". TOON (Token-Oriented Object Notation, toonformat.dev) is a
// compact, line-based encoding of JSON data meant for LLM prompts: an array of
// uniform objects becomes one header naming the fields, then one comma-
// separated row per item. That suits a diagram's semantics well, so this
// exports what the diagram *says* (nodes, links, connections, groups), not
// its layout or styling: the .sfl itself is the full-fidelity format.
//
// Pure: stickyflow.js's canvas state in, TOON text out. Only the subset of
// TOON this needs is encoded (tabular arrays of primitives under top-level
// keys), following the spec's quoting rules so any TOON decoder reads it.

import type { CoreApi } from './stickyflow.js';

type CanvasState = ReturnType<CoreApi['sflToCanvasState']>;
type Group = CanvasState['groups'][number];
type Cell = string | number | null;

/** A diagram's semantic content as TOON. Columns empty in every row are
 *  dropped (a flow with no frames gets no `frame` column), and so are
 *  sections with no rows. */
export function diagramToToon(state: CanvasState): string {
  const groupOf = innermostGroups(state.groups);
  const sections: string[] = [];

  sections.push(
    table(
      'nodes',
      ['id', 'kind', 'shape', 'text', 'frame', 'group'],
      state.canvasObjects.map((object) => [
        object.id,
        object.kind || null,
        object.shapeType ?? null,
        object.text ?? null,
        object.parentFrameId ?? null,
        groupOf.get(object.id) ?? null,
      ]),
    ),
  );
  sections.push(
    table(
      'links',
      ['id', 'from', 'to', 'text', 'condition'],
      state.links.map((link) => [
        link.id,
        link.fromId ?? null,
        link.toId ?? null,
        link.text ?? null,
        link.props.condition ?? null,
      ]),
    ),
  );
  sections.push(
    table(
      'connections',
      ['id', 'from', 'to', 'fromFace', 'toFace'],
      state.connections.map((connection) => [
        connection.id,
        connection.fromId ?? null,
        connection.toId ?? null,
        connection.fromFace,
        connection.toFace,
      ]),
    ),
  );
  sections.push(
    table(
      'groups',
      ['id', 'name', 'parent'],
      flattenGroups(state.groups).map(({ group, parent }) => [group.id, group.name || null, parent]),
    ),
  );

  return sections.filter(Boolean).join('\n') + '\n';
}

/** `key[N]{a,b}:` then one indented row per item; '' for no rows. */
function table(key: string, fields: string[], rows: Cell[][]): string {
  if (rows.length === 0) return '';
  const keep = fields.map((_, column) => rows.some((row) => row[column] !== null));
  const header = fields.filter((_, column) => keep[column]);
  const lines = rows.map(
    (row) =>
      '  ' +
      row
        .filter((_, column) => keep[column])
        .map(encodeCell)
        .join(','),
  );
  return `${key}[${rows.length}]{${header.join(',')}}:\n${lines.join('\n')}`;
}

function encodeCell(value: Cell): string {
  if (value === null) return 'null';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'null';
  return needsQuotes(value) ? `"${escape(value)}"` : value;
}

/** TOON's quoting rules for a string in a comma-delimited row: anything that
 *  would read as something else (empty, padded, a number, a keyword, a list
 *  item, structure, the delimiter, or an escape) is quoted. */
function needsQuotes(value: string): boolean {
  return (
    value === '' ||
    value !== value.trim() ||
    value === 'true' ||
    value === 'false' ||
    value === 'null' ||
    /^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value) ||
    /^0\d/.test(value) ||
    value.startsWith('-') ||
    /[,:"\\[\]{}\n\r\t]/.test(value)
  );
}

function escape(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Object id -> the id of the innermost group that lists it. */
function innermostGroups(groups: Group[]): Map<string, string> {
  const byObject = new Map<string, string>();
  const visit = (group: Group) => {
    for (const id of group.canvasObjectIds) byObject.set(id, group.id);
    // Children after the parent, so the innermost assignment wins.
    group.subGroups.forEach(visit);
  };
  groups.forEach(visit);
  return byObject;
}

function flattenGroups(groups: Group[], parent: string | null = null): Array<{ group: Group; parent: string | null }> {
  return groups.flatMap((group) => [{ group, parent }, ...flattenGroups(group.subGroups, group.id)]);
}
