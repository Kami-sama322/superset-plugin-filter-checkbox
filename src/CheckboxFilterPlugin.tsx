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
import { useCallback, useEffect, useMemo, useState } from 'react';
import { t } from '@apache-superset/core/translation';
import {
  DataMask,
  DataRecordValue,
  ensureIsArray,
  ExtraFormData,
  getColumnLabel,
} from '@superset-ui/core';
import { styled } from '@apache-superset/core/theme';
import { FormItem, Input } from '@superset-ui/core/components';
import { FilterPluginStyle, StatusMessage } from './common';
import { PluginFilterCheckboxProps, SelectValue } from './types';
import { useCrossFilterSync } from './useCrossFilterSync';
import {
  filterBySearch,
  filterDisplayValues,
  formatDataRecordValue,
  getSelectExtraFormData,
  sortRows,
  uniqueColumnValues,
  valueKey,
} from './utils';

const CheckboxList = styled.div`
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid ${({ theme }) => theme.colorBorder};
  border-radius: ${({ theme }) => theme.borderRadius}px;
  padding: ${({ theme }) => theme.sizeUnit}px
    ${({ theme }) => theme.sizeUnit * 2}px;
`;

const CheckboxRow = styled.label<{ disabled?: boolean }>`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.sizeUnit * 2}px;
  padding: ${({ theme }) => theme.sizeUnit}px 0;
  cursor: ${({ disabled }) => (disabled ? 'not-allowed' : 'pointer')};
  opacity: ${({ disabled }) => (disabled ? 0.55 : 1)};
  margin: 0;
  user-select: none;

  &:hover {
    color: ${({ theme, disabled }) =>
      disabled ? undefined : theme.colorPrimary};
  }
`;

const HiddenCheckbox = styled.input`
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
`;

const Indicator = styled.span<{ checked: boolean }>`
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid
    ${({ theme, checked }) =>
      checked ? theme.colorPrimary : theme.colorBorder};
  border-radius: 2px;
  background: ${({ theme, checked }) =>
    checked ? theme.colorPrimary : theme.colorBgContainer};
  color: #fff;
  font-size: 11px;
  line-height: 1;
  font-weight: 700;
  pointer-events: none;
`;

const ValueLabel = styled.span`
  pointer-events: none;
`;

const SearchWrap = styled.div`
  margin-bottom: ${({ theme }) => theme.sizeUnit * 2}px;
`;

const EmptyState = styled.div`
  color: ${({ theme }) => theme.colorTextSecondary};
  padding: ${({ theme }) => theme.sizeUnit * 2}px 0;
`;

function CheckboxIndicator({
  checked,
  inverse,
}: {
  checked: boolean;
  inverse: boolean;
}) {
  return (
    <Indicator checked={checked} aria-hidden>
      {checked ? (inverse ? '×' : '✓') : null}
    </Indicator>
  );
}

export default function PluginFilterCheckbox(
  props: PluginFilterCheckboxProps,
) {
  const {
    data,
    filterState,
    formData,
    height,
    width,
    setDataMask,
    setHoveredFilter,
    unsetHoveredFilter,
    setFocusedFilter,
    unsetFocusedFilter,
    setFilterActive,
    inputRef,
    clearAllTrigger,
    onClearAllComplete,
  } = props;

  const {
    enableEmptyFilter,
    multiSelect,
    enableSearch,
    inverseSelection,
    sortAscending,
    displayValues: formDisplayValues,
  } = formData;

  const groupby = useMemo(
    () => ensureIsArray(formData.groupby).map(getColumnLabel),
    [formData.groupby],
  );
  const [col] = groupby;

  const [search, setSearch] = useState('');

  const displayValues = useMemo(
    () => ensureIsArray(formDisplayValues).map(String),
    [formDisplayValues],
  );

  const selectedValues = useMemo(
    () => ensureIsArray(filterState.value as SelectValue),
    [filterState.value],
  );

  const selectedKeySet = useMemo(
    () => new Set(selectedValues.map(value => valueKey(value))),
    [selectedValues],
  );

  const allUniqueRows = useMemo(() => {
    const uniqueValues = uniqueColumnValues(data, col);
    const rows = uniqueValues.map(value => ({ [col]: value }));
    return sortRows(rows, col, sortAscending);
  }, [data, col, sortAscending]);

  const allOptionValues = useMemo(
    () => allUniqueRows.map(row => row[col]),
    [allUniqueRows, col],
  );

  const visibleRows = useMemo(() => {
    const limited = filterDisplayValues(allUniqueRows, col, displayValues);
    return filterBySearch(limited, col, enableSearch ? search : '');
  }, [allUniqueRows, col, displayValues, enableSearch, search]);

  const updateDataMask = useCallback(
    (
      values: SelectValue,
      options?: { excludeSelection?: boolean },
    ) => {
      const excludeSelection =
        options?.excludeSelection ?? inverseSelection;
      const emptyFilter =
        enableEmptyFilter && !excludeSelection && !values?.length;
      const suffix =
        excludeSelection && values?.length ? t(' (excluded)') : '';

      const nextMask: DataMask = {
        extraFormData: getSelectExtraFormData(
          col,
          values,
          emptyFilter,
          excludeSelection,
        ) as ExtraFormData,
        filterState: {
          value: values,
          label: values?.length
            ? `${values
                .map(value => formatDataRecordValue(value))
                .join(', ')}${suffix}`
            : undefined,
        },
      };
      setDataMask(nextMask);
    },
    [col, enableEmptyFilter, inverseSelection, setDataMask],
  );

  const handleToggle = useCallback(
    (rawValue: DataRecordValue) => {
      const key = valueKey(rawValue);
      const isSelected = selectedKeySet.has(key);

      let next: SelectValue;
      if (multiSelect) {
        if (isSelected) {
          next = selectedValues.filter(value => valueKey(value) !== key);
        } else {
          next = [
            ...selectedValues,
            rawValue as string | number | boolean | null,
          ];
        }
      } else if (isSelected) {
        next = [];
      } else {
        next = [rawValue as string | number | boolean | null];
      }

      updateDataMask(next?.length ? next : null);
    },
    [multiSelect, selectedKeySet, selectedValues, updateDataMask],
  );

  useCrossFilterSync({
    col,
    datasource: formData.datasource,
    multiSelect,
    inverseSelection,
    allOptionValues,
    selectedValues,
    updateDataMask,
  });

  useEffect(() => {
    if (filterState.value !== undefined) {
      return;
    }
    if (!clearAllTrigger && formData?.defaultValue) {
      updateDataMask(formData.defaultValue);
    }
  }, [clearAllTrigger, formData?.defaultValue, filterState.value, updateDataMask]);

  useEffect(() => {
    if (!clearAllTrigger) {
      return;
    }
    updateDataMask(null);
    setSearch('');
    onClearAllComplete?.(formData.nativeFilterId);
  }, [
    clearAllTrigger,
    formData.nativeFilterId,
    onClearAllComplete,
    updateDataMask,
  ]);

  const formItemExtra = useMemo(() => {
    if (filterState.validateMessage) {
      return (
        <StatusMessage status={filterState.validateStatus}>
          {filterState.validateMessage}
        </StatusMessage>
      );
    }
    return undefined;
  }, [filterState.validateMessage, filterState.validateStatus]);

  const handleFocus = useCallback(() => {
    setFilterActive(true);
    setFocusedFilter();
    setHoveredFilter();
  }, [setFilterActive, setFocusedFilter, setHoveredFilter]);

  const handleBlur = useCallback(() => {
    setFilterActive(false);
    unsetFocusedFilter();
    unsetHoveredFilter();
  }, [setFilterActive, unsetFocusedFilter, unsetHoveredFilter]);

  return (
    <FilterPluginStyle
      height={height}
      width={width}
      onMouseEnter={setHoveredFilter}
      onMouseLeave={unsetHoveredFilter}
      onFocus={handleFocus}
      onBlur={handleBlur}
    >
      <FormItem
        validateStatus={filterState.validateStatus}
        extra={formItemExtra}
      >
        {enableSearch && (
          <SearchWrap>
            <Input
              ref={inputRef}
              allowClear
              placeholder={t('Search')}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </SearchWrap>
        )}

        <CheckboxList role="group" aria-label={t('Filter values')}>
          {visibleRows.length === 0 ? (
            <EmptyState>{t('No data')}</EmptyState>
          ) : (
            visibleRows.map(row => {
              const rawValue = row[col];
              const key = valueKey(rawValue);
              const checked = selectedKeySet.has(key);
              const label = formatDataRecordValue(rawValue);
              return (
                <CheckboxRow key={key}>
                  <HiddenCheckbox
                    type="checkbox"
                    checked={checked}
                    onChange={() => handleToggle(rawValue)}
                    aria-label={label}
                  />
                  <CheckboxIndicator
                    checked={checked}
                    inverse={inverseSelection}
                  />
                  <ValueLabel>{label}</ValueLabel>
                </CheckboxRow>
              );
            })
          )}
        </CheckboxList>
      </FormItem>
    </FilterPluginStyle>
  );
}
