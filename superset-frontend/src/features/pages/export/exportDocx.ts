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
  AlignmentType,
  BorderStyle,
  Document,
  ExternalHyperlink,
  Footer,
  Header,
  HeadingLevel,
  HeightRule,
  ImageRun,
  LevelFormat,
  Packer,
  PageBreak,
  PageNumber,
  PageOrientation,
  Paragraph,
  ShadingType,
  Tab,
  TabStopType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  type ParagraphChild,
} from 'docx';
import type { Node as PMNode, Mark } from '@tiptap/pm/model';
import { STRONG_OPACITY } from '../editor/extensions/blockStyle';
import { colorHex } from '../editor/lib/palette';
import { pageGeometry } from '../pagination/geometry';
import { fieldParts, hasSlots, type HeaderFooterSlots, type PageVars } from '../pagination/settings';
import type { KpiItem, PageProperty, QuickLink } from '../editor/extensions/webparts';
import { captureElement, dataUrlToBytes, downloadBlob, fileName, imageSize, sheetBackground, tint, type ExportContext } from './common';

/**
 * Native Word document: real headings, lists, tables, columns, callouts,
 * KPI tables and hyperlinks, with page size, margins, header and numbered
 * footer from the page settings. Charts and visual web parts are embedded as
 * images captured from the page.
 */

type Block = Paragraph | Table;
const TWIP = 15; // twips per CSS px (1440 / 96)
const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4];
const TONE_HEX: Record<string, string> = { good: '15803D', info: '1D4ED8', warn: 'B45309', bad: 'B91C1C', neutral: '64748B' };
const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, insideHorizontal: NO_BORDER, insideVertical: NO_BORDER };
const hex = (value: unknown, fallback = '0F766E') => (colorHex(value as never) ?? `#${fallback}`).replace('#', '').toUpperCase();
const align = (value: unknown) => ({ center: AlignmentType.CENTER, right: AlignmentType.RIGHT, justify: AlignmentType.JUSTIFIED })[String(value)] ?? AlignmentType.LEFT;

type Images = Map<number, { data: Uint8Array; width: number; height: number }>;

class Builder {
  /** Text color forced inside dark fills (solid blocks, banners). */
  private forceColor: string | null = null;

  constructor(
    private readonly images: Images,
    private readonly contentWidth: number,
  ) {}

  runs(node: PMNode): ParagraphChild[] {
    const out: ParagraphChild[] = [];
    node.forEach(child => {
      if (child.type.name === 'hardBreak') out.push(new TextRun({ text: '', break: 1 }));
      else if (child.type.name === 'statusPill') {
        const tone = TONE_HEX[child.attrs.tone] ?? TONE_HEX.neutral;
        out.push(new TextRun({ text: ` ${child.attrs.label} `, bold: true, size: 18, color: tone, shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(tone, 0.15) } }));
      } else if (child.isText) {
        const marks = Object.fromEntries(child.marks.map((m: Mark) => [m.type.name, m]));
        const run = new TextRun({
          text: child.text ?? '',
          bold: !!marks.bold,
          italics: !!marks.italic,
          underline: marks.underline || marks.link ? {} : undefined,
          strike: !!marks.strike,
          font: marks.code ? 'Consolas' : undefined,
          color: this.forceColor ?? (marks.link ? '0F6CBD' : marks.textStyle?.attrs.color ? String(marks.textStyle.attrs.color).replace('#', '') : undefined),
          shading: marks.highlight ? { type: ShadingType.CLEAR, color: 'auto', fill: 'FEF08A' } : undefined,
        });
        out.push(marks.link ? new ExternalHyperlink({ link: marks.link.attrs.href, children: [run] }) : run);
      }
    });
    return out;
  }

  paragraph(node: PMNode, extra: ConstructorParameters<typeof Paragraph>[0] & object = {}): Paragraph {
    const color = node.attrs.blockColor ? hex(node.attrs.blockColor) : null;
    const variant = node.attrs.blockVariant;
    const styled = color
      ? variant === 'solid'
        ? { shading: { type: ShadingType.CLEAR, color: 'auto', fill: color } }
        : variant === 'bar'
          ? { border: { left: { style: BorderStyle.SINGLE, size: 24, color, space: 8 } }, shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(color, 0.08) } }
          : { shading: { type: ShadingType.CLEAR, color: 'auto', fill: tint(color, 0.12) } }
      : {};
    const previous = this.forceColor;
    if (color && variant === 'solid') this.forceColor = 'FFFFFF';
    const children = this.runs(node);
    this.forceColor = previous;
    return new Paragraph({ children, alignment: align(node.attrs.textAlign), spacing: { after: 120 }, ...styled, ...extra });
  }

  image(pos: number, maxWidth = this.contentWidth, caption?: string): Paragraph[] {
    const image = this.images.get(pos);
    if (!image) return [];
    const scale = Math.min(1, maxWidth / image.width);
    const out = [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: caption ? 40 : 160 },
        children: [new ImageRun({ type: 'png', data: image.data, transformation: { width: Math.round(image.width * scale), height: Math.round(image.height * scale) } })],
      }),
    ];
    if (caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 160 }, children: [new TextRun({ text: caption, italics: true, size: 18, color: '605E5C' })] }));
    return out;
  }

  list(node: PMNode, level: number, ordered: boolean): Paragraph[] {
    const out: Paragraph[] = [];
    node.forEach(item => {
      item.forEach((child, _offset, index) => {
        if (child.type.name === 'paragraph') {
          const prefix = node.type.name === 'taskList' ? [new TextRun({ text: item.attrs.checked ? '☑ ' : '☐ ' })] : [];
          out.push(
            new Paragraph({
              children: [...prefix, ...this.runs(child)],
              ...(node.type.name === 'taskList' ? { indent: { left: 360 * (level + 1) } } : ordered ? { numbering: { reference: 'pg-numbers', level } } : { bullet: { level } }),
              spacing: { after: index === item.childCount - 1 ? 60 : 0 },
            }),
          );
        } else if (['bulletList', 'orderedList', 'taskList'].includes(child.type.name)) {
          out.push(...this.list(child, Math.min(level + 1, 4), child.type.name === 'orderedList'));
        }
      });
    });
    return out;
  }

  cell(children: Block[], opts: { fill?: string; width?: number; border?: string } = {}) {
    return new TableCell({
      children: children.length ? children : [new Paragraph('')],
      shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
      width: opts.width ? { size: opts.width * TWIP, type: WidthType.DXA } : undefined,
      margins: { top: 100, bottom: 100, left: 140, right: 140 },
      borders: opts.border ? { top: NO_BORDER, bottom: NO_BORDER, right: NO_BORDER, left: { style: BorderStyle.SINGLE, size: 24, color: opts.border } } : undefined,
    });
  }

  box(children: Block[], fill?: string, border?: string): Table {
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, borders: NO_BORDERS, rows: [new TableRow({ children: [this.cell(children, { fill, border })] })] });
  }

  blocks(parent: PMNode, base: number): Block[] {
    const out: Block[] = [];
    parent.forEach((node, offset) => out.push(...this.block(node, base + offset)));
    return out;
  }

  block(node: PMNode, pos: number): Block[] {
    const a = node.attrs;
    switch (node.type.name) {
      case 'paragraph':
        return [this.paragraph(node)];
      case 'heading':
        return [this.paragraph(node, { heading: HEADINGS[Math.min(a.level, 4) - 1], spacing: { before: 240, after: 120 } })];
      case 'blockquote':
        return this.blocks(node, pos + 1).map(b => (b instanceof Paragraph ? b : b));
      case 'codeBlock':
        return [new Paragraph({ children: [new TextRun({ text: node.textContent, font: 'Consolas', size: 18 })], shading: { type: ShadingType.CLEAR, color: 'auto', fill: 'F6F5F4' } })];
      case 'bulletList':
      case 'orderedList':
      case 'taskList':
        return this.list(node, 0, node.type.name === 'orderedList');
      case 'horizontalRule':
        return [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: Math.max(4, a.weight * 6), color: hex(a.color, 'C8C6C4'), space: 4 } }, spacing: { after: 200 } })];
      case 'spacer':
        return [new Paragraph({ spacing: { before: 0, after: Math.round(a.height * TWIP) } })];
      case 'pageBreak':
        return [new Paragraph({ children: [new PageBreak()] })];
      case 'image':
        return this.image(pos);
      case 'supersetChart':
        return [...(a.showTitle ? [new Paragraph({ children: [new TextRun({ text: a.sliceName, bold: true })], spacing: { before: 120, after: 60 } })] : []), ...this.image(pos, this.contentWidth, a.caption || undefined)];
      case 'chart':
      case 'card':
        return this.image(pos);
      case 'banner': {
        const fill = hex(a.color);
        const previous = this.forceColor;
        this.forceColor = 'FFFFFF';
        const inner = this.blocks(node, pos + 1);
        this.forceColor = previous;
        return [this.box(inner.length ? inner : [new Paragraph('')], fill)];
      }
      case 'callout': {
        const color = hex(a.color);
        const inner = this.blocks(node, pos + 1);
        const icon = a.icon ? [new Paragraph({ children: [new TextRun({ text: a.icon })] })] : [];
        return [this.box([...icon, ...inner], a.variant === 'solid' ? color : tint(color, 0.12), a.variant === 'bar' ? color : undefined), new Paragraph({ spacing: { after: 120 } })];
      }
      case 'section': {
        const columns: Block[][] = [];
        node.forEach((column, offset) => columns.push(this.blocks(column, pos + 1 + offset + 1)));
        const fill = a.background ? (a.backgroundVariant === 'solid' ? hex(a.background) : tint(hex(a.background), 0.1)) : undefined;
        const title = a.title ? [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun({ text: a.title })], border: { left: { style: BorderStyle.SINGLE, size: 24, color: hex(a.accent), space: 8 } } })] : [];
        if (columns.length === 1 && !fill) return [...title, ...columns[0]];
        const ratios = { two: [1, 1], three: [1, 1, 1], oneThirdLeft: [1, 2], oneThirdRight: [2, 1] }[a.layout as string] ?? [1];
        const total = ratios.reduce((s, r) => s + r, 0);
        const widths = ratios.map(r => Math.floor((this.contentWidth * r) / total));
        return [
          ...title,
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            columnWidths: widths.map(w => w * TWIP),
            borders: NO_BORDERS,
            rows: [new TableRow({ children: columns.map((blocks, i) => this.cell(blocks, { fill, width: widths[i] ?? widths[0] })) })],
          }),
          new Paragraph({ spacing: { after: 120 } }),
        ];
      }
      case 'table': {
        const header = hex(a.headerColor, '0F766E');
        const headerOpacity = (a.headerOpacity ?? 13) / 100;
        const rows: TableRow[] = [];
        node.forEach((row, rowOffset) => {
          const cells: TableCell[] = [];
          row.forEach((cell, cellOffset) => {
            const isHeader = cell.type.name === 'tableHeader';
            const cellColor = cell.attrs.cellColor ? hex(cell.attrs.cellColor) : null;
            const opacity = (cell.attrs.cellOpacity ?? 22) / 100;
            const solid = !!cellColor && opacity * 100 >= STRONG_OPACITY;
            // Strong fills take white text, like on the page.
            const previous = this.forceColor;
            if (solid) this.forceColor = 'FFFFFF';
            const inner = this.blocks(cell, pos + 1 + rowOffset + 1 + cellOffset + 1).map(b =>
              b instanceof Paragraph && isHeader
                ? new Paragraph({ children: [new TextRun({ text: cell.textContent, bold: true, color: solid || (!cellColor && headerOpacity * 100 >= STRONG_OPACITY) ? 'FFFFFF' : (cellColor ?? header) })] })
                : b,
            );
            this.forceColor = previous;
            const fill = cellColor ? tint(cellColor, opacity) : isHeader ? tint(header, headerOpacity) : undefined;
            cells.push(new TableCell({ children: inner.length ? inner : [new Paragraph('')], shading: fill ? { type: ShadingType.CLEAR, color: 'auto', fill } : undefined, columnSpan: cell.attrs.colspan, rowSpan: cell.attrs.rowspan, margins: { top: 60, bottom: 60, left: 100, right: 100 } }));
          });
          const rowHeight = row.attrs.rowHeight as number | null;
          rows.push(new TableRow({ children: cells, tableHeader: rowOffset === 0, height: rowHeight ? { value: Math.round(rowHeight * TWIP), rule: HeightRule.ATLEAST } : undefined }));
        });
        // Columns resized on the page keep their widths (scaled down if wider than the Word page).
        const widths: number[] = [];
        node.firstChild?.forEach(cell => {
          for (let i = 0; i < cell.attrs.colspan; i += 1) widths.push((cell.attrs.colwidth as number[] | null)?.[i] ?? 0);
        });
        const total = widths.reduce((sum, w) => sum + w, 0);
        if (widths.length && widths.every(w => w > 0)) {
          const fit = Math.min(1, this.contentWidth / total);
          return [
            new Table({ width: { size: Math.round(total * fit * TWIP), type: WidthType.DXA }, columnWidths: widths.map(w => Math.round(w * fit * TWIP)), rows }),
            new Paragraph({ spacing: { after: 160 } }),
          ];
        }
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }), new Paragraph({ spacing: { after: 160 } })];
      }
      case 'kpiGrid': {
        const items = (a.items ?? []) as KpiItem[];
        if (!items.length) return [];
        const cells = items.map(item => {
          const tone = TONE_HEX[item.tone] ?? TONE_HEX.neutral;
          return new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: (item.label || '').toUpperCase(), bold: true, size: 15, color: '605E5C' })] }),
              ...(item.status ? [new Paragraph({ children: [new TextRun({ text: item.status, bold: true, size: 16, color: tone })] })] : []),
              new Paragraph({ children: [new TextRun({ text: item.value || '—', bold: true, size: 32 }), new TextRun({ text: item.unit ? ` ${item.unit}` : '', size: 18, color: '605E5C' })] }),
              ...(item.delta ? [new Paragraph({ children: [new TextRun({ text: item.delta, size: 16, color: TONE_HEX[item.deltaTone] ?? tone })] })] : []),
              ...(item.note || item.target ? [new Paragraph({ children: [new TextRun({ text: [item.note, item.target].filter(Boolean).join(' · '), size: 15, color: '605E5C' })] })] : []),
            ],
            borders: { top: { style: BorderStyle.SINGLE, size: 18, color: tone }, bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E1DFDD' }, left: { style: BorderStyle.SINGLE, size: 4, color: 'E1DFDD' }, right: { style: BorderStyle.SINGLE, size: 4, color: 'E1DFDD' } },
            margins: { top: 100, bottom: 100, left: 120, right: 120 },
          });
        });
        const perRow = Math.min(items.length, Number(a.columns) || 4);
        const rows: TableRow[] = [];
        for (let i = 0; i < cells.length; i += perRow) {
          const slice = cells.slice(i, i + perRow);
          while (slice.length < perRow) slice.push(new TableCell({ children: [new Paragraph('')], borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER } }));
          rows.push(new TableRow({ children: slice }));
        }
        return [new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }), new Paragraph({ spacing: { after: 160 } })];
      }
      case 'quickLinks': {
        const items = (a.items ?? []) as QuickLink[];
        return [
          ...(a.title ? [new Paragraph({ children: [new TextRun({ text: a.title, bold: true })], spacing: { after: 60 } })] : []),
          ...items.map(item => new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: `${item.icon || ''} ` }), new ExternalHyperlink({ link: item.url || '#', children: [new TextRun({ text: item.label, color: '0F6CBD', underline: {} })] }), ...(item.description ? [new TextRun({ text: ` — ${item.description}`, color: '605E5C' })] : [])] })),
        ];
      }
      case 'pageProperties': {
        const items = (a.items ?? []) as PageProperty[];
        return [new Paragraph({ spacing: { after: 160 }, children: items.flatMap((item, i) => [new TextRun({ text: `${i ? '     ' : ''}${item.label.toUpperCase()}: `, bold: true, size: 16, color: this.forceColor ?? '605E5C' }), new TextRun({ text: item.value, bold: true, size: 18, color: this.forceColor ?? undefined })]) })];
      }
      default:
        return node.isTextblock ? [this.paragraph(node)] : node.childCount ? this.blocks(node, pos + 1) : [];
    }
  }
}

/** One header/footer paragraph: left, center and right slots on tab stops, page numbers as live fields. */
function band(slots: HeaderFooterSlots, vars: PageVars, width: number, edge: 'top' | 'bottom', divider: boolean) {
  const children: TextRun[] = [];
  (['left', 'center', 'right'] as const).forEach((slot, i) => {
    if (i > 0) children.push(new TextRun({ children: [new Tab()] }));
    fieldParts(slots[slot], vars).forEach(part =>
      children.push(new TextRun({ size: 16, color: '605E5C', children: ['text' in part ? part.text : part.field === 'page' ? PageNumber.CURRENT : PageNumber.TOTAL_PAGES] })),
    );
  });
  const rule = divider ? { [edge === 'top' ? 'bottom' : 'top']: { style: BorderStyle.SINGLE, size: 4, color: 'C8C6C4', space: 4 } } : undefined;
  return new Paragraph({
    children,
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round((width * TWIP) / 2) },
      { type: TabStopType.RIGHT, position: Math.round(width * TWIP) },
    ],
    border: rule,
  });
}

const IMAGE_TYPES = new Set(['supersetChart', 'chart', 'card', 'image']);

export async function exportDocx(ctx: ExportContext) {
  const { editor, settings } = ctx;
  const geometry = pageGeometry(settings, 'portrait');
  const contentWidth = geometry.width - 2 * geometry.margin;
  const background = sheetBackground(ctx.sheet);

  // Capture charts and visual web parts as images, keyed by document position.
  const images: Images = new Map();
  const jobs: Array<Promise<void>> = [];
  editor.state.doc.descendants((node, pos) => {
    if (!IMAGE_TYPES.has(node.type.name)) return true;
    const dom = editor.view.nodeDOM(pos) as HTMLElement | null;
    const target = node.type.name === 'supersetChart' ? dom?.querySelector<HTMLElement>('[data-chart-capture]') : dom;
    if (target instanceof HTMLElement) {
      jobs.push(
        captureElement(target, background).then(async url => {
          const size = await imageSize(url);
          images.set(pos, { data: dataUrlToBytes(url), width: size.width / 2, height: size.height / 2 });
        }),
      );
    }
    return false;
  });
  await Promise.all(jobs);

  const builder = new Builder(images, contentWidth);
  const children = builder.blocks(editor.state.doc, 0);
  const margin = Math.round(geometry.margin * TWIP);
  const header = hasSlots(settings.header) ? new Header({ children: [band(settings.header, ctx.vars, contentWidth, 'top', settings.divider)] }) : null;
  const footer = hasSlots(settings.footer) ? new Footer({ children: [band(settings.footer, ctx.vars, contentWidth, 'bottom', settings.divider)] }) : null;
  // "Different first page" uses Word's title-page setting with empty first-page bands.
  const first = settings.differentFirstPage;

  const doc = new Document({
    creator: 'Apache Superset Pages',
    title: ctx.title,
    styles: { default: { document: { run: { font: 'Calibri', size: 21 } } } },
    numbering: {
      config: [
        {
          reference: 'pg-numbers',
          levels: [0, 1, 2, 3, 4].map(level => ({
            level,
            format: [LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER, LevelFormat.LOWER_ROMAN, LevelFormat.DECIMAL, LevelFormat.LOWER_LETTER][level],
            text: `%${level + 1}.`,
            alignment: AlignmentType.START,
            style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
          })),
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: Math.round(geometry.width * TWIP), height: Math.round(geometry.height * TWIP), orientation: PageOrientation.PORTRAIT },
            margin: { top: margin, bottom: margin, left: margin, right: margin, header: Math.round(margin * 0.45), footer: Math.round(margin * 0.45) },
          },
          titlePage: first,
        },
        headers: header ? { default: header, ...(first ? { first: new Header({ children: [new Paragraph('')] }) } : {}) } : undefined,
        footers: footer ? { default: footer, ...(first ? { first: new Footer({ children: [new Paragraph('')] }) } : {}) } : undefined,
        children: children.length ? children : [new Paragraph('')],
      },
    ],
  });
  downloadBlob(await Packer.toBlob(doc), fileName(ctx.title, 'docx'));
}
