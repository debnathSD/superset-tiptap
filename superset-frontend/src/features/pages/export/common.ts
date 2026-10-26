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
import type { Editor } from '@tiptap/core';
import domToImage from 'dom-to-image-more';
import type { PageSettings, PageVars } from '../pagination/settings';

export type ExportContext = {
  editor: Editor;
  /** The sheet element holding the rendered page(s). */
  sheet: HTMLElement;
  title: string;
  /** Settings with the layout the export renders in. */
  settings: PageSettings;
  /** Values for header/footer fields. */
  vars: PageVars;
  dark: boolean;
};

export function fileName(title: string, extension: string) {
  const stem = title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 80) || 'page';
  return `${stem}.${extension}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const sheetBackground = (sheet: HTMLElement) => getComputedStyle(sheet).backgroundColor || '#ffffff';

/** Leave editing chrome and on-screen-only page furniture out of captures. */
const keep = (node: Node) => {
  if (!(node instanceof HTMLElement)) return true;
  return !node.matches('.pg-section__toolbar, .pg-section__add, .pg-chart-embed__resize, .pg-spacer__grip, .block-handle, .pg-heading-toggle, .ProseMirror-gapcursor');
};

/** Rasterise an element at 2x for crisp output; without a background the PNG stays transparent. */
export async function captureElement(el: HTMLElement, background?: string, scale = 2): Promise<string> {
  return domToImage.toPng(el, { bgcolor: background, scale, filter: keep, cacheBust: false });
}

/** Rasterise a vertical slice of the sheet (one page). */
export async function captureRegion(sheet: HTMLElement, region: Region, background: string, scale = 2): Promise<string> {
  return domToImage.toPng(sheet, {
    bgcolor: background,
    scale,
    filter: keep,
    width: sheet.offsetWidth,
    height: Math.floor(region.height),
    style: { transform: `translateY(${-region.top}px)`, transformOrigin: 'top left', margin: '0' },
  });
}

export type Region = { top: number; height: number };

/** Page rectangles (relative to the sheet) as laid out by the pagination plugin. */
export function pageRegions(sheet: HTMLElement): Region[] {
  const origin = sheet.getBoundingClientRect().top;
  const regions: Region[] = [];
  let start = 0;
  sheet.querySelectorAll<HTMLElement>('.pg-page-gap__between').forEach(between => {
    const rect = between.getBoundingClientRect();
    regions.push({ top: start, height: rect.top - origin - start });
    start = rect.bottom - origin;
  });
  regions.push({ top: start, height: sheet.getBoundingClientRect().height - start });
  return regions.filter(r => r.height > 4);
}

export function dataUrlToBytes(dataUrl: string) {
  const base64 = dataUrl.split(',')[1] ?? '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function imageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

/** Convert any CSS color the browser understands into RRGGBB. */
export function cssToHex(color: string, fallback = '000000'): string {
  const m = color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)(?:[,\s/]+([\d.]+))?/);
  if (m) {
    const alpha = m[4] === undefined ? 1 : Number(m[4]);
    if (alpha === 0) return fallback;
    return [m[1], m[2], m[3]].map(v => Number(v).toString(16).padStart(2, '0')).join('').toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(color)) return color.slice(1).toUpperCase();
  return fallback;
}

/** Mix a hex color with white: tint(0.12) gives the soft backgrounds used on screen. */
export function tint(hex: string, amount: number) {
  const n = parseInt(hex, 16);
  const mix = (c: number) => Math.round(c * amount + 255 * (1 - amount));
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => mix(c).toString(16).padStart(2, '0')).join('').toUpperCase();
}
