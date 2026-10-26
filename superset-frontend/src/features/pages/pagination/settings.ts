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

/**
 * Page layout settings, shared by the page view, the pagination plugin and the
 * exporters. Stored as JSON next to the page content.
 */

export type PaperSize = 'A4' | 'Letter' | 'Legal';
/**
 * How a page is laid out:
 * - portrait: Word-style document pages (A4/Letter/Legal), automatic page breaks;
 * - landscape: PowerPoint widescreen slides (16:9), automatic slide breaks;
 * - canvas: one seamless page with no breaks.
 */
export type LayoutMode = 'portrait' | 'landscape' | 'canvas';
export type HeaderFooterSlots = { left: string; center: string; right: string };
export type HeaderFooterZone = 'header' | 'footer';
export type HeaderFooterSlot = keyof HeaderFooterSlots;

export type PageSettings = {
  layout: LayoutMode;
  /** Paper for portrait pages. Landscape is always a 16:9 slide. */
  size: PaperSize;
  margins: 'narrow' | 'normal' | 'wide';
  /** Repeated at the top of every page; text with fields such as {page}. */
  header: HeaderFooterSlots;
  /** Repeated at the bottom of every page. */
  footer: HeaderFooterSlots;
  /** Leave the header and footer off the first page (a cover page). */
  differentFirstPage: boolean;
  /** Draw a thin rule under the header and above the footer. */
  divider: boolean;
};

export const EMPTY_SLOTS: HeaderFooterSlots = { left: '', center: '', right: '' };

export const DEFAULT_PAGE_SETTINGS: PageSettings = {
  layout: 'portrait',
  size: 'A4',
  margins: 'normal',
  header: EMPTY_SLOTS,
  footer: { left: '{title}', center: '', right: 'Page {page} of {pages}' },
  differentFirstPage: false,
  divider: false,
};

export const isPaged = (settings: PageSettings) => settings.layout !== 'canvas';

const slots = (value: unknown, fallback: HeaderFooterSlots): HeaderFooterSlots => {
  if (typeof value === 'string') return { ...EMPTY_SLOTS, left: value };
  if (value && typeof value === 'object') {
    const v = value as Partial<HeaderFooterSlots>;
    return { left: String(v.left ?? ''), center: String(v.center ?? ''), right: String(v.right ?? '') };
  }
  return fallback;
};

/** Fill in defaults and migrate older shapes (orientation/paginate, plain-text header/footer, pageNumbers). */
export function normalizeSettings(input: unknown): PageSettings {
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const layout: LayoutMode =
    raw.layout === 'portrait' || raw.layout === 'landscape' || raw.layout === 'canvas'
      ? raw.layout
      : raw.paginate === false
        ? 'canvas'
        : raw.orientation === 'landscape'
          ? 'landscape'
          : DEFAULT_PAGE_SETTINGS.layout;
  const legacy = typeof raw.footer === 'string' || typeof raw.header === 'string' || 'pageNumbers' in raw;
  let footer = slots(raw.footer, DEFAULT_PAGE_SETTINGS.footer);
  if (legacy && raw.pageNumbers !== false && !Object.values(footer).some(text => text.includes('{page}'))) {
    footer = { ...footer, right: 'Page {page} of {pages}' };
  }
  return {
    layout,
    size: raw.size === 'Letter' || raw.size === 'Legal' ? raw.size : 'A4',
    margins: raw.margins === 'narrow' || raw.margins === 'wide' ? raw.margins : 'normal',
    header: slots(raw.header, DEFAULT_PAGE_SETTINGS.header),
    footer,
    differentFirstPage: raw.differentFirstPage === true,
    divider: raw.divider === true,
  };
}

/** Values the header and footer fields fill in. */
export type PageVars = { title: string; author: string; date: string };

export const HEADER_FOOTER_FIELDS = [
  { token: '{page}', label: 'Page number' },
  { token: '{pages}', label: 'Page count' },
  { token: '{title}', label: 'Title' },
  { token: '{author}', label: 'Author' },
  { token: '{date}', label: 'Date' },
] as const;

export type FieldPart = { text: string } | { field: 'page' | 'pages' };
const FIELD = /\{(page|pages|title|author|date)\}/g;

/** Split slot text into literal text and live page fields (Word keeps page numbers as fields). */
export function fieldParts(text: string, vars: PageVars): FieldPart[] {
  const parts: FieldPart[] = [];
  let last = 0;
  text.replace(FIELD, (match, name: string, offset: number) => {
    if (offset > last) parts.push({ text: text.slice(last, offset) });
    if (name === 'page' || name === 'pages') parts.push({ field: name });
    else parts.push({ text: vars[name as keyof PageVars] });
    last = offset + match.length;
    return match;
  });
  if (last < text.length) parts.push({ text: text.slice(last) });
  return parts;
}

export function fillFields(text: string, page: number, total: number, vars: PageVars) {
  return fieldParts(text, vars)
    .map(part => ('text' in part ? part.text : part.field === 'page' ? String(page) : String(total)))
    .join('');
}

export const hasSlots = (zone: HeaderFooterSlots) => Object.values(zone).some(text => text.trim() !== '');

/** Whether page `page` (1-based) shows its header and footer. */
export const showsHeaderFooter = (settings: PageSettings, page: number) => !(settings.differentFirstPage && page === 1);

export const formatDate = (date: Date) => date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

export const HEADER_FOOTER_PRESETS: Array<{ id: string; label: string; header: HeaderFooterSlots; footer: HeaderFooterSlots }> = [
  { id: 'page-of', label: 'Page X of Y', header: EMPTY_SLOTS, footer: { left: '', center: '', right: 'Page {page} of {pages}' } },
  { id: 'title-page', label: 'Title and page', header: EMPTY_SLOTS, footer: { left: '{title}', center: '', right: 'Page {page} of {pages}' } },
  { id: 'report', label: 'Report', header: { left: '{title}', center: '', right: '{date}' }, footer: { left: '{author}', center: '', right: '{page} / {pages}' } },
  { id: 'centered', label: 'Centered number', header: EMPTY_SLOTS, footer: { left: '', center: '{page}', right: '' } },
  { id: 'none', label: 'None', header: EMPTY_SLOTS, footer: EMPTY_SLOTS },
];
