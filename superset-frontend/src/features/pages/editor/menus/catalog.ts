import type { Editor } from '@tiptap/core'
import {
  BarChart3,
  CheckSquare,
  Code2,
  Columns2,
  Columns3,
  FileText,
  Gauge,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  HelpCircle,
  Image as ImageIcon,
  LayoutPanelLeft,
  LayoutPanelTop,
  Link2,
  List,
  ListOrdered,
  Megaphone,
  Minus,
  MoveVertical,
  PanelLeft,
  PanelRight,
  Quote,
  SeparatorHorizontal,
  AreaChart,
  Square,
  Table2,
  Tag,
  Text,
  type LucideIcon,
} from 'lucide-react'
import { artwork, b, banner, callout, card, chart, h, kpis, p, pageProperties, quickLinks, section } from '../content/builders'
import { pickImageFile } from '../lib/dom'
import { insertBlock } from '../lib/insert'

/**
 * Everything an author can insert, in one catalog shared by the "/" menu,
 * the toolbar's Insert menu and the drag-handle "+" button.
 */

export type InsertGroup = 'Text' | 'Layout' | 'Web parts' | 'Data'

export type InsertItem = {
  id: string
  title: string
  description: string
  group: InsertGroup
  icon: LucideIcon
  keywords: string[]
  run: (editor: Editor) => void
}

export const INSERT_GROUPS: InsertGroup[] = ['Text', 'Layout', 'Web parts', 'Data']

const card3 = (title: string, body: string, from: string, to: string, variant: number) =>
  card({ image: artwork(from, to, variant), href: 'https://tiptap.dev', cta: 'Read more' }, h(3, title), p(body))

export const INSERT_ITEMS: InsertItem[] = [
  // ── Text ──
  { id: 'paragraph', title: 'Text', description: 'Plain paragraph', group: 'Text', icon: Text, keywords: ['p', 'body'], run: e => e.chain().focus().setParagraph().run() },
  { id: 'h1', title: 'Heading 1', description: 'Page title', group: 'Text', icon: Heading1, keywords: ['title', 'h1'], run: e => e.chain().focus().setHeading({ level: 1 }).run() },
  { id: 'h2', title: 'Heading 2', description: 'Section heading', group: 'Text', icon: Heading2, keywords: ['h2', 'subtitle'], run: e => e.chain().focus().setHeading({ level: 2 }).run() },
  { id: 'h3', title: 'Heading 3', description: 'Sub-section heading', group: 'Text', icon: Heading3, keywords: ['h3'], run: e => e.chain().focus().setHeading({ level: 3 }).run() },
  { id: 'h4', title: 'Heading 4', description: 'Small heading', group: 'Text', icon: Heading4, keywords: ['h4'], run: e => e.chain().focus().setHeading({ level: 4 }).run() },
  { id: 'bullets', title: 'Bulleted list', description: 'Simple list', group: 'Text', icon: List, keywords: ['ul', 'unordered'], run: e => e.chain().focus().toggleBulletList().run() },
  { id: 'numbers', title: 'Numbered list', description: 'Ordered steps', group: 'Text', icon: ListOrdered, keywords: ['ol', 'ordered'], run: e => e.chain().focus().toggleOrderedList().run() },
  { id: 'tasks', title: 'Checklist', description: 'Track tasks', group: 'Text', icon: CheckSquare, keywords: ['todo', 'task'], run: e => e.chain().focus().toggleTaskList().run() },
  { id: 'quote', title: 'Quote', description: 'Pull quote', group: 'Text', icon: Quote, keywords: ['blockquote'], run: e => e.chain().focus().toggleBlockquote().run() },
  { id: 'code', title: 'Code block', description: 'Monospaced snippet', group: 'Text', icon: Code2, keywords: ['pre', 'snippet'], run: e => e.chain().focus().toggleCodeBlock().run() },

  // ── Layout (regions) ──
  { id: 'section-1', title: 'Section · one column', description: 'Full-width region', group: 'Layout', icon: Square, keywords: ['region', 'section', 'layout'], run: e => e.chain().focus().insertSection({ layout: 'one' }).run() },
  { id: 'section-2', title: 'Section · two columns', description: 'Side-by-side region', group: 'Layout', icon: Columns2, keywords: ['region', 'columns', 'layout'], run: e => e.chain().focus().insertSection({ layout: 'two' }).run() },
  { id: 'section-3', title: 'Section · three columns', description: 'Three equal columns', group: 'Layout', icon: Columns3, keywords: ['region', 'columns', 'layout'], run: e => e.chain().focus().insertSection({ layout: 'three' }).run() },
  { id: 'section-left', title: 'Section · one-third left', description: 'Narrow left, wide right', group: 'Layout', icon: PanelLeft, keywords: ['region', 'sidebar', 'layout'], run: e => e.chain().focus().insertSection({ layout: 'oneThirdLeft' }).run() },
  { id: 'section-right', title: 'Section · one-third right', description: 'Wide left, narrow right', group: 'Layout', icon: PanelRight, keywords: ['region', 'sidebar', 'layout'], run: e => e.chain().focus().insertSection({ layout: 'oneThirdRight' }).run() },
  {
    id: 'section-collapsible',
    title: 'Collapsible section',
    description: 'Region with a title that folds',
    group: 'Layout',
    icon: LayoutPanelTop,
    keywords: ['region', 'accordion', 'expand', 'collapse'],
    run: e => e.chain().focus().insertSection({ layout: 'one', attrs: { title: 'Section title', collapsible: true, border: 'subtle' } }).run(),
  },
  { id: 'divider', title: 'Divider', description: 'Horizontal line between content', group: 'Layout', icon: Minus, keywords: ['hr', 'line', 'rule', 'separator'], run: e => insertBlock(e, { type: 'horizontalRule' }) },
  {
    id: 'page-break',
    title: 'Page break',
    description: 'Start a new page or slide',
    group: 'Layout',
    icon: SeparatorHorizontal,
    keywords: ['page', 'break', 'new page', 'slide', 'pagination'],
    run: e => e.chain().focus().insertPageBreak().run(),
  },
  { id: 'spacer', title: 'Spacer', description: 'Adjustable vertical space', group: 'Layout', icon: MoveVertical, keywords: ['space', 'gap', 'whitespace'], run: e => insertBlock(e, { type: 'spacer', attrs: { height: 48 } }) },
  {
    id: 'banner',
    title: 'Banner',
    description: 'Full-bleed hero with color or image',
    group: 'Layout',
    icon: Megaphone,
    keywords: ['hero', 'cover', 'header'],
    run: e =>
      insertBlock(
        e,
        banner({ color: 'teal', fill: 'gradient', size: 'md' }, h(1, 'Banner headline'), p('A short line that sets up the rest of the page.')),
      ),
  },

  // ── Web parts ──
  {
    id: 'callout',
    title: 'Callout',
    description: 'Tinted box with an icon',
    group: 'Web parts',
    icon: LayoutPanelLeft,
    keywords: ['note', 'info', 'tip', 'warning', 'alert'],
    run: e => insertBlock(e, callout({ color: 'teal', icon: '💡', variant: 'tint' }, p(b('Good to know')), p('Use callouts to highlight important information.'))),
  },
  {
    id: 'faq',
    title: 'FAQ',
    description: 'Question with a collapsible answer',
    group: 'Web parts',
    icon: HelpCircle,
    keywords: ['question', 'accordion', 'toggle', 'details'],
    run: e =>
      insertBlock(
        e,
        callout(
          { color: 'blue', icon: '❓', variant: 'bar', collapsible: true, defaultOpen: true },
          p(b('What question do readers ask most?')),
          p('Answer it here. Readers can fold the answer away.'),
        ),
      ),
  },
  {
    id: 'card',
    title: 'Editorial card',
    description: 'Image, heading and summary',
    group: 'Web parts',
    icon: FileText,
    keywords: ['news', 'tile', 'teaser', 'hero'],
    run: e => insertBlock(e, card3('Card headline', 'A short summary that invites readers to learn more.', '#0f766e', '#1d4ed8', 0)),
  },
  {
    id: 'card-row',
    title: 'Card row',
    description: 'Three cards in a three-column section',
    group: 'Web parts',
    icon: Columns3,
    keywords: ['news', 'cards', 'grid', 'highlights'],
    run: e =>
      e
        .chain()
        .focus()
        .insertTopLevel(
          section(
            'three',
            {},
            [card3('First story', 'Summarise the story in a sentence or two.', '#0f766e', '#0e7490', 0)],
            [card3('Second story', 'Cards keep image, title and text together.', '#4338ca', '#7e22ce', 1)],
            [card3('Third story', 'Drag cards between columns to reorder.', '#c2410c', '#be185d', 2)],
          ),
        )
        .run(),
  },
  {
    id: 'quick-links',
    title: 'Quick links',
    description: 'Curated set of links',
    group: 'Web parts',
    icon: Link2,
    keywords: ['links', 'navigation', 'buttons', 'resources'],
    run: e =>
      insertBlock(
        e,
        quickLinks({ title: 'Quick links', layout: 'tiles', columns: 3, color: 'teal' }, [
          { label: 'Tiptap docs', url: 'https://tiptap.dev/docs', icon: '📘', description: 'Editor framework' },
          { label: 'Team site', url: 'https://example.com', icon: '🏠', description: 'Home for the team' },
          { label: 'Roadmap', url: 'https://example.com/roadmap', icon: '🗺️', description: 'What is next' },
        ]),
      ),
  },
  {
    id: 'image',
    title: 'Image',
    description: 'Upload a resizable image',
    group: 'Web parts',
    icon: ImageIcon,
    keywords: ['picture', 'photo', 'upload'],
    run: async e => {
      const src = await pickImageFile()
      if (src) insertBlock(e, { type: 'image', attrs: { src, alt: '' } })
    },
  },
  {
    id: 'table',
    title: 'Table',
    description: 'Rows and columns with cell colors',
    group: 'Web parts',
    icon: Table2,
    keywords: ['grid', 'rows', 'columns'],
    run: e => e.chain().focus().insertTable({ rows: 4, cols: 4, withHeaderRow: true }).run(),
  },

  // ── Data ──
  {
    id: 'superset-chart',
    title: 'Chart',
    description: 'Embed any saved Superset chart',
    group: 'Data',
    icon: AreaChart,
    keywords: ['chart', 'superset', 'visualization', 'explore', 'slice', 'graph'],
    // The chart picker lives in the page editor; ask it to open.
    run: () => window.dispatchEvent(new CustomEvent('pg:open-chart-picker')),
  },
  {
    id: 'kpis',
    title: 'KPI tiles',
    description: 'Headline numbers with status',
    group: 'Data',
    icon: Gauge,
    keywords: ['metrics', 'numbers', 'stats', 'scorecard'],
    run: e =>
      insertBlock(
        e,
        kpis([
          { label: 'Active users', value: '12,480', status: 'Growing', tone: 'good', delta: '+1,204 vs last month', deltaTone: 'good', progress: 72, note: 'As of today' },
          { label: 'Lead time', value: '41.2', unit: 'days', status: 'At risk', tone: 'warn', delta: '+5.2 d over', deltaTone: 'bad', progress: 58, target: 'Target ≤ 36' },
          { label: 'Coverage', value: '97.8', unit: '%', status: 'Declining', tone: 'bad', delta: '−0.4 pp', deltaTone: 'bad', progress: 97 },
        ]),
      ),
  },
  {
    id: 'chart',
    title: 'Simple bar chart',
    description: 'Bars from values you type in',
    group: 'Data',
    icon: BarChart3,
    keywords: ['graph', 'columns', 'trend', 'visualization'],
    run: e =>
      insertBlock(
        e,
        chart({ title: 'Monthly total', caption: 'Month-end values', format: 'number', color: 'teal', highlight: 'last' }, [
          ['Jul', 4920, '31 Jul'],
          ['Aug', 5610, '31 Aug'],
          ['Sep', 6045, '30 Sep'],
          ['Oct', 6812, 'MTD'],
        ]),
      ),
  },
  {
    id: 'status',
    title: 'Status pill',
    description: 'Inline On track / At risk label',
    group: 'Data',
    icon: Tag,
    keywords: ['badge', 'label', 'rag', 'tag'],
    run: e => e.chain().focus().insertStatusPill({ label: 'On track', tone: 'good' }).run(),
  },
  {
    id: 'page-properties',
    title: 'Page properties',
    description: 'Metadata strip (period, owner, scope)',
    group: 'Data',
    icon: FileText,
    keywords: ['metadata', 'properties', 'details', 'info'],
    run: e =>
      insertBlock(
        e,
        pageProperties([
          ['Owner', 'Your name'],
          ['Period', 'This quarter'],
          ['Status', 'Draft'],
        ]),
      ),
  },
]

export function filterInsertItems(query: string) {
  const q = query.trim().toLowerCase()
  if (!q) return INSERT_ITEMS
  return INSERT_ITEMS.filter(
    item => item.title.toLowerCase().includes(q) || item.keywords.some(k => k.includes(q)) || item.group.toLowerCase().startsWith(q),
  )
}
