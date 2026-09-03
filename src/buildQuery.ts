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
  BuildQuery,
  buildQueryContext,
  getColumnLabel,
  isPhysicalColumn,
  QueryObject,
} from '@superset-ui/core';
import { DEFAULT_FORM_DATA, PluginFilterCheckboxQueryFormData } from './types';

/**
 * Loads distinct column values for the checkbox list.
 * Intentionally omits cascade / sibling filter clauses so this filter
 * neither shrinks under other filters nor narrows their option lists.
 */
const buildQuery: BuildQuery<PluginFilterCheckboxQueryFormData> = (
  formData: PluginFilterCheckboxQueryFormData,
) => {
  const { sortAscending } = { ...DEFAULT_FORM_DATA, ...formData };
  return buildQueryContext(formData, baseQueryObject => {
    const { columns = [] } = baseQueryObject;
    const sortColumns = columns.filter(isPhysicalColumn).map(getColumnLabel);

    const query: QueryObject = {
      ...baseQueryObject,
      columns,
      metrics: [],
      filters: [],
      extras: {
        ...(baseQueryObject.extras || {}),
        having: undefined,
        where: undefined,
      },
      orderby:
        sortAscending !== undefined
          ? sortColumns.map(column => [column, !!sortAscending])
          : [],
    };

    return [query];
  });
};

export default buildQuery;
