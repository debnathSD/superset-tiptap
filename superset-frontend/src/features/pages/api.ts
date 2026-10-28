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
import { SupersetClient } from '@superset-ui/core';
import rison from 'rison';
import type { JSONContent } from '@tiptap/core';
import { normalizeSettings, type PageSettings } from './pagination/settings';

export type PageUser = { id: number; first_name: string; last_name: string };

export {
  DEFAULT_PAGE_SETTINGS,
  isPaged,
  type LayoutMode,
  type PageSettings,
  type PaperSize,
} from './pagination/settings';

export type PageRecord = {
  id: number;
  uuid?: string;
  title: string;
  description?: string | null;
  content?: string | null;
  page_settings?: string | null;
  published: boolean;
  is_template: boolean;
  url?: string;
  created_on?: string;
  changed_on?: string;
  changed_on_delta_humanized?: string;
  created_by?: PageUser | null;
  changed_by?: PageUser | null;
  owners: PageUser[];
};

export function parseContent(page: Pick<PageRecord, 'content'>): JSONContent | null {
  try {
    return page.content ? (JSON.parse(page.content) as JSONContent) : null;
  } catch {
    return null;
  }
}

export function parseSettings(page: Pick<PageRecord, 'page_settings'>): PageSettings {
  try {
    return normalizeSettings(page.page_settings ? JSON.parse(page.page_settings) : {});
  } catch {
    return normalizeSettings({});
  }
}

export async function fetchPage(id: number): Promise<PageRecord> {
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/page/${id}` });
  return { ...(json.result as PageRecord), id };
}

export async function createPage(body: Partial<PageRecord>): Promise<number> {
  const { json } = await SupersetClient.post({ endpoint: '/api/v1/page/', jsonPayload: body });
  return json.id as number;
}

export async function updatePage(id: number, body: Partial<Pick<PageRecord, 'title' | 'description' | 'content' | 'page_settings' | 'published' | 'is_template'>>) {
  await SupersetClient.put({ endpoint: `/api/v1/page/${id}`, jsonPayload: body });
}

export async function copyPage(id: number, title?: string): Promise<number> {
  const { json } = await SupersetClient.post({ endpoint: `/api/v1/page/${id}/copy/`, jsonPayload: title ? { title } : {} });
  return json.id as number;
}

export async function deletePages(ids: number[]) {
  const { json } = await SupersetClient.delete({ endpoint: `/api/v1/page/?q=${rison.encode(ids)}` });
  return json.message as string;
}

export type ChartSummary = {
  id: number;
  slice_name: string;
  viz_type: string;
  datasource_name_text?: string;
  changed_on_delta_humanized?: string;
};

/** Charts for the drag-and-drop picker, newest first, searchable. */
export async function fetchCharts(search: string, page: number, pageSize = 30) {
  const query = {
    columns: ['id', 'slice_name', 'viz_type', 'datasource_name_text', 'changed_on_delta_humanized'],
    order_column: 'changed_on_delta_humanized',
    order_direction: 'desc',
    page,
    page_size: pageSize,
    ...(search ? { filters: [{ col: 'slice_name', opr: 'chart_all_text', value: search }] } : {}),
  };
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/chart/?q=${rison.encode(query)}` });
  return { count: json.count as number, charts: json.result as ChartSummary[] };
}
