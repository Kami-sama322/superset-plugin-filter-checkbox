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
import { getColumnLabel, SupersetClient } from '@superset-ui/core';
import { DataRecordValue, valueKey } from './utils';

const NATIVE_FILTER_PREFIX = 'NATIVE_FILTER-';

export type CrossFilterClause = {
  col?: string | { label?: string; sqlExpression?: string };
  op?: string;
  val?: unknown;
};

export type CrossFilterDataMaskEntry = {
  extraFormData?: {
    filters?: CrossFilterClause[];
  };
};

export type ChartMeta = {
  form_data?: {
    datasource?: string;
  };
};

function clauseColumnName(col: CrossFilterClause['col']): string {
  if (!col) {
    return '';
  }
  if (typeof col === 'string') {
    return col;
  }
  try {
    return getColumnLabel(col as Parameters<typeof getColumnLabel>[0]);
  } catch {
    return col.label || (col as { column_name?: string }).column_name || '';
  }
}

function normalizeDatasourceKey(datasource?: string): string {
  if (!datasource) {
    return '';
  }
  // "12__table" / "12" → "12"
  return String(datasource).split('__')[0];
}

/** Table cross-filters may nest values as [[v]]; flatten one level. */
export function flattenFilterValues(val: unknown): unknown[] {
  if (val === undefined || val === null) {
    return [];
  }
  const top = Array.isArray(val) ? val : [val];
  const out: unknown[] = [];
  top.forEach(item => {
    if (Array.isArray(item)) {
      item.forEach(inner => out.push(inner));
    } else {
      out.push(item);
    }
  });
  return out;
}

/**
 * Collect filter clauses from chart cross-filters that share our dataset.
 * Chart may filter on any column(s); we later resolve our filter column
 * under those clauses.
 */
export function collectSameDatasetChartFilters(
  dataMask:
    | Record<string, CrossFilterDataMaskEntry | undefined>
    | null
    | undefined,
  charts: Record<string, ChartMeta | undefined> | null | undefined,
  ourDatasource?: string,
): { active: boolean; filters: CrossFilterClause[]; signature: string } {
  if (!dataMask) {
    return { active: false, filters: [], signature: '' };
  }

  const ourKey = normalizeDatasourceKey(ourDatasource);
  const filters: CrossFilterClause[] = [];

  Object.entries(dataMask).forEach(([id, mask]) => {
    if (String(id).startsWith(NATIVE_FILTER_PREFIX)) {
      return;
    }
    const chartFilters = mask?.extraFormData?.filters;
    if (!chartFilters?.length) {
      return;
    }

    if (ourKey) {
      const chartDs = normalizeDatasourceKey(
        charts?.[id]?.form_data?.datasource,
      );
      // If chart meta is missing, still accept (better sync than skip).
      if (chartDs && chartDs !== ourKey) {
        return;
      }
    }

    chartFilters.forEach(clause => {
      if (!clauseColumnName(clause.col)) {
        return;
      }
      filters.push(clause);
    });
  });

  const signature = JSON.stringify(
    filters.map(f => ({
      col: clauseColumnName(f.col),
      op: f.op,
      val: f.val,
    })),
  );

  return {
    active: filters.length > 0,
    filters,
    signature,
  };
}

/**
 * Direct values when chart filters already target our column.
 */
export function valuesFromMatchingColumn(
  filters: CrossFilterClause[],
  column: string,
): DataRecordValue[] | null {
  const matching = filters.filter(f => clauseColumnName(f.col) === column);
  if (!matching.length) {
    return null;
  }

  const values: DataRecordValue[] = [];
  const seen = new Set<string>();
  matching.forEach(clause => {
    if (clause.op === 'IS NULL') {
      const key = valueKey(null);
      if (!seen.has(key)) {
        seen.add(key);
        values.push(null);
      }
      return;
    }
    flattenFilterValues(clause.val).forEach(raw => {
      const typed = raw as DataRecordValue;
      const key = valueKey(typed);
      if (!seen.has(key)) {
        seen.add(key);
        values.push(typed);
      }
    });
  });
  return values;
}

const UNARY_OPS = new Set(['IS NULL', 'IS NOT NULL']);
const SET_OPS = new Set(['IN', 'NOT IN']);
const BINARY_OPS = new Set([
  '==',
  '!=',
  '>',
  '<',
  '>=',
  '<=',
  'ILIKE',
  'LIKE',
  'NOT LIKE',
  'REGEX',
]);

export type ChartDataFilterClause =
  | { col: string; op: 'IS NULL' | 'IS NOT NULL' }
  | {
      col: string;
      op: string;
      val: string | number | boolean | null | (string | number | boolean | null)[];
    };

/** Map a dashboard cross-filter clause to a chart/data filter clause. */
export function toChartDataFilterClause(
  clause: CrossFilterClause,
): ChartDataFilterClause | null {
  const col = clauseColumnName(clause.col);
  if (!col) {
    return null;
  }
  const op = String(clause.op || 'IN').toUpperCase();
  if (UNARY_OPS.has(op)) {
    return { col, op: op as 'IS NULL' | 'IS NOT NULL' };
  }
  const flat = flattenFilterValues(clause.val).filter(
    v => v !== undefined,
  ) as (string | number | boolean | null)[];
  if (SET_OPS.has(op)) {
    if (!flat.length) {
      return null;
    }
    return { col, op, val: flat };
  }
  if (BINARY_OPS.has(op)) {
    if (!flat.length) {
      return null;
    }
    return { col, op, val: flat[0] };
  }
  // Unknown ops: skip rather than coerce to IN.
  return null;
}

/**
 * Distinct values of `column` that remain after applying arbitrary
 * chart cross-filter clauses (any columns of the same dataset).
 */
export async function fetchColumnValuesForFilters(params: {
  datasource: string;
  column: string;
  filters: CrossFilterClause[];
  rowLimit?: number;
}): Promise<DataRecordValue[]> {
  const { datasource, column, filters, rowLimit = 10000 } = params;
  const [idPart, typePart] = String(datasource).split('__');
  const datasourceId = Number(idPart);
  const datasourceType = typePart || 'table';
  if (!datasourceId || Number.isNaN(datasourceId)) {
    return [];
  }

  const queryFilters = filters
    .map(toChartDataFilterClause)
    .filter((clause): clause is ChartDataFilterClause => clause !== null);

  const { json } = await SupersetClient.post({
    endpoint: '/api/v1/chart/data',
    jsonPayload: {
      datasource: { id: datasourceId, type: datasourceType },
      force: false,
      queries: [
        {
          columns: [column],
          filters: queryFilters,
          metrics: [],
          orderby: [[column, true]],
          row_limit: rowLimit,
        },
      ],
      result_format: 'json',
      result_type: 'full',
    },
  });

  const rows = (json?.result?.[0]?.data || []) as Record<string, unknown>[];
  const values: DataRecordValue[] = [];
  const seen = new Set<string>();
  rows.forEach(row => {
    const raw =
      (row?.[column] as DataRecordValue) ??
      (Object.values(row || [])[0] as DataRecordValue);
    const key = valueKey(raw);
    if (!seen.has(key)) {
      seen.add(key);
      values.push(raw);
    }
  });
  return values;
}

/**
 * Same-column chart filters → values directly; otherwise query distinct
 * values of our column under the chart clauses.
 */
export async function resolveColumnValuesForFilters(params: {
  datasource: string;
  column: string;
  filters: CrossFilterClause[];
  rowLimit?: number;
}): Promise<DataRecordValue[]> {
  const onlyOurColumn =
    params.filters.length > 0 &&
    params.filters.every(f => clauseColumnName(f.col) === params.column);
  if (onlyOurColumn) {
    const direct = valuesFromMatchingColumn(params.filters, params.column);
    if (direct) {
      return direct;
    }
  }
  return fetchColumnValuesForFilters(params);
}

/**
 * Map resolved chart values to checkbox selection.
 * - normal: select the resolved values
 * - inverse: select everything else (resolved stay unmarked; × on others)
 */
export function selectionFromCrossFilter(params: {
  crossFilterValues: DataRecordValue[];
  allOptionValues: DataRecordValue[];
  inverseSelection: boolean;
  multiSelect: boolean;
}): DataRecordValue[] {
  const {
    crossFilterValues,
    allOptionValues,
    inverseSelection,
    multiSelect,
  } = params;

  if (!crossFilterValues.length) {
    return [];
  }

  const resolvedKeys = new Set(crossFilterValues.map(valueKey));
  let next: DataRecordValue[];

  if (inverseSelection) {
    next = allOptionValues.filter(value => !resolvedKeys.has(valueKey(value)));
  } else {
    const allowed = new Set(allOptionValues.map(valueKey));
    const intersection = crossFilterValues.filter(v =>
      allowed.has(valueKey(v)),
    );
    next = intersection.length ? intersection : [...crossFilterValues];
  }

  if (!multiSelect && next.length > 1) {
    return [next[0]];
  }
  return next;
}
