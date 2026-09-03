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
import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';
import {
  collectSameDatasetChartFilters,
  resolveColumnValuesForFilters,
  selectionFromCrossFilter,
} from './crossFilterSync';
import { SelectValue } from './types';
import { DataRecordValue, valueKey } from './utils';

type UpdateDataMask = (
  values: SelectValue,
  options?: { excludeSelection?: boolean },
) => void;

function optionsSignature(values: DataRecordValue[]): string {
  return values.map(valueKey).sort().join('|');
}

/**
 * Mirror same-dataset chart cross-filters onto checkbox selection.
 * Resolves our column under chart clauses (any columns).
 */
export function useCrossFilterSync(params: {
  col?: string;
  datasource?: string;
  multiSelect: boolean;
  inverseSelection: boolean;
  allOptionValues: DataRecordValue[];
  selectedValues: DataRecordValue[];
  updateDataMask: UpdateDataMask;
}): void {
  const {
    col,
    datasource,
    multiSelect,
    inverseSelection,
    allOptionValues,
    selectedValues,
    updateDataMask,
  } = params;

  const dashboardDataMask = useSelector(
    (state: { dataMask?: Record<string, unknown> }) => state?.dataMask,
  );
  const charts = useSelector(
    (state: {
      charts?: Record<string, { form_data?: { datasource?: string } }>;
    }) => state?.charts,
  );

  const snapshot = useMemo(
    () =>
      collectSameDatasetChartFilters(
        dashboardDataMask as Record<
          string,
          { extraFormData?: { filters?: unknown[] } }
        >,
        charts,
        datasource,
      ),
    [dashboardDataMask, charts, datasource],
  );

  const lastAppliedSyncKeyRef = useRef<string | null>(null);
  const wasActiveRef = useRef(false);
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const updateDataMaskRef = useRef(updateDataMask);
  updateDataMaskRef.current = updateDataMask;
  const allOptionValuesRef = useRef(allOptionValues);
  allOptionValuesRef.current = allOptionValues;
  const selectedValuesRef = useRef(selectedValues);
  selectedValuesRef.current = selectedValues;

  const optionsKey = optionsSignature(allOptionValues);
  const { active, signature } = snapshot;

  useEffect(() => {
    if (!col || !datasource) {
      return undefined;
    }

    if (!active) {
      if (wasActiveRef.current) {
        wasActiveRef.current = false;
        lastAppliedSyncKeyRef.current = null;
        updateDataMaskRef.current(null);
      }
      return undefined;
    }

    // Include optionsKey so we re-apply after option list finishes loading.
    const syncKey = `${signature}|multi:${multiSelect}|inv:${inverseSelection}|opts:${optionsKey}`;
    if (syncKey === lastAppliedSyncKeyRef.current) {
      return undefined;
    }

    wasActiveRef.current = true;
    let cancelled = false;
    const requestId = syncKey;
    const { filters } = snapshotRef.current;

    resolveColumnValuesForFilters({
      datasource,
      column: col,
      filters,
    })
      .then(resolved => {
        if (cancelled || !snapshotRef.current.active) {
          return;
        }
        const next = selectionFromCrossFilter({
          crossFilterValues: resolved,
          allOptionValues: allOptionValuesRef.current,
          inverseSelection,
          multiSelect,
        });
        const nextKeys = optionsSignature(next);
        const currentKeys = optionsSignature(selectedValuesRef.current);
        lastAppliedSyncKeyRef.current = requestId;
        if (nextKeys === currentKeys) {
          return;
        }
        updateDataMaskRef.current(
          next.length ? (next as SelectValue) : null,
        );
      })
      .catch(() => {
        if (!cancelled) {
          lastAppliedSyncKeyRef.current = null;
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    active,
    col,
    datasource,
    inverseSelection,
    multiSelect,
    optionsKey,
    signature,
  ]);
}
