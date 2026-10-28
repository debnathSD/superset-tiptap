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
import { Extension, Node, mergeAttributes } from '@tiptap/core';
import type { Node as PMNode } from '@tiptap/pm/model';
import { Plugin, PluginKey, type EditorState } from '@tiptap/pm/state';
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view';
import {
  DEFAULT_PAGE_SETTINGS,
  fillFields,
  hasSlots,
  isPaged,
  showsHeaderFooter,
  type HeaderFooterZone,
  type PageSettings,
  type PageVars,
} from './settings';
import { pageGeometry, SHEET_GAP } from './geometry';

/**
 * Page view: measures the rendered top-level blocks and inserts "page gap"
 * widgets so the document reads as a stack of real sheets (A4/Letter/Legal
 * pages or 16:9 slides), each with its own header and footer. A manual page
 * break forces a new sheet. Breaks happen between top-level blocks; a block
 * taller than a page simply makes its sheet taller. Exports read the same
 * breaks.
 */

export type PageBreakInfo = { index: number; pos: number; fill: number; page: number };
type PaginationState = { settings: PageSettings; vars: PageVars; breaks: PageBreakInfo[]; trailing: number; total: number };
type Meta = { settings?: PageSettings; vars?: PageVars; breaks?: PageBreakInfo[]; trailing?: number; total?: number };

export const paginationKey = new PluginKey<PaginationState>('pagination');

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    pagination: {
      setPageSettings: (settings: PageSettings) => ReturnType;
      /** Title, author and date used by header and footer fields. */
      setPageVars: (vars: PageVars) => ReturnType;
      insertPageBreak: () => ReturnType;
    };
  }
}

export const PageBreak = Node.create({
  name: 'pageBreak',
  // Page-level only (like sections): pages break between top-level blocks.
  group: 'region',
  atom: true,
  selectable: true,
  draggable: true,
  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'page-break', class: 'pg-page-break' }), ['span', {}, 'Page break']];
  },
  addKeyboardShortcuts() {
    return { 'Mod-Enter': () => this.editor.commands.insertPageBreak() };
  },
});

/** A header or footer band in the page margin: left, center and right slots. */
function zone(kind: HeaderFooterZone, state: PaginationState, page: number) {
  const slots = state.settings[kind];
  const show = showsHeaderFooter(state.settings, page) && hasSlots(slots);
  const el = document.createElement('div');
  el.className = `pg-hf pg-hf--${kind}`;
  el.dataset.zone = kind;
  el.dataset.page = String(page);
  if (!show) el.dataset.empty = 'true';
  if (show && state.settings.divider) el.dataset.divider = 'true';
  el.title = kind === 'header' ? 'Double-click to edit the header' : 'Double-click to edit the footer';
  el.dataset.placeholder = kind === 'header' ? 'Double-click to add a header' : 'Double-click to add a footer';
  const row = document.createElement('div');
  row.className = 'pg-hf__row';
  (['left', 'center', 'right'] as const).forEach(slot => {
    const span = document.createElement('span');
    span.className = `pg-hf__slot pg-hf__slot--${slot}`;
    span.textContent = show ? fillFields(slots[slot], page, state.total, state.vars) : '';
    row.append(span);
  });
  el.append(row);
  return el;
}

function box(cls: string, margin: number) {
  const el = document.createElement('div');
  el.className = cls;
  el.contentEditable = 'false';
  el.style.setProperty('--margin', `${margin}px`);
  return el;
}

function fill(height: number) {
  const el = document.createElement('div');
  el.className = 'pg-page-gap__fill';
  el.style.height = `${height}px`;
  return el;
}

/** Header of the first sheet, drawn in the top margin above the first block. */
function startWidget(state: PaginationState) {
  const { margin } = pageGeometry(state.settings);
  return () => {
    const start = box('pg-page-start', margin);
    start.append(zone('header', state, 1));
    return start;
  };
}

/** Bottom margin + footer of one sheet, the gap between sheets, and the next sheet's header. */
function gapWidget(info: PageBreakInfo, state: PaginationState) {
  const { margin } = pageGeometry(state.settings);
  return () => {
    const gap = box('pg-page-gap', margin);
    gap.dataset.index = String(info.index);
    gap.style.setProperty('--sheet-gap', `${SHEET_GAP}px`);
    const between = document.createElement('div');
    between.className = 'pg-page-gap__between';
    gap.append(fill(info.fill), zone('footer', state, info.page), between, zone('header', state, info.page + 1));
    return gap;
  };
}

function trailingWidget(state: PaginationState) {
  const { margin } = pageGeometry(state.settings);
  return () => {
    const end = box('pg-page-end', margin);
    end.append(fill(state.trailing), zone('footer', state, state.total));
    return end;
  };
}

function decorations(doc: PMNode, state: PaginationState) {
  if (!isPaged(state.settings)) return DecorationSet.empty;
  const { header, footer, differentFirstPage, divider, layout, margins, size } = state.settings;
  // Widgets are rebuilt whenever anything they draw changes.
  const sig = JSON.stringify([header, footer, differentFirstPage, divider, layout, margins, size, state.vars, state.total]);
  const spec = { ignoreSelection: true, stopEvent: () => true };
  const decos = [Decoration.widget(0, startWidget(state), { ...spec, side: -1, key: `start-${sig}` })];
  state.breaks.forEach(info => decos.push(Decoration.widget(info.pos, gapWidget(info, state), { ...spec, side: -1, key: `gap-${info.index}-${info.fill}-${info.page}-${sig}` })));
  decos.push(Decoration.widget(doc.content.size, trailingWidget(state), { ...spec, side: 1, key: `end-${state.trailing}-${sig}` }));
  return DecorationSet.create(doc, decos);
}

/** Compute page breaks from the blocks' natural (gap-free) layout. */
function measure(view: EditorView, settings: PageSettings) {
  const { content } = pageGeometry(settings);
  const gaps = Array.from(view.dom.querySelectorAll<HTMLElement>(':scope > .pg-page-gap'));
  const gapHeight = (index: number) => gaps.filter(g => Number(g.dataset.index) <= index).reduce((sum, g) => sum + g.offsetHeight, 0);

  const blocks: Array<{ index: number; pos: number; top: number; bottom: number; node: PMNode }> = [];
  view.state.doc.forEach((node, pos, index) => {
    const dom = view.nodeDOM(pos) as HTMLElement | null;
    if (!dom || !(dom instanceof HTMLElement)) return;
    const shift = gapHeight(index);
    const top = dom.offsetTop - shift;
    blocks.push({ index, pos, top, bottom: top + dom.offsetHeight, node });
  });

  const breaks: PageBreakInfo[] = [];
  let pageStart = 0;
  let page = 1;
  // A manual break that overflows a full page moves to the top of the next one, and
  // then has nothing left to force: otherwise it would leave a blank page behind.
  let startedPage = -1;
  blocks.forEach((block, i) => {
    if (i === 0) return;
    const previous = blocks[i - 1];
    const top = block.top - pageStart;
    const bottom = block.bottom - pageStart;
    const forced = previous.node.type.name === 'pageBreak' && startedPage !== i - 1;
    if (forced || (bottom > content && top > 0)) {
      // Fill from where the previous page's content ends to the bottom of its content box.
      breaks.push({ index: block.index, pos: block.pos, fill: Math.max(0, Math.round(content - (previous.bottom - pageStart))), page });
      // The next sheet's content box starts right after the gap, i.e. where the previous block ended.
      pageStart = previous.bottom;
      page += 1;
      startedPage = i;
    }
  });
  const last = blocks[blocks.length - 1];
  const trailing = last ? Math.max(0, Math.round(content - (last.bottom - pageStart))) : content;
  return { breaks, trailing, total: page };
}

export function pageBreaks(state: EditorState) {
  return paginationKey.getState(state);
}

/** Resolve once pagination has re-measured and stopped changing (charts and images may still be settling). */
export function waitForPagination(editor: { state: EditorState }, settleMs = 450) {
  return new Promise<void>(resolve => {
    let last = '';
    let stableSince = performance.now();
    const started = performance.now();
    const tick = () => {
      const state = pageBreaks(editor.state);
      const key = JSON.stringify([state?.settings.layout, state?.total, state?.breaks.map(b => [b.pos, b.fill])]);
      if (key !== last) {
        last = key;
        stableSince = performance.now();
      }
      if (performance.now() - stableSince > settleMs || performance.now() - started > 8000) resolve();
      else setTimeout(tick, 80);
    };
    setTimeout(tick, 80);
  });
}

export const Pagination = Extension.create<{ settings: PageSettings; vars: PageVars }>({
  name: 'pagination',

  addOptions() {
    return { settings: DEFAULT_PAGE_SETTINGS, vars: { title: '', author: '', date: '' } };
  },

  addCommands() {
    return {
      setPageSettings:
        settings =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(paginationKey, { settings } satisfies Meta).setMeta('addToHistory', false);
          return true;
        },
      setPageVars:
        vars =>
        ({ tr, dispatch }) => {
          if (dispatch) tr.setMeta(paginationKey, { vars } satisfies Meta).setMeta('addToHistory', false);
          return true;
        },
      insertPageBreak:
        () =>
        ({ commands }) =>
          commands.insertTopLevel([{ type: 'pageBreak' }, { type: 'paragraph' }]),
    };
  },

  addProseMirrorPlugins() {
    const { settings: initial, vars } = this.options;
    return [
      new Plugin<PaginationState>({
        key: paginationKey,
        state: {
          init: () => ({ settings: initial, vars, breaks: [], trailing: 0, total: 1 }),
          apply: (tr, value) => {
            const meta = tr.getMeta(paginationKey) as Meta | undefined;
            if (meta?.settings && !isPaged(meta.settings)) return { ...value, ...meta, breaks: [], trailing: 0, total: 1 };
            let next = value;
            if (tr.docChanged) {
              // Keep widgets anchored until the next measurement replaces them.
              next = { ...next, breaks: next.breaks.map(b => ({ ...b, pos: tr.mapping.map(b.pos, -1) })) };
            }
            return meta ? { ...next, ...meta } : next;
          },
        },
        props: {
          decorations: state => {
            const value = paginationKey.getState(state);
            return value ? decorations(state.doc, value) : null;
          },
        },
        view: view => {
          let frame = 0;
          let timer = 0;
          const run = () => {
            frame = 0;
            const value = paginationKey.getState(view.state);
            if (!value || !isPaged(value.settings) || view.isDestroyed) return;
            const next = measure(view, value.settings);
            const same =
              next.total === value.total &&
              next.trailing === value.trailing &&
              next.breaks.length === value.breaks.length &&
              next.breaks.every((b, i) => b.pos === value.breaks[i].pos && b.fill === value.breaks[i].fill);
            if (!same) view.dispatch(view.state.tr.setMeta(paginationKey, next).setMeta('addToHistory', false));
          };
          const schedule = () => {
            clearTimeout(timer);
            timer = window.setTimeout(() => {
              if (!frame) frame = requestAnimationFrame(run);
            }, 120);
          };
          // Charts and images change height after they load; re-measure when the content resizes.
          const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
          observer?.observe(view.dom);
          schedule();
          return {
            update: schedule,
            destroy: () => {
              observer?.disconnect();
              clearTimeout(timer);
              cancelAnimationFrame(frame);
            },
          };
        },
      }),
    ];
  },
});
