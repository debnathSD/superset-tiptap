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
import { GenericDataType } from '@apache-superset/core/common';
import rison from 'rison';
import type { PageRecord } from 'src/features/pages/api';
import { loadChart } from 'src/features/pages/chart/chartData';
import type { Deck } from './deckToDoc';

/** A presentation is stored like a page (Tiptap JSON + layout settings) plus how it was generated. */
export type PresentationRecord = Omit<PageRecord, 'is_template'> & {
  prompt?: string | null;
  source?: string | null;
};

type Body = Partial<Pick<PresentationRecord, 'title' | 'description' | 'content' | 'page_settings' | 'prompt' | 'source' | 'published'>>;

export async function fetchPresentation(id: number): Promise<PresentationRecord> {
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/presentation/${id}` });
  return { ...(json.result as PresentationRecord), id };
}

export async function createPresentation(body: Body): Promise<number> {
  const { json } = await SupersetClient.post({ endpoint: '/api/v1/presentation/', jsonPayload: body });
  return json.id as number;
}

export async function updatePresentation(id: number, body: Body) {
  await SupersetClient.put({ endpoint: `/api/v1/presentation/${id}`, jsonPayload: body });
}

export async function copyPresentation(id: number, title?: string): Promise<number> {
  const { json } = await SupersetClient.post({ endpoint: `/api/v1/presentation/${id}/copy/`, jsonPayload: title ? { title } : {} });
  return json.id as number;
}

export async function deletePresentations(ids: number[]) {
  const { json } = await SupersetClient.delete({ endpoint: `/api/v1/presentation/?q=${rison.encode(ids)}` });
  return json.message as string;
}

// ── AI generation ──────────────────────────────────────────────────────────

export type AiStatus = {
  available: boolean;
  model: string | null;
  reason: string | null;
  presenton?: { available: boolean; reason: string | null };
};

/** Who builds the deck: Presenton designs a PowerPoint, Claude writes an editable deck with live charts. */
export type Engine = 'presenton' | 'claude' | 'draft';

export async function fetchAiStatus(): Promise<AiStatus> {
  const { json } = await SupersetClient.get({ endpoint: '/api/v1/presentation/ai_status/' });
  return json.result as AiStatus;
}

export type Tone = 'executive' | 'analytical' | 'storytelling' | 'casual';

/** One chart's numbers as the generator reads them. */
export type ChartData = {
  id: number;
  name: string;
  viz_type: string;
  dataset: string;
  description: string;
  columns: string[];
  rows: unknown[][];
  row_count: number;
};

export type GenerateRequest = {
  brief: string;
  audience: string;
  tone: Tone;
  n_slides: number;
  use_ai: boolean;
  charts: ChartData[];
};

export type GenerateResult = { deck: Deck; engine: 'claude' | 'draft'; model: string | null };

export async function generateDeck(body: GenerateRequest): Promise<GenerateResult> {
  const { json } = await SupersetClient.post({ endpoint: '/api/v1/presentation/generate/', jsonPayload: body, timeout: 300000 });
  return json.result as GenerateResult;
}

// ── Presenton ─────────────────────────────────────────────────────────────

export type PresentonTask =
  | { status: 'pending'; message: string }
  | { status: 'error'; message: string }
  | { status: 'completed'; message: string; presentation_id: string; file_url: string | null; edit_url: string | null; credits: number | null };

export async function startPresenton(body: GenerateRequest): Promise<string> {
  const { json } = await SupersetClient.post({ endpoint: '/api/v1/presentation/presenton/', jsonPayload: body, timeout: 120000 });
  return json.result.task_id as string;
}

export async function presentonTask(taskId: string): Promise<PresentonTask> {
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/presentation/presenton/task/${encodeURIComponent(taskId)}/` });
  return json.result as PresentonTask;
}

export type PresentonEmbed = { url: string; expires_at: string | null; can_edit: boolean };

export async function presentonEmbed(id: number): Promise<PresentonEmbed> {
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/presentation/${id}/presenton_embed/` });
  return json.result as PresentonEmbed;
}

/** How a presentation was made; stored as JSON in `source`. */
export type PresentationSource = {
  engine?: Engine;
  model?: string | null;
  presenton_id?: string;
  file_url?: string | null;
  edit_url?: string | null;
  credits?: number | null;
  chart_ids?: number[];
};

export function parseSource(record: Pick<PresentationRecord, 'source'>): PresentationSource {
  try {
    const value = record.source ? JSON.parse(record.source) : {};
    return value && typeof value === 'object' ? (value as PresentationSource) : {};
  } catch {
    return {};
  }
}

/** Rows sent per chart; the server trims further to its own limit. */
const MAX_ROWS = 60;

const cell = (value: unknown, type: GenericDataType | undefined) => {
  if (value === null || value === undefined) return null;
  if (type === GenericDataType.Temporal && typeof value === 'number') return new Date(value).toISOString().slice(0, 10);
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'number' && !Number.isInteger(value)) return Math.round(value * 1e4) / 1e4; // 24.099999999999998 → 24.1
  return value;
};

/**
 * Run a saved chart's query in the browser, exactly as the chart itself does,
 * so the generator only ever sees data the viewer is allowed to see.
 */
export async function chartData(chartId: number): Promise<ChartData> {
  const payload = await loadChart(chartId);
  const query = (payload.queriesData[0] ?? {}) as { colnames?: string[]; coltypes?: GenericDataType[]; data?: Record<string, unknown>[]; rowcount?: number };
  const columns = query.colnames ?? Object.keys(query.data?.[0] ?? {});
  const data = Array.isArray(query.data) ? query.data : [];
  const dataset = payload.datasource as { table_name?: string; datasource_name?: string; name?: string };
  return {
    id: chartId,
    name: payload.sliceName,
    viz_type: payload.vizType ?? '',
    dataset: dataset?.table_name ?? dataset?.datasource_name ?? dataset?.name ?? '',
    description: String((payload.formData as { description?: string }).description ?? ''),
    columns,
    rows: data.slice(0, MAX_ROWS).map(row => columns.map((column, i) => cell(row[column], query.coltypes?.[i]))),
    row_count: query.rowcount ?? data.length,
  };
}

// ── Picking data ───────────────────────────────────────────────────────────

export type Option = { value: number; label: string };

export async function searchDashboards(search: string, page: number, pageSize: number) {
  const query = {
    columns: ['id', 'dashboard_title'],
    order_column: 'changed_on_delta_humanized',
    order_direction: 'desc',
    page,
    page_size: pageSize,
    ...(search ? { filters: [{ col: 'dashboard_title', opr: 'title_or_slug', value: search }] } : {}),
  };
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/dashboard/?q=${rison.encode(query)}` });
  return {
    data: (json.result as Array<{ id: number; dashboard_title: string }>).map(d => ({ value: d.id, label: d.dashboard_title || `Dashboard ${d.id}` })),
    totalCount: json.count as number,
  };
}

export async function dashboardCharts(id: number): Promise<Option[]> {
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/dashboard/${id}/charts` });
  return (json.result as Array<{ id: number; slice_name: string }>).map(c => ({ value: c.id, label: c.slice_name || `Chart ${c.id}` }));
}

export async function searchCharts(search: string, page: number, pageSize: number) {
  const query = {
    columns: ['id', 'slice_name'],
    order_column: 'changed_on_delta_humanized',
    order_direction: 'desc',
    page,
    page_size: pageSize,
    ...(search ? { filters: [{ col: 'slice_name', opr: 'chart_all_text', value: search }] } : {}),
  };
  const { json } = await SupersetClient.get({ endpoint: `/api/v1/chart/?q=${rison.encode(query)}` });
  return {
    data: (json.result as Array<{ id: number; slice_name: string }>).map(c => ({ value: c.id, label: c.slice_name || `Chart ${c.id}` })),
    totalCount: json.count as number,
  };
}
