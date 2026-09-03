/**
 * Smoke tests for utils (plain Node, no TSX).
 * Run: node src/utils.test.mjs
 */
import assert from 'node:assert/strict';

function ensureIsArray(value) {
  if (value === null || value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function getSelectExtraFormData(
  col,
  value,
  emptyFilter = false,
  shouldExcludeFilter = false,
) {
  const extra = {};
  if (emptyFilter) {
    extra.adhoc_filters = [
      {
        expressionType: 'SQL',
        clause: 'WHERE',
        sqlExpression: '1 = 0',
      },
    ];
  } else if (value !== undefined && value !== null && value.length !== 0) {
    extra.filters = [
      {
        col,
        op: shouldExcludeFilter ? 'NOT IN' : 'IN',
        val: value,
      },
    ];
  }
  return extra;
}

function formatDataRecordValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return String(value);
}

function valueKey(value) {
  if (value === null || value === undefined) return '__null__';
  return String(value);
}

function filterDisplayValues(data, col, displayValues) {
  const allowed = ensureIsArray(displayValues);
  if (allowed.length === 0) return data;
  const allowedSet = new Set(allowed.map(v => valueKey(v)));
  return data.filter(row => allowedSet.has(valueKey(row[col])));
}

function filterBySearch(data, col, search) {
  const needle = search.trim().toLowerCase();
  if (!needle) return data;
  return data.filter(row =>
    formatDataRecordValue(row[col]).toLowerCase().includes(needle),
  );
}

function sortRows(data, col, sortAscending) {
  const sorted = [...data].sort((a, b) => {
    const left = formatDataRecordValue(a[col]);
    const right = formatDataRecordValue(b[col]);
    return left.localeCompare(right, undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  });
  return sortAscending ? sorted : sorted.reverse();
}

function uniqueColumnValues(data, col) {
  const seen = new Set();
  const values = [];
  data.forEach(row => {
    const raw = row[col];
    const key = valueKey(raw);
    if (!seen.has(key)) {
      seen.add(key);
      values.push(raw);
    }
  });
  return values;
}

assert.deepEqual(getSelectExtraFormData('city', ['NYC', 'LA'], false, false), {
  filters: [{ col: 'city', op: 'IN', val: ['NYC', 'LA'] }],
});
assert.deepEqual(getSelectExtraFormData('city', ['NYC'], false, true), {
  filters: [{ col: 'city', op: 'NOT IN', val: ['NYC'] }],
});
assert.deepEqual(getSelectExtraFormData('city', [], false, false), {});
assert.equal(
  getSelectExtraFormData('city', [], true, false).adhoc_filters[0].sqlExpression,
  '1 = 0',
);
assert.equal(formatDataRecordValue(null), 'NULL');
assert.equal(valueKey(null), '__null__');

const rows = [{ c: 'b' }, { c: 'a' }, { c: 'b' }, { c: 'c' }];
assert.deepEqual(uniqueColumnValues(rows, 'c'), ['b', 'a', 'c']);
assert.deepEqual(filterDisplayValues(rows, 'c', []), rows);
assert.deepEqual(filterDisplayValues(rows, 'c', ['a', 'c']), [
  { c: 'a' },
  { c: 'c' },
]);
assert.deepEqual(filterBySearch(rows, 'c', 'A'), [{ c: 'a' }]);
assert.deepEqual(
  sortRows([{ c: 'b' }, { c: 'a' }], 'c', true).map(r => r.c),
  ['a', 'b'],
);
assert.deepEqual(
  sortRows([{ c: 'b' }, { c: 'a' }], 'c', false).map(r => r.c),
  ['b', 'a'],
);

console.log('utils.test.mjs: all assertions passed');

// --- crossFilterSync (inlined to avoid TS/import graph) ---
function extractChartCrossFilterValues(dataMask, column) {
  if (!dataMask || !column) return { active: false, values: [] };
  const values = [];
  const seen = new Set();
  let active = false;
  Object.entries(dataMask).forEach(([id, mask]) => {
    if (String(id).startsWith('NATIVE_FILTER-')) return;
    const filters = mask?.extraFormData?.filters;
    if (!filters?.length) return;
    filters.forEach(clause => {
      if (clause.col !== column) return;
      active = true;
      if (clause.op === 'IS NULL') {
        if (!seen.has('__null__')) { seen.add('__null__'); values.push(null); }
        return;
      }
      const rawValues = Array.isArray(clause.val) ? clause.val : clause.val === undefined ? [] : [clause.val];
      rawValues.forEach(raw => {
        const key = valueKey(raw);
        if (!seen.has(key)) { seen.add(key); values.push(raw); }
      });
    });
  });
  return { active, values };
}

function flattenFilterValues(val) {
  if (val === undefined || val === null) return [];
  const top = Array.isArray(val) ? val : [val];
  const out = [];
  top.forEach(item => {
    if (Array.isArray(item)) item.forEach(inner => out.push(inner));
    else out.push(item);
  });
  return out;
}

function selectionFromCrossFilter({
  crossFilterValues,
  allOptionValues,
  inverseSelection,
  multiSelect,
}) {
  if (!crossFilterValues.length) return [];
  const resolvedKeys = new Set(crossFilterValues.map(valueKey));
  let next;
  if (inverseSelection) {
    next = allOptionValues.filter(v => !resolvedKeys.has(valueKey(v)));
  } else {
    const allowed = new Set(allOptionValues.map(valueKey));
    const intersection = crossFilterValues.filter(v => allowed.has(valueKey(v)));
    next = intersection.length ? intersection : [...crossFilterValues];
  }
  if (!multiSelect && next.length > 1) return [next[0]];
  return next;
}

const UNARY_OPS = new Set(['IS NULL', 'IS NOT NULL']);
const SET_OPS = new Set(['IN', 'NOT IN']);
const BINARY_OPS = new Set(['==', '!=', '>', '<', '>=', '<=', 'ILIKE', 'LIKE', 'NOT LIKE', 'REGEX']);

function toChartDataFilterClause(clause) {
  const col = typeof clause.col === 'string' ? clause.col : clause.col?.label || '';
  if (!col) return null;
  const op = String(clause.op || 'IN').toUpperCase();
  if (UNARY_OPS.has(op)) return { col, op };
  const flat = flattenFilterValues(clause.val).filter(v => v !== undefined);
  if (SET_OPS.has(op)) return flat.length ? { col, op, val: flat } : null;
  if (BINARY_OPS.has(op)) return flat.length ? { col, op, val: flat[0] } : null;
  return null;
}

assert.deepEqual(
  extractChartCrossFilterValues({
    '42': { extraFormData: { filters: [{ col: 'region', op: 'IN', val: ['Волгоград'] }] } },
    'NATIVE_FILTER-x': { extraFormData: { filters: [{ col: 'region', op: 'IN', val: ['Ignored'] }] } },
  }, 'region'),
  { active: true, values: ['Волгоград'] },
);

assert.deepEqual(
  selectionFromCrossFilter({
    crossFilterValues: ['Волгоград'],
    allOptionValues: ['Москва', 'Волгоград', 'СПб'],
    inverseSelection: false,
    multiSelect: true,
  }),
  ['Волгоград'],
);

assert.deepEqual(
  selectionFromCrossFilter({
    crossFilterValues: ['Волгоград'],
    allOptionValues: ['Москва', 'Волгоград', 'СПб'],
    inverseSelection: true,
    multiSelect: true,
  }),
  ['Москва', 'СПб'],
);

assert.deepEqual(flattenFilterValues([['Юг'], ['Центр']]), ['Юг', 'Центр']);

assert.deepEqual(
  toChartDataFilterClause({ col: 'm', op: 'IN', val: [['Юг']] }),
  { col: 'm', op: 'IN', val: ['Юг'] },
);
assert.deepEqual(
  toChartDataFilterClause({ col: 'm', op: '==', val: ['X'] }),
  { col: 'm', op: '==', val: 'X' },
);
assert.equal(toChartDataFilterClause({ col: 'm', op: 'WEIRD', val: [1] }), null);
assert.deepEqual(
  toChartDataFilterClause({ col: 'm', op: 'IS NULL' }),
  { col: 'm', op: 'IS NULL' },
);

console.log('crossFilterSync assertions passed');
