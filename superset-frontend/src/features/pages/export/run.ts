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

import { isPaged, type LayoutMode, type PageSettings } from '../pagination/settings';
import type { ExportContext } from './common';

export type ExportKind = 'pdf' | 'docx' | 'pptx';

export const EXPORT_LABELS: Record<ExportKind, string> = { pdf: 'PDF', docx: 'Word document', pptx: 'PowerPoint deck' };

/** The layout a download renders in: Word is portrait pages, PowerPoint is 16:9 slides, PDF keeps the current pages. */
export function exportLayout(kind: ExportKind, settings: PageSettings): LayoutMode {
  if (kind === 'pptx') return 'landscape';
  if (kind === 'docx') return 'portrait';
  return isPaged(settings) ? settings.layout : 'portrait';
}

/** Load the exporter on demand (the PDF, Word and PowerPoint libraries are large) and run it. */
export async function runExporter(kind: ExportKind, ctx: ExportContext) {
  if (kind === 'pdf') return (await import('./exportPdf')).exportPdf(ctx);
  if (kind === 'docx') return (await import('./exportDocx')).exportDocx(ctx);
  return (await import('./exportPptx')).exportPptx(ctx);
}
