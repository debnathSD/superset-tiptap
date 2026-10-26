import { mergeAttributes, Node, type JSONContent } from '@tiptap/core'
import Document from '@tiptap/extension-document'
import { Fragment, type Node as PMNode, type Schema } from '@tiptap/pm/model'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { collapseAwareUpdate } from '../lib/dom'
import { colorAttrs, mergeStyles, normalizeColor } from '../lib/palette'
import { SectionView } from '../nodeviews/SectionView'

/**
 * Regions — SharePoint's "sections". A page is a stack of sections; each
 * section has a column layout, an optional background, an optional header
 * (which can make it collapsible) and holds ordinary blocks in its columns.
 *
 * Sections live in their own `region` group so they can only appear at the
 * top level of the page — columns accept `block+`, which keeps regions from
 * nesting.
 */

export const LAYOUTS = {
  one: { label: 'One column', columns: 1 },
  two: { label: 'Two columns', columns: 2 },
  three: { label: 'Three columns', columns: 3 },
  oneThirdLeft: { label: 'One-third left', columns: 2 },
  oneThirdRight: { label: 'One-third right', columns: 2 },
} as const

export type SectionLayout = keyof typeof LAYOUTS

export type SectionAttrs = {
  layout: SectionLayout
  background: string | null
  backgroundVariant: 'tint' | 'solid'
  accent: string | null
  border: 'none' | 'subtle' | 'accent'
  spacing: 'compact' | 'normal' | 'relaxed'
  title: string
  headerStyle: 'bar' | 'solid' | 'plain'
  collapsible: boolean
  defaultCollapsed: boolean
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    section: {
      /** Insert any node(s) at page level, after the region holding the cursor. */
      insertTopLevel: (content: JSONContent | JSONContent[]) => ReturnType
      insertSection: (options?: { layout?: SectionLayout; attrs?: Partial<SectionAttrs>; at?: number }) => ReturnType
      setSectionLayout: (pos: number, layout: SectionLayout) => ReturnType
      moveTopLevelNode: (pos: number, direction: -1 | 1) => ReturnType
      duplicateNodeAt: (pos: number) => ReturnType
      deleteNodeAt: (pos: number) => ReturnType
    }
  }
}

export const PageDocument = Document.extend({
  content: '(block | region)+',
  addAttributes() {
    return {
      pageWidth: { default: 'standard' },
    }
  },
})

export const Column = Node.create({
  name: 'column',
  content: 'block+',
  isolating: true,
  defining: true,

  parseHTML() {
    return [{ tag: 'div[data-type="column"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'column', class: 'pg-column' }), 0]
  },
})

function emptyColumn(schema: Schema) {
  return schema.nodes.column.create(null, schema.nodes.paragraph.create())
}

function isEmptyColumn(column: PMNode) {
  return column.childCount === 1 && column.firstChild!.isTextblock && column.firstChild!.content.size === 0
}

/** Rebuild a section's columns for a new layout, merging overflow columns into the last kept one. */
export function columnsForLayout(section: PMNode, layout: SectionLayout, schema: Schema): PMNode[] {
  const target = LAYOUTS[layout].columns
  const columns: PMNode[] = []
  section.forEach(child => columns.push(child))

  if (columns.length === target) return columns
  if (columns.length < target) {
    return [...columns, ...Array.from({ length: target - columns.length }, () => emptyColumn(schema))]
  }

  const kept = columns.slice(0, target)
  const last = kept[target - 1]
  let content = isEmptyColumn(last) ? Fragment.empty : last.content
  for (const extra of columns.slice(target)) {
    if (!isEmptyColumn(extra)) content = content.append(extra.content)
  }
  kept[target - 1] = last.copy(content.size ? content : Fragment.from(schema.nodes.paragraph.create()))
  return kept
}

/** Where page-level content goes for the current selection: replace an empty top-level paragraph, else insert after the top-level node. */
function topLevelRange(selection: Selection): { from: number; to: number } {
  const { $from } = selection
  if ($from.depth === 0) return { from: selection.to, to: selection.to }
  const top = $from.node(1)
  const topPos = $from.before(1)
  if (top.isTextblock && top.content.size === 0) return { from: topPos, to: topPos + top.nodeSize }
  return { from: topPos + top.nodeSize, to: topPos + top.nodeSize }
}

const enumAttr = <T extends string>(name: string, fallback: T) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => (el.getAttribute(`data-${name}`) as T) || fallback,
  renderHTML: () => ({}),
})

export const Section = Node.create({
  name: 'section',
  group: 'region',
  content: 'column+',
  isolating: true,
  defining: true,
  draggable: true,

  addAttributes() {
    return {
      layout: enumAttr<SectionLayout>('layout', 'one'),
      background: { default: null, parseHTML: el => normalizeColor(el.getAttribute('data-bg-value')), renderHTML: () => ({}) },
      backgroundVariant: enumAttr('bg-variant', 'tint'),
      accent: { default: 'teal', parseHTML: el => normalizeColor(el.getAttribute('data-accent-value')), renderHTML: () => ({}) },
      border: enumAttr('border', 'none'),
      spacing: enumAttr('spacing', 'normal'),
      title: { default: '', parseHTML: el => el.getAttribute('data-title') ?? '', renderHTML: () => ({}) },
      headerStyle: enumAttr('header-style', 'bar'),
      collapsible: { default: false, parseHTML: el => el.getAttribute('data-collapsible') === 'true', renderHTML: () => ({}) },
      defaultCollapsed: {
        default: false,
        parseHTML: el => el.getAttribute('data-default-collapsed') === 'true',
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'section[data-type="section"]', contentElement: '.pg-section__grid' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'section',
      mergeAttributes(HTMLAttributes, sectionDomAttrs(node.attrs as SectionAttrs)),
      ...(node.attrs.title || node.attrs.collapsible
        ? [['div', { class: 'pg-section__header' }, ['span', { class: 'pg-section__title' }, node.attrs.title]]]
        : []),
      ['div', { class: 'pg-section__grid' }, 0],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SectionView, { className: 'pg-section-view', ...collapseAwareUpdate })
  },

  addCommands() {
    return {
      insertTopLevel:
        content =>
        ({ tr, state, dispatch }) => {
          const nodes = (Array.isArray(content) ? content : [content]).map(json => state.schema.nodeFromJSON(json))
          const { from, to } = topLevelRange(tr.selection)
          if (dispatch) {
            tr.replaceWith(from, to, nodes)
            tr.setSelection(Selection.near(tr.doc.resolve(Math.min(from + 1, tr.doc.content.size))))
            tr.scrollIntoView()
          }
          return true
        },

      insertSection:
        (options = {}) =>
        ({ tr, state, dispatch }) => {
          const layout = options.layout ?? 'one'
          const columns = Array.from({ length: LAYOUTS[layout].columns }, () => emptyColumn(state.schema))
          const section = state.schema.nodes.section.create({ ...options.attrs, layout }, columns)
          const range = options.at !== undefined ? { from: options.at, to: options.at } : topLevelRange(tr.selection)
          if (dispatch) {
            tr.replaceWith(range.from, range.to, section)
            tr.setSelection(Selection.near(tr.doc.resolve(range.from + 1)))
            tr.scrollIntoView()
          }
          return true
        },

      setSectionLayout:
        (pos, layout) =>
        ({ tr, state, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          if (!node || node.type.name !== 'section') return false
          if (dispatch) {
            const next = columnsForLayout(node, layout, state.schema)
            tr.setNodeAttribute(pos, 'layout', layout)
            if (next.length !== node.childCount || next.some((c, i) => c !== node.child(i))) {
              tr.replaceWith(pos + 1, pos + node.nodeSize - 1, next)
            }
          }
          return true
        },

      moveTopLevelNode:
        (pos, direction) =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          const $pos = tr.doc.resolve(pos)
          if (!node) return false
          const index = $pos.index()
          const sibling = direction < 0 ? $pos.parent.maybeChild(index - 1) : $pos.parent.maybeChild(index + 1)
          if (!sibling) return false
          if (dispatch) {
            tr.delete(pos, pos + node.nodeSize)
            const target = direction < 0 ? pos - sibling.nodeSize : pos + sibling.nodeSize
            tr.insert(target, node)
            tr.setSelection(NodeSelection.create(tr.doc, target))
            tr.scrollIntoView()
          }
          return true
        },

      duplicateNodeAt:
        pos =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          if (!node) return false
          if (dispatch) {
            // Ids are re-generated for the copy by the TableOfContents plugin (duplicate detection).
            tr.insert(pos + node.nodeSize, node.copy(node.content))
            tr.setSelection(NodeSelection.create(tr.doc, pos + node.nodeSize))
          }
          return true
        },

      deleteNodeAt:
        pos =>
        ({ tr, dispatch }) => {
          const node = tr.doc.nodeAt(pos)
          if (!node) return false
          if (dispatch) tr.delete(pos, pos + node.nodeSize)
          return true
        },
    }
  },
})

/** DOM attributes shared by renderHTML (export) and the React node view (editor). */
export function sectionDomAttrs(attrs: SectionAttrs) {
  const bg = colorAttrs(attrs.background, 'bg')
  const accent = colorAttrs(attrs.accent, 'accent')
  return {
    'data-type': 'section',
    class: 'pg-section',
    'data-layout': attrs.layout,
    'data-bg-variant': attrs.background ? attrs.backgroundVariant : undefined,
    'data-bg-value': attrs.background ?? undefined,
    'data-accent-value': attrs.accent ?? undefined,
    'data-border': attrs.border,
    'data-spacing': attrs.spacing,
    'data-header-style': attrs.headerStyle,
    'data-title': attrs.title || undefined,
    'data-collapsible': attrs.collapsible ? 'true' : undefined,
    'data-default-collapsed': attrs.defaultCollapsed ? 'true' : undefined,
    'data-bg': bg['data-bg'],
    'data-accent': accent['data-accent'],
    style: mergeStyles(bg.style, accent.style),
  }
}
