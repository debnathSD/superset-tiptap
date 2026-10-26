import type { JSONContent } from '@tiptap/core'
import type { SectionAttrs, SectionLayout } from '../extensions/section'
import type { ChartAttrs, KpiItem, PageProperty, QuickLink } from '../extensions/webparts'
import { uid } from '../lib/nodeAttrs'
import type { Tone } from '../lib/palette'

/** Tiny JSON builders so templates and the sample page read like the page they produce. */

type Inline = JSONContent | string
type MarkName = 'bold' | 'italic' | 'underline' | 'code' | 'strike'

const inline = (items: Inline[]): JSONContent[] =>
  items.filter(i => i !== '').map(i => (typeof i === 'string' ? { type: 'text', text: i } : i))

export const text = (value: string, ...marks: MarkName[]): JSONContent => ({
  type: 'text',
  text: value,
  ...(marks.length ? { marks: marks.map(type => ({ type })) } : {}),
})
export const b = (value: string) => text(value, 'bold')
export const link = (value: string, href: string, ...marks: MarkName[]): JSONContent => ({
  type: 'text',
  text: value,
  marks: [{ type: 'link', attrs: { href } }, ...marks.map(type => ({ type }))],
})
export const colored = (value: string, color: string, ...marks: MarkName[]): JSONContent => ({
  type: 'text',
  text: value,
  marks: [{ type: 'textStyle', attrs: { color } }, ...marks.map(type => ({ type }))],
})
export const pill = (label: string, tone: Tone): JSONContent => ({ type: 'statusPill', attrs: { label, tone } })

export const p = (...content: Inline[]): JSONContent => ({ type: 'paragraph', ...(content.length ? { content: inline(content) } : {}) })
export const styled = (
  block: JSONContent,
  blockColor: string,
  blockVariant: 'tint' | 'solid' | 'bar' = 'tint',
): JSONContent => ({ ...block, attrs: { ...block.attrs, blockColor, blockVariant } })
export const h = (level: 1 | 2 | 3 | 4, ...content: Inline[]): JSONContent => ({
  type: 'heading',
  attrs: { level },
  content: inline(content),
})
export const bullets = (...items: Array<Inline[] | { item: Inline[]; children: Inline[][] }>): JSONContent => ({
  type: 'bulletList',
  content: items.map(entry => {
    const { item, children } = Array.isArray(entry) ? { item: entry, children: [] } : entry
    return {
      type: 'listItem',
      content: [p(...item), ...(children.length ? [bullets(...children)] : [])],
    }
  }),
})

export const column = (...content: JSONContent[]): JSONContent => ({ type: 'column', content: content.length ? content : [p()] })
export const section = (
  layout: SectionLayout,
  attrs: Partial<SectionAttrs>,
  ...columns: JSONContent[][]
): JSONContent => ({
  type: 'section',
  attrs: { layout, ...attrs },
  content: columns.map(blocks => column(...blocks)),
})

export const callout = (attrs: Record<string, unknown>, ...content: JSONContent[]): JSONContent => ({
  type: 'callout',
  attrs,
  content,
})
export const card = (attrs: Record<string, unknown>, ...content: JSONContent[]): JSONContent => ({ type: 'card', attrs, content })
export const banner = (attrs: Record<string, unknown>, ...content: JSONContent[]): JSONContent => ({ type: 'banner', attrs, content })
export const divider = (attrs: Record<string, unknown> = {}): JSONContent => ({ type: 'horizontalRule', attrs })
export const spacer = (height: number): JSONContent => ({ type: 'spacer', attrs: { height } })

export const kpis = (items: Array<Partial<KpiItem>>, columns = 0): JSONContent => ({
  type: 'kpiGrid',
  attrs: {
    columns,
    items: items.map(item => ({
      label: '',
      value: '',
      unit: '',
      status: '',
      tone: 'neutral',
      delta: '',
      deltaTone: 'neutral',
      progress: null,
      target: '',
      note: '',
      ...item,
      id: uid('kpi'),
    })),
  },
})

export const quickLinks = (attrs: { title?: string; layout?: string; columns?: number; color?: string }, items: Array<Partial<QuickLink>>): JSONContent => ({
  type: 'quickLinks',
  attrs: {
    ...attrs,
    items: items.map(item => ({ label: '', url: '', icon: '🔗', description: '', ...item, id: uid('ql') })),
  },
})

export const chart = (attrs: Partial<Omit<ChartAttrs, 'data'>>, data: Array<[label: string, value: number, sublabel?: string]>): JSONContent => ({
  type: 'chart',
  attrs: { ...attrs, data: data.map(([label, value, sublabel = '']) => ({ id: uid('pt'), label, value, sublabel })) },
})

export const pageProperties = (items: Array<[label: string, value: string]>, color: string | null = null): JSONContent => ({
  type: 'pageProperties',
  attrs: { color, items: items.map(([label, value]) => ({ id: uid('prop'), label, value })) satisfies PageProperty[] },
})

type Cell = Inline[] | { content: Inline[]; color?: string }
export const table = (header: string[], rows: Cell[][], attrs: Record<string, unknown> = {}): JSONContent => ({
  type: 'table',
  attrs,
  content: [
    { type: 'tableRow', content: header.map(label => ({ type: 'tableHeader', content: [p(label)] })) },
    ...rows.map(row => ({
      type: 'tableRow',
      content: row.map(cell => {
        const { content, color } = Array.isArray(cell) ? { content: cell, color: undefined } : cell
        return { type: 'tableCell', attrs: color ? { cellColor: color } : {}, content: [p(...content)] }
      }),
    })),
  ],
})

/** Offline, theme-friendly placeholder artwork for cards and banners. */
export function artwork(from: string, to: string, variant = 0): string {
  const shapes = [
    `<circle cx='640' cy='90' r='150' fill='#fff' fill-opacity='.10'/><circle cx='700' cy='60' r='70' fill='#fff' fill-opacity='.10'/>`,
    `<rect x='520' y='-40' width='260' height='260' rx='48' transform='rotate(18 650 90)' fill='#fff' fill-opacity='.10'/>`,
    `<circle cx='140' cy='80' r='110' fill='#fff' fill-opacity='.08'/><circle cx='620' cy='300' r='190' fill='#fff' fill-opacity='.07'/>`,
  ][variant % 3]
  const svg =
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 800 450' preserveAspectRatio='xMidYMid slice'>` +
    `<defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0' stop-color='${from}'/><stop offset='1' stop-color='${to}'/></linearGradient></defs>` +
    `<rect width='800' height='450' fill='url(#g)'/>${shapes}` +
    `<path d='M0 340 C 180 270 380 420 800 300 L800 450 L0 450Z' fill='#000' fill-opacity='.14'/>` +
    `<path d='M0 380 C 220 330 460 450 800 360 L800 450 L0 450Z' fill='#000' fill-opacity='.12'/></svg>`
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function blankDoc(title: string): JSONContent {
  return {
    type: 'doc',
    attrs: { pageWidth: 'standard' },
    content: [
      h(1, title),
      { type: 'section', attrs: { layout: 'one' }, content: [{ type: 'column', content: [p()] }] },
    ],
  }
}
