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
import PptxGenJS from 'pptxgenjs';
import type { Node as PMNode } from '@tiptap/pm/model';
import { pageGeometry } from '../pagination/geometry';
import { fillFields, showsHeaderFooter, type HeaderFooterZone } from '../pagination/settings';
import { captureElement, cssToHex, pageRegions, sheetBackground, fileName, type ExportContext } from './common';

/**
 * One slide per 16:9 landscape page. Every block is placed where it sits on
 * screen: text, lists and tables as native, editable PowerPoint objects;
 * section/callout/banner backgrounds as shapes; charts and visual web parts
 * as images.
 */

const PX = 96; // CSS px per inch
const PT = 0.75; // pt per CSS px
type TextProps = PptxGenJS.TextProps;
type Rect = { x: number; y: number; w: number; h: number };
type Item =
  | { kind: 'shape'; rect: Rect; fill: string | null; line: string | null; bar: string | null; radius: boolean }
  | { kind: 'text'; rect: Rect; el: HTMLElement; list: boolean }
  | { kind: 'image'; rect: Rect; el: HTMLElement }
  | { kind: 'table'; rect: Rect; el: HTMLTableElement }
  | { kind: 'line'; rect: Rect; color: string; weight: number };

const IMAGE_NODES = new Set(['supersetChart', 'chart', 'card', 'kpiGrid', 'quickLinks', 'pageProperties', 'image']);
const LIST_NODES = new Set(['bulletList', 'orderedList', 'taskList']);

const visibleColor = (value: string) => (value && !/rgba?\([^)]*,\s*0\)$/.test(value) && value !== 'transparent' ? cssToHex(value, '') || null : null);

function runsFrom(el: HTMLElement, base: CSSStyleDeclaration): TextProps[] {
  const runs: TextProps[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? '';
      if (!text) return;
      const parent = node.parentElement!;
      const style = getComputedStyle(parent);
      const link = parent.closest('a');
      const pill = parent.closest('.pg-pill');
      runs.push({
        text,
        options: {
          bold: Number(style.fontWeight) >= 600,
          italic: style.fontStyle === 'italic',
          underline: style.textDecorationLine.includes('underline') ? { style: 'sng' } : undefined,
          strike: style.textDecorationLine.includes('line-through') ? 'sngStrike' : undefined,
          color: cssToHex(style.color, cssToHex(base.color)),
          fontSize: Math.round(parseFloat(style.fontSize) * PT * 10) / 10,
          highlight: pill ? visibleColor(getComputedStyle(pill).backgroundColor) ?? undefined : undefined,
          hyperlink: link?.href ? { url: link.href } : undefined,
        },
      });
      return;
    }
    if (node instanceof HTMLElement) {
      if (node.matches('br')) runs.push({ text: '', options: { breakLine: true } });
      else if (!node.matches('.pg-heading-toggle, [contenteditable="false"]:not(.pg-pill)')) node.childNodes.forEach(walk);
      else if (node.matches('.pg-pill')) node.childNodes.forEach(walk);
    }
  };
  el.childNodes.forEach(walk);
  return runs;
}

function listRuns(list: HTMLElement, level = 0): TextProps[] {
  const ordered = list.tagName === 'OL';
  const runs: TextProps[] = [];
  Array.from(list.children).forEach(li => {
    Array.from(li.children).forEach(child => {
      const el = child as HTMLElement;
      if (el.matches('ul, ol')) runs.push(...listRuns(el, level + 1));
      else {
        const paragraph = el.matches('p') ? el : el.querySelector('p') ?? el;
        const style = getComputedStyle(paragraph);
        const content = runsFrom(paragraph, style);
        if (!content.length) return;
        content[0] = { ...content[0], options: { ...content[0].options, bullet: ordered ? { type: 'number' } : true, indentLevel: level } };
        content[content.length - 1] = { ...content[content.length - 1], options: { ...content[content.length - 1].options, breakLine: true } };
        runs.push(...content);
      }
    });
  });
  return runs;
}

function collect(ctx: ExportContext): Item[] {
  const { editor, sheet } = ctx;
  const origin = sheet.getBoundingClientRect();
  const rectOf = (el: Element): Rect => {
    const r = el.getBoundingClientRect();
    return { x: r.left - origin.left, y: r.top - origin.top, w: r.width, h: r.height };
  };
  const items: Item[] = [];
  const dom = (pos: number) => editor.view.nodeDOM(pos) as HTMLElement | null;

  editor.state.doc.descendants((node: PMNode, pos: number) => {
    const el = dom(pos);
    if (!(el instanceof HTMLElement)) return true;
    const name = node.type.name;
    if (name === 'section') {
      const section = el.querySelector<HTMLElement>('section.pg-section') ?? el;
      const style = getComputedStyle(section);
      const fill = visibleColor(style.backgroundColor);
      const line = style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0 ? cssToHex(style.borderTopColor) : null;
      const bar = parseFloat(style.borderLeftWidth) > 2 ? cssToHex(style.borderLeftColor) : null;
      if (fill || line) items.push({ kind: 'shape', rect: rectOf(section), fill, line, bar, radius: true });
      const header = section.querySelector<HTMLElement>(':scope > .pg-section__header');
      if (header) {
        const hs = getComputedStyle(header);
        items.push({ kind: 'shape', rect: rectOf(header), fill: visibleColor(hs.backgroundColor), line: null, bar: parseFloat(hs.borderLeftWidth) > 2 ? cssToHex(hs.borderLeftColor) : null, radius: false });
        const title = header.querySelector<HTMLElement>('.pg-section__title');
        if (title) items.push({ kind: 'text', rect: rectOf(title), el: title, list: false });
      }
      return true;
    }
    if (name === 'callout' || name === 'banner') {
      const box = name === 'callout' ? el.querySelector<HTMLElement>('.pg-callout') ?? el : el;
      const style = getComputedStyle(box);
      items.push({
        kind: 'shape',
        rect: rectOf(box),
        fill: visibleColor(style.backgroundColor) ?? (name === 'banner' ? cssToHex(style.backgroundColor, '0F766E') : null),
        line: style.borderTopStyle !== 'none' && parseFloat(style.borderTopWidth) > 0 ? cssToHex(style.borderTopColor) : null,
        bar: parseFloat(style.borderLeftWidth) > 2 ? cssToHex(style.borderLeftColor) : null,
        radius: true,
      });
      const icon = box.querySelector<HTMLElement>('.pg-callout__icon');
      if (icon) items.push({ kind: 'text', rect: rectOf(icon), el: icon, list: false });
      return true;
    }
    if (IMAGE_NODES.has(name)) {
      items.push({ kind: 'image', rect: rectOf(el), el });
      return false;
    }
    if (name === 'horizontalRule') {
      const hr = el.querySelector('hr') ?? el;
      const style = getComputedStyle(hr);
      items.push({ kind: 'line', rect: rectOf(hr), color: cssToHex(style.borderTopColor, 'C8C6C4'), weight: Math.max(0.75, parseFloat(style.borderTopWidth) * PT) });
      return false;
    }
    if (name === 'table') {
      const table = el.querySelector('table');
      if (table) items.push({ kind: 'table', rect: rectOf(table), el: table });
      return false;
    }
    if (LIST_NODES.has(name)) {
      items.push({ kind: 'text', rect: rectOf(el), el, list: true });
      return false;
    }
    if (node.isTextblock) {
      if (node.content.size) items.push({ kind: 'text', rect: rectOf(el), el, list: false });
      return false;
    }
    return true;
  });
  return items;
}

function tableRows(table: HTMLTableElement): PptxGenJS.TableRow[] {
  return Array.from(table.rows).map(row =>
    Array.from(row.cells).map(cell => {
      const style = getComputedStyle(cell);
      return {
        text: cell.innerText.trim(),
        options: {
          bold: cell.tagName === 'TH' || Number(style.fontWeight) >= 600,
          color: cssToHex(style.color),
          fill: visibleColor(style.backgroundColor) ? { color: visibleColor(style.backgroundColor)! } : undefined,
          fontSize: Math.round(parseFloat(style.fontSize) * PT),
          colspan: cell.colSpan > 1 ? cell.colSpan : undefined,
          rowspan: cell.rowSpan > 1 ? cell.rowSpan : undefined,
          valign: 'middle' as const,
        },
      };
    }),
  );
}

const inches = (rect: Rect, top: number) => ({ x: rect.x / PX, y: (rect.y - top) / PX, w: Math.max(rect.w, 1) / PX, h: Math.max(rect.h, 1) / PX });

/** Header or footer in the slide margin: three aligned text boxes and an optional rule. */
function bandOnSlide(pptx: PptxGenJS, slide: PptxGenJS.Slide, ctx: ExportContext, zone: HeaderFooterZone, page: number, total: number) {
  const { width, height, margin } = pageGeometry(ctx.settings, 'landscape');
  const slots = ctx.settings[zone];
  const x = margin / PX;
  const w = (width - 2 * margin) / PX;
  const h = Math.min(0.32, (margin * 0.6) / PX);
  const y = zone === 'header' ? (margin * 0.72) / PX - h : (height - margin * 0.72) / PX;
  let drawn = false;
  (['left', 'center', 'right'] as const).forEach(slot => {
    const text = fillFields(slots[slot], page, total, ctx.vars);
    if (!text.trim()) return;
    drawn = true;
    slide.addText(text, { x, y, w, h, fontSize: 9, color: '605E5C', fontFace: 'Segoe UI', align: slot, valign: zone === 'header' ? 'bottom' : 'top', margin: 0 });
  });
  if (drawn && ctx.settings.divider) {
    slide.addShape(pptx.ShapeType.line, { x, y: zone === 'header' ? y + h + 0.03 : y - 0.03, w, h: 0, line: { color: 'C8C6C4', width: 0.75 } });
  }
}

export async function exportPptx(ctx: ExportContext) {
  const pptx = new PptxGenJS();
  pptx.layout = 'LAYOUT_WIDE'; // 13.333 × 7.5 in, the landscape page size
  pptx.title = ctx.title;
  pptx.company = 'Apache Superset';
  const background = sheetBackground(ctx.sheet);
  const bgHex = cssToHex(background, 'FFFFFF');
  const regions = pageRegions(ctx.sheet);
  const items = collect(ctx);
  const order = { shape: 0, line: 1, image: 2, table: 3, text: 4 } as const;
  // Pre-capture images in parallel, transparent so web parts on a banner or colored section keep the shape behind them.
  const images = new Map<Item, string>();
  await Promise.all(items.filter(i => i.kind === 'image').map(async item => images.set(item, await captureElement((item as { el: HTMLElement }).el))));

  regions.forEach((region, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: bgHex };
    items
      .filter(item => item.rect.y >= region.top - 2 && item.rect.y < region.top + region.height - 2)
      .sort((a, b) => order[a.kind] - order[b.kind])
      .forEach(item => {
        const box = inches(item.rect, region.top);
        if (item.kind === 'shape') {
          slide.addShape(item.radius ? pptx.ShapeType.roundRect : pptx.ShapeType.rect, {
            ...box,
            fill: item.fill ? { color: item.fill } : { color: bgHex, transparency: 100 },
            line: item.line ? { color: item.line, width: 0.75 } : { type: 'none' },
            rectRadius: item.radius ? 0.06 : undefined,
          });
          if (item.bar) slide.addShape(pptx.ShapeType.rect, { x: box.x, y: box.y, w: 0.04, h: box.h, fill: { color: item.bar }, line: { type: 'none' } });
        } else if (item.kind === 'line') {
          slide.addShape(pptx.ShapeType.line, { x: box.x, y: box.y, w: box.w, h: 0, line: { color: item.color, width: item.weight } });
        } else if (item.kind === 'image') {
          const data = images.get(item);
          if (data) slide.addImage({ data, ...box });
        } else if (item.kind === 'table') {
          const widths = Array.from(item.el.rows[0]?.cells ?? []).map(cell => cell.getBoundingClientRect().width / PX);
          slide.addTable(tableRows(item.el), { x: box.x, y: box.y, w: box.w, colW: widths.length ? widths : undefined, rowH: Array.from(item.el.rows).map(row => row.getBoundingClientRect().height / PX), border: { type: 'solid', color: 'E1DFDD', pt: 0.5 }, margin: 0.04, autoPage: false });
        } else {
          const style = getComputedStyle(item.el);
          const runs = item.list ? listRuns(item.el) : runsFrom(item.el, style);
          if (!runs.length) return;
          const fill = item.el.classList.contains('has-block-style') ? visibleColor(style.backgroundColor) : null;
          slide.addText(runs, {
            ...box,
            fontFace: 'Segoe UI',
            fontSize: Math.round(parseFloat(style.fontSize) * PT * 10) / 10,
            color: cssToHex(style.color),
            align: (['center', 'right', 'justify'].includes(style.textAlign) ? style.textAlign : 'left') as PptxGenJS.HAlign,
            valign: 'top',
            margin: fill ? 4 : 0,
            fill: fill ? { color: fill } : undefined,
            fit: 'shrink',
            wrap: true,
            paraSpaceAfter: item.list ? 2 : 0,
          });
        }
      });
    if (showsHeaderFooter(ctx.settings, index + 1)) {
      (['header', 'footer'] as HeaderFooterZone[]).forEach(zone => bandOnSlide(pptx, slide, ctx, zone, index + 1, regions.length));
    }
  });

  await pptx.writeFile({ fileName: fileName(ctx.title, 'pptx') });
}
