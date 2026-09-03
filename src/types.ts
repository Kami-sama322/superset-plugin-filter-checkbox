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
import {
  Behavior,
  ChartProps,
  DataRecord,
  FilterState,
  QueryFormData,
  ChartDataResponseResult,
  SetDataMaskHook,
} from '@superset-ui/core';
import { GenericDataType } from '@apache-superset/core/common';
import { RefObject } from 'react';

export enum FilterBarOrientation {
  Vertical = 'VERTICAL',
  Horizontal = 'HORIZONTAL',
}

export interface PluginFilterStylesProps {
  height: number;
  width: number;
  orientation?: FilterBarOrientation;
  overflow?: boolean;
}

export interface PluginFilterHooks {
  setDataMask: SetDataMaskHook;
  setFocusedFilter: () => void;
  unsetFocusedFilter: () => void;
  setHoveredFilter: () => void;
  unsetHoveredFilter: () => void;
  setFilterActive: (isActive: boolean) => void;
  clearAllTrigger?: boolean;
  onClearAllComplete?: (filterId: string) => void;
}

export type SelectValue = (number | string | boolean | null)[] | null | undefined;

export interface PluginFilterCheckboxCustomizeProps {
  defaultValue?: SelectValue;
  enableEmptyFilter: boolean;
  inverseSelection: boolean;
  multiSelect: boolean;
  enableSearch: boolean;
  sortAscending: boolean;
  displayValues: (string | number)[];
}

export type PluginFilterCheckboxQueryFormData = QueryFormData &
  PluginFilterStylesProps &
  PluginFilterCheckboxCustomizeProps & {
    nativeFilterId?: string;
  };

export interface PluginFilterCheckboxChartProps extends ChartProps {
  queriesData: ChartDataResponseResult[];
}

export type PluginFilterCheckboxProps = PluginFilterStylesProps & {
  coltypeMap: Record<string, GenericDataType>;
  data: DataRecord[];
  behaviors: Behavior[];
  formData: PluginFilterCheckboxQueryFormData;
  filterState: FilterState;
  isRefreshing: boolean;
  inputRef?: RefObject<HTMLInputElement>;
  filterBarOrientation?: FilterBarOrientation;
  isOverflowingFilterBar?: boolean;
  clearAllTrigger?: boolean;
  onClearAllComplete?: (filterId: string) => void;
} & PluginFilterHooks;

export const DEFAULT_FORM_DATA: PluginFilterCheckboxCustomizeProps = {
  defaultValue: null,
  enableEmptyFilter: false,
  inverseSelection: false,
  multiSelect: true,
  enableSearch: false,
  sortAscending: true,
  displayValues: [],
};
