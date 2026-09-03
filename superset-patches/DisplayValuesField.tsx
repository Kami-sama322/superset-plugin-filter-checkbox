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
import { useEffect, useMemo, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import {
  ChartDataResponseResult,
  ensureIsArray,
  getClientErrorObject,
} from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import {
  FormItem,
  InfoTooltip,
  Select,
  type FormInstance,
} from '@superset-ui/core/components';
import { getChartDataRequest } from 'src/components/Chart/chartAction';
import { getFormData } from 'src/dashboard/components/nativeFilters/utils';
import { NativeFiltersForm } from '../types';
import { setNativeFilterFieldValues } from './utils';

const StyledFormItem = styled(FormItem)<{ expanded: boolean }>`
  width: ${({ expanded }) => (expanded ? '100%' : '50%')};
`;

const StyledLabel = styled.span`
  text-transform: uppercase;
  font-size: ${({ theme }) => theme.fontSizeSM}px;
`;

interface DisplayValuesFieldProps {
  expanded: boolean;
  form: FormInstance<NativeFiltersForm>;
  filterId: string;
  filterType?: string;
  datasetId?: number;
  column?: string;
  dashboardId?: number;
  initialValue?: (string | number)[];
  formChanged: () => void;
}

function valueKey(value: unknown): string {
  if (value === null || value === undefined) {
    return '__null__';
  }
  return String(value);
}

function formatLabel(value: unknown): string {
  if (value === null || value === undefined) {
    return 'NULL';
  }
  return String(value);
}

/**
 * Independent "Displayed values" control for filter_checkbox.
 * Rendered under Description in FiltersConfigForm (not inside Default value).
 */
export default function DisplayValuesField({
  expanded,
  form,
  filterId,
  filterType,
  datasetId,
  column,
  dashboardId,
  initialValue = [],
  formChanged,
}: DisplayValuesFieldProps) {
  const [options, setOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(false);

  const isCheckbox = filterType === 'filter_checkbox';

  useEffect(() => {
    if (!isCheckbox || !datasetId || !column || !dashboardId) {
      setOptions([]);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);

    const formData = getFormData({
      datasetId,
      dashboardId,
      groupby: column,
      filterType: 'filter_checkbox',
      id: filterId,
    });

    getChartDataRequest({ formData, force: false })
      .then(({ json }) => {
        if (cancelled) {
          return;
        }
        const result = ensureIsArray(
          (json?.result ?? []) as ChartDataResponseResult[],
        );
        const rows = ensureIsArray(result[0]?.data);
        const seen = new Set<string>();
        const next: { value: string; label: string }[] = [];
        rows.forEach(row => {
          const raw = row?.[column];
          const key = valueKey(raw);
          if (!seen.has(key)) {
            seen.add(key);
            next.push({ value: key, label: formatLabel(raw) });
          }
        });
        setOptions(next);
      })
      .catch(async (error: Response) => {
        if (cancelled) {
          return;
        }
        await getClientErrorObject(error);
        setOptions([]);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isCheckbox, datasetId, column, dashboardId, filterId]);

  const mergedOptions = useMemo(() => {
    const known = new Set(options.map(item => item.value));
    const extras = ensureIsArray(initialValue)
      .map(String)
      .filter(value => !known.has(value))
      .map(value => ({ value, label: value }));
    return [...options, ...extras];
  }, [options, initialValue]);

  if (!isCheckbox) {
    return null;
  }

  return (
    <StyledFormItem
      expanded={expanded}
      name={['filters', filterId, 'controlValues', 'displayValues']}
      initialValue={ensureIsArray(initialValue)}
      label={
        <StyledLabel>
          {t('Displayed values')}&nbsp;
          <InfoTooltip
            placement="top"
            tooltip={t(
              'Choose which column values appear in the checkbox list. Leave empty to show all unique values.',
            )}
          />
        </StyledLabel>
      }
    >
      <Select
        ariaLabel={t('Displayed values')}
        mode="multiple"
        allowClear
        allowNewOptions
        loading={loading}
        placeholder={t('Leave empty to show all values')}
        options={mergedOptions}
        onChange={(values: string[]) => {
          const previous =
            form.getFieldValue('filters')?.[filterId]?.controlValues || {};
          setNativeFilterFieldValues(form, filterId, {
            controlValues: {
              ...previous,
              displayValues: ensureIsArray(values),
            },
          });
          formChanged();
        }}
      />
    </StyledFormItem>
  );
}
