/**
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements.  See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership.  The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License.  You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied.  See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

export type DataRecordValue = string | number | boolean | Date | null | undefined;

export type DataRecord = Record<string, DataRecordValue>;

export interface ExtraFormData {
  filters?: {
    col: string;
    op: 'IN' | 'NOT IN' | string;
    val: (string | number | boolean | null)[];
  }[];
  adhoc_filters?: {
    expressionType: string;
    clause: string;
    sqlExpression: string;
  }[];
}

function ensureIsArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

export const getSelectExtraFormData = (
  col: string,
  value?: null | (string | number | boolean | null)[],
  emptyFilter = false,
  shouldExcludeFilter = false,
): ExtraFormData => {
  const extra: ExtraFormData = {};
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
};

export function formatDataRecordValue(value: DataRecordValue): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return String(value);
}

export function valueKey(value: DataRecordValue): string {
  if (value === null || value === undefined) {
    return '__null__';
  }
  return String(value);
}

export function filterDisplayValues(
  data: DataRecord[],
  col: string,
  displayValues: (string | number)[] | null | undefined,
): DataRecord[] {
  const allowed = ensureIsArray(displayValues);
  if (allowed.length === 0) {
    return data;
  }
  const allowedSet = new Set(allowed.map(v => valueKey(v as DataRecordValue)));
  return data.filter(row => allowedSet.has(valueKey(row[col])));
}

export function filterBySearch(
  data: DataRecord[],
  col: string,
  search: string,
): DataRecord[] {
  const needle = search.trim().toLowerCase();
  if (!needle) {
    return data;
  }
  return data.filter(row =>
    formatDataRecordValue(row[col]).toLowerCase().includes(needle),
  );
}

export function sortRows(
  data: DataRecord[],
  col: string,
  sortAscending: boolean,
): DataRecord[] {
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

export function uniqueColumnValues(
  data: DataRecord[],
  col: string,
): DataRecordValue[] {
  const seen = new Set<string>();
  const values: DataRecordValue[] = [];
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
