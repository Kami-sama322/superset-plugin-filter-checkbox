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
