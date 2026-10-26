import { Extension, mergeAttributes, Node } from '@tiptap/core'
import type { DOMOutputSpec } from '@tiptap/pm/model'
import { Plugin } from '@tiptap/pm/state'
import { colorAttrs, mergeStyles, normalizeColor, normalizeTone, type Tone } from '../lib/palette'
import { parseJSONAttr } from '../lib/nodeAttrs'

/**
 * Configurable "web parts": atoms whose content lives in attributes and is
 * edited from the property pane, like SharePoint web parts. Their renderHTML
 * output is the real rendering (no React node view), so the editor, the
 * read-only view and exported HTML are identical.
 */

const jsonAttr = <T,>(name: string, fallback: T) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => parseJSONAttr<T>(el, `data-${name}`, fallback),
  renderHTML: () => ({}),
})
const plain = <T extends string | number | boolean | null>(name: string, fallback: T, parse: (v: string) => T = v => v as T) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const value = el.getAttribute(`data-${name}`)
    return value === null ? fallback : parse(value)
  },
  renderHTML: () => ({}),
})
const colorAttr = (fallback: string | null) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => (el.hasAttribute('data-color-value') ? normalizeColor(el.getAttribute('data-color-value')) : fallback),
  renderHTML: () => ({}),
})

const webPart = {
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,
} as const

// ── Quick links ──────────────────────────────────────────────────────────────

export type QuickLink = { id: string; label: string; url: string; icon: string; description: string }

export const QuickLinks = Node.create({
  name: 'quickLinks',
  ...webPart,

  addAttributes() {
    return {
      title: plain('title', ''),
      layout: plain('layout', 'tiles'),
      columns: plain('columns', 3, Number),
      color: colorAttr('teal'),
      items: jsonAttr<QuickLink[]>('items', []),
    }
  },

  parseHTML() {
    return [{ tag: 'nav[data-type="quick-links"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { title, layout, columns, color, items } = node.attrs as {
      title: string
      layout: string
      columns: number
      color: string | null
      items: QuickLink[]
    }
    const colors = colorAttrs(color)
    const list: DOMOutputSpec[] = items.map(item => [
      'li',
      { class: 'pg-links__item' },
      [
        'a',
        { class: 'pg-link', href: item.url || '#', target: '_blank', rel: 'noopener noreferrer' },
        ['span', { class: 'pg-link__icon', 'aria-hidden': 'true' }, item.icon || '🔗'],
        [
          'span',
          { class: 'pg-link__text' },
          ['span', { class: 'pg-link__label' }, item.label || 'Untitled link'],
          ...(item.description ? [['span', { class: 'pg-link__desc' }, item.description] as DOMOutputSpec] : []),
        ],
        ['span', { class: 'pg-link__arrow', 'aria-hidden': 'true' }, '↗'],
      ],
    ])
    return [
      'nav',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'quick-links',
        class: 'pg-links',
        'aria-label': title || 'Quick links',
        'data-title': title || undefined,
        'data-layout': layout,
        'data-columns': columns,
        'data-color-value': color ?? undefined,
        'data-color': colors['data-color'],
        'data-items': JSON.stringify(items),
        style: mergeStyles(`--cols: ${columns};`, colors.style),
      }),
      ...(title ? [['div', { class: 'pg-webpart__title' }, title] as DOMOutputSpec] : []),
      ['ul', { class: 'pg-links__list' }, ...(list.length ? list : [['li', { class: 'pg-empty' }, 'Add links from the property pane']])],
    ]
  },
})

// ── KPI tiles ────────────────────────────────────────────────────────────────

export type KpiItem = {
  id: string
  label: string
  value: string
  unit: string
  status: string
  tone: Tone
  delta: string
  deltaTone: Tone
  progress: number | null
  target: string
  note: string
}

export const KpiGrid = Node.create({
  name: 'kpiGrid',
  ...webPart,

  addAttributes() {
    return {
      columns: plain('columns', 0, Number),
      items: jsonAttr<KpiItem[]>('items', []),
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="kpi-grid"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const items = node.attrs.items as KpiItem[]
    const columns = node.attrs.columns as number
    const tiles: DOMOutputSpec[] = items.map(item => {
      const tone = normalizeTone(item.tone)
      const parts: DOMOutputSpec[] = [['div', { class: 'pg-kpi__label' }, item.label || 'KPI']]
      if (item.status) parts.push(['span', { class: 'pg-pill', 'data-tone': tone }, item.status])
      parts.push(['div', { class: 'pg-kpi__value' }, item.value || '—', ...(item.unit ? [['span', { class: 'pg-kpi__unit' }, item.unit] as DOMOutputSpec] : [])])
      if (item.delta) parts.push(['div', { class: 'pg-kpi__delta', 'data-tone': normalizeTone(item.deltaTone) }, item.delta])
      if (typeof item.progress === 'number') {
        const pct = Math.max(0, Math.min(100, item.progress))
        parts.push(['div', { class: 'pg-kpi__track', role: 'img', 'aria-label': `${pct}%` }, ['div', { class: 'pg-kpi__fill', style: `width: ${pct}%` }]])
      }
      if (item.target || item.note) {
        parts.push([
          'div',
          { class: 'pg-kpi__meta' },
          ...(item.note ? [['span', {}, item.note] as DOMOutputSpec] : []),
          ...(item.target ? [['span', { class: 'pg-kpi__target' }, item.target] as DOMOutputSpec] : []),
        ])
      }
      return ['div', { class: 'pg-kpi', 'data-tone': tone }, ...parts]
    })
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'kpi-grid',
        class: 'pg-kpis',
        'data-columns': columns,
        'data-items': JSON.stringify(items),
        style: columns ? `--cols: ${columns};` : undefined,
      }),
      ...(tiles.length ? tiles : [['div', { class: 'pg-empty' }, 'Add KPI tiles from the property pane'] as DOMOutputSpec]),
    ]
  },
})

// ── Chart ────────────────────────────────────────────────────────────────────

export type ChartDatum = { id: string; label: string; sublabel: string; value: number }

export type ChartAttrs = {
  title: string
  caption: string
  kind: 'column' | 'bar'
  format: 'number' | 'percent' | 'compact'
  decimals: number
  axisMin: number | null
  axisMax: number | null
  color: string | null
  highlight: 'none' | 'last' | 'max'
  data: ChartDatum[]
}

export function formatValue(value: number, format: ChartAttrs['format'], decimals: number) {
  if (!Number.isFinite(value)) return '—'
  if (format === 'percent') return `${value.toFixed(decimals)}%`
  if (format === 'compact') return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: decimals }).format(value)
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}

/** Bar length as a 0–100 percentage of the axis. Non-zero baselines are allowed (e.g. 98–99%). */
export function barExtent(value: number, attrs: Pick<ChartAttrs, 'axisMin' | 'axisMax' | 'data'>) {
  const values = attrs.data.map(d => d.value).filter(Number.isFinite)
  const min = attrs.axisMin ?? Math.min(0, ...values)
  const max = attrs.axisMax ?? Math.max(...values, min + 1)
  if (max <= min) return 100
  return Math.max(2, Math.min(100, ((value - min) / (max - min)) * 100))
}

export const Chart = Node.create({
  name: 'chart',
  ...webPart,

  addAttributes() {
    const num = (name: string) => ({
      default: null,
      parseHTML: (el: HTMLElement) => {
        const raw = el.getAttribute(`data-${name}`)
        return raw === null || raw === '' ? null : Number(raw)
      },
      renderHTML: () => ({}),
    })
    return {
      title: plain('title', ''),
      caption: plain('caption', ''),
      kind: plain('kind', 'column'),
      format: plain('format', 'number'),
      decimals: plain('decimals', 0, Number),
      axisMin: num('axis-min'),
      axisMax: num('axis-max'),
      color: colorAttr('teal'),
      highlight: plain('highlight', 'none'),
      data: jsonAttr<ChartDatum[]>('data', []),
    }
  },

  parseHTML() {
    return [{ tag: 'figure[data-type="chart"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = node.attrs as ChartAttrs
    const colors = colorAttrs(attrs.color)
    const values = attrs.data.map(d => d.value)
    const maxIndex = values.indexOf(Math.max(...values))
    const bars: DOMOutputSpec[] = attrs.data.map((datum, index) => {
      const highlighted =
        (attrs.highlight === 'last' && index === attrs.data.length - 1) || (attrs.highlight === 'max' && index === maxIndex)
      return [
        'div',
        { class: 'pg-chart__item', 'data-highlight': highlighted ? 'true' : undefined },
        [
          'div',
          { class: 'pg-chart__track' },
          ['span', { class: 'pg-chart__value' }, formatValue(datum.value, attrs.format, attrs.decimals)],
          ['div', { class: 'pg-chart__bar', style: `--extent: ${(barExtent(datum.value, attrs) / 100).toFixed(4)}` }],
        ],
        ['span', { class: 'pg-chart__label' }, datum.label],
        ...(datum.sublabel ? [['span', { class: 'pg-chart__sublabel' }, datum.sublabel] as DOMOutputSpec] : []),
      ]
    })
    return [
      'figure',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'chart',
        class: 'pg-chart',
        'data-kind': attrs.kind,
        'data-title': attrs.title || undefined,
        'data-caption': attrs.caption || undefined,
        'data-format': attrs.format,
        'data-decimals': attrs.decimals,
        'data-axis-min': attrs.axisMin ?? undefined,
        'data-axis-max': attrs.axisMax ?? undefined,
        'data-highlight': attrs.highlight,
        'data-color-value': attrs.color ?? undefined,
        'data-color': colors['data-color'],
        'data-data': JSON.stringify(attrs.data),
        style: colors.style,
      }),
      ...(attrs.title ? [['figcaption', { class: 'pg-webpart__title' }, attrs.title] as DOMOutputSpec] : []),
      ['div', { class: 'pg-chart__plot', role: 'img', 'aria-label': chartSummary(attrs) }, ...bars],
      ...(attrs.caption ? [['p', { class: 'pg-chart__caption' }, attrs.caption] as DOMOutputSpec] : []),
    ]
  },
})

function chartSummary(attrs: ChartAttrs) {
  const points = attrs.data.map(d => `${d.label} ${formatValue(d.value, attrs.format, attrs.decimals)}`).join(', ')
  return `${attrs.title || 'Bar chart'}: ${points}`
}

// ── Page properties strip ────────────────────────────────────────────────────

export type PageProperty = { id: string; label: string; value: string }

export const PageProperties = Node.create({
  name: 'pageProperties',
  ...webPart,

  addAttributes() {
    return {
      color: colorAttr(null),
      items: jsonAttr<PageProperty[]>('items', []),
    }
  },

  parseHTML() {
    return [{ tag: 'dl[data-type="page-properties"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const items = node.attrs.items as PageProperty[]
    const colors = colorAttrs(node.attrs.color)
    return [
      'dl',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'page-properties',
        class: 'pg-props',
        'data-color-value': node.attrs.color ?? undefined,
        'data-color': colors['data-color'],
        'data-items': JSON.stringify(items),
        style: colors.style,
      }),
      ...(items.length
        ? items.map(item => ['div', { class: 'pg-props__item' }, ['dt', {}, item.label], ['dd', {}, item.value || '—']] as DOMOutputSpec)
        : [['div', { class: 'pg-empty' }, 'Add properties from the property pane'] as DOMOutputSpec]),
    ]
  },
})

// ── Status pill (inline) ─────────────────────────────────────────────────────

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    statusPill: { insertStatusPill: (attrs?: { label?: string; tone?: Tone }) => ReturnType }
  }
}

export const StatusPill = Node.create({
  name: 'statusPill',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      label: plain('label', 'On track'),
      tone: plain('tone', 'good'),
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="status-pill"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'span',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'status-pill',
        class: 'pg-pill',
        'data-label': node.attrs.label,
        'data-tone': normalizeTone(node.attrs.tone),
      }),
      node.attrs.label,
    ]
  },

  renderText({ node }) {
    return `[${node.attrs.label}]`
  },

  addCommands() {
    return {
      insertStatusPill:
        (attrs = {}) =>
        ({ commands }) =>
          commands.insertContent([{ type: this.name, attrs }, { type: 'text', text: ' ' }]),
    }
  },
})

/** Links inside web parts are live in view mode; while editing, a click selects the web part instead. */
export const WebPartLinkGuard = Extension.create({
  name: 'webPartLinkGuard',
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          handleDOMEvents: {
            click: (view, event) => {
              if (view.editable && (event.target as HTMLElement).closest('a.pg-link, a.pg-card__cta')) event.preventDefault()
              return false
            },
          },
        },
      }),
    ]
  },
})
