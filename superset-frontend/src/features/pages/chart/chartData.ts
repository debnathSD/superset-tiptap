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
import { QueryData, QueryFormData, SupersetClient } from '@superset-ui/core';
import { getChartDataRequest, handleChartDataResponse } from 'src/components/Chart/chartAction';
import { getQuerySettings } from 'src/explore/exploreUtils';

/** Everything SuperChart needs to draw a saved chart, exactly as Explore does. */
export type ChartPayload = {
  formData: QueryFormData;
  datasource: Record<string, unknown>;
  queriesData: QueryData[];
  sliceName: string;
  vizType: string;
};

const cache = new Map<number, Promise<ChartPayload>>();

/** Load a saved chart's form data, dataset and query results; cached per page session. */
export function loadChart(chartId: number, force = false): Promise<ChartPayload> {
  if (!force && cache.has(chartId)) return cache.get(chartId)!;
  const promise = (async () => {
    const { json } = await SupersetClient.get({ endpoint: `/api/v1/explore/?slice_id=${chartId}` });
    const { form_data: rawFormData, dataset, slice } = json.result;
    const formData = { ...rawFormData, slice_id: chartId } as QueryFormData;
    const [useLegacyApi] = getQuerySettings(formData);
    const { response, json: data } = await getChartDataRequest({ formData, force });
    const queriesData = await handleChartDataResponse(response, data, useLegacyApi);
    return {
      formData,
      datasource: dataset,
      queriesData,
      sliceName: slice?.slice_name ?? rawFormData.slice_name ?? `Chart ${chartId}`,
      vizType: formData.viz_type,
    };
  })();
  cache.set(chartId, promise);
  promise.catch(() => cache.delete(chartId));
  return promise;
}
