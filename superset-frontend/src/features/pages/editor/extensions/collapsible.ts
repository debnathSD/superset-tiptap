import { Extension } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, type EditorState, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'
import { uid } from '../lib/nodeAttrs'

/**
 * One show/hide mechanism for three things:
 *  - headings (any level): hide following siblings until the next heading of
 *    the same or higher level — "collapsible sections" for plain content;
 *  - sections with `collapsible: true` (SharePoint's collapsible sections);
 *  - callouts with `collapsible: true` (FAQ boxes).
 *
 * Expanded/collapsed is view state, not document state: toggling never adds
 * an undo step and works in read-only view mode. Authors control the initial
 * state through node attributes (`defaultCollapsed` / `defaultOpen`); when such
 * an attribute changes, the live state follows it.
 *
 * Nodes are addressed by `data-toc-id`: the TableOfContents extension keeps it
 * unique on headings; this extension does the same for sections and callouts
 * (which may hold no text yet, which TableOfContents would skip).
 */

const ID_TYPES = new Set(['section', 'callout'])

/**
 * Give every section/callout (and, on load, heading) a unique id; duplicates
 * come from copy, paste and "Duplicate".
 */
function assignBlockIds(state: EditorState, types: Set<string> = ID_TYPES): Transaction | null {
  const tr = state.tr
  const seen = new Set<string>()
  state.doc.descendants((node, pos) => {
    if (!types.has(node.type.name)) return true
    let id = node.attrs['data-toc-id'] as string | null
    if (!id || seen.has(id)) {
      id = uid(node.type.name === 'heading' ? 'h' : 'b')
      tr.setNodeAttribute(pos, 'data-toc-id', id)
      if (node.type.name === 'heading') tr.setNodeAttribute(pos, 'id', id)
    }
    seen.add(id)
    return true
  })
  return tr.docChanged ? tr : null
}

type CollapseState = {
  collapsed: Set<string>
  defaults: Map<string, boolean>
  decorations: DecorationSet
}

type CollapseMeta =
  | { type: 'toggle'; id: string }
  | { type: 'set'; ids: string[]; collapsed: boolean }
  | { type: 'expandAll' }

export const collapseKey = new PluginKey<CollapseState>('collapsible')

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    collapsible: {
      toggleCollapsed: (id: string) => ReturnType
      setCollapsed: (ids: string[], collapsed: boolean) => ReturnType
      expandAll: () => ReturnType
      /** Expand whatever hides the document position `pos`. */
      revealPosition: (pos: number) => ReturnType
    }
  }
}

const idOf = (node: PMNode): string | null => node.attrs['data-toc-id'] ?? null

function readDefaults(doc: PMNode) {
  const defaults = new Map<string, boolean>()
  doc.descendants(node => {
    const id = idOf(node)
    if (!id) return true
    if (node.type.name === 'section' && node.attrs.collapsible) defaults.set(id, !!node.attrs.defaultCollapsed)
    if (node.type.name === 'callout' && node.attrs.collapsible) defaults.set(id, !node.attrs.defaultOpen)
    return true
  })
  return defaults
}

/** The siblings a heading folds: everything after it until a heading of the same or higher rank. */
export function headingScope(parent: PMNode, index: number, pos: number) {
  const heading = parent.child(index)
  const scope: Array<{ node: PMNode; pos: number }> = []
  let cursor = pos + heading.nodeSize
  for (let i = index + 1; i < parent.childCount; i++) {
    const sibling = parent.child(i)
    if (sibling.type.name === 'heading' && sibling.attrs.level <= heading.attrs.level) break
    scope.push({ node: sibling, pos: cursor })
    cursor += sibling.nodeSize
  }
  return scope
}

const CHEVRON =
  '<svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>'

function toggleWidget(id: string, collapsed: boolean) {
  return () => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = 'pg-heading-toggle'
    button.contentEditable = 'false'
    button.dataset.toggleId = id
    button.setAttribute('aria-expanded', String(!collapsed))
    button.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section')
    button.innerHTML = CHEVRON
    return button
  }
}

function buildDecorations(doc: PMNode, collapsed: Set<string>) {
  const decorations: Decoration[] = []
  doc.descendants((node, pos, parent, index) => {
    const id = idOf(node)
    if (!id) return true

    if (node.type.name === 'heading' && parent) {
      const isCollapsed = collapsed.has(id)
      const scope = headingScope(parent, index, pos)
      if (scope.length || isCollapsed) {
        decorations.push(
          Decoration.widget(pos + 1, toggleWidget(id, isCollapsed), {
            side: -1,
            key: `toggle-${id}-${isCollapsed}`,
            ignoreSelection: true,
          }),
        )
      }
      if (isCollapsed) {
        decorations.push(Decoration.node(pos, pos + node.nodeSize, { class: 'is-collapsed-heading' }, { collapsed: true }))
        for (const hidden of scope) {
          decorations.push(Decoration.node(hidden.pos, hidden.pos + hidden.node.nodeSize, { class: 'is-collapsed-hidden' }))
        }
      }
      return true
    }

    if ((node.type.name === 'section' || node.type.name === 'callout') && collapsed.has(id)) {
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { 'data-collapsed': 'true' }, { collapsed: true }))
    }
    return true
  })
  return DecorationSet.create(doc, decorations)
}

/** Ids of collapsed things that currently hide `target`. */
function idsHiding(doc: PMNode, collapsed: Set<string>, target: number) {
  const ids: string[] = []
  doc.descendants((node, pos, parent, index) => {
    const id = idOf(node)
    if (!id || !collapsed.has(id)) return true
    if (node.type.name === 'heading' && parent) {
      const scope = headingScope(parent, index, pos)
      const last = scope[scope.length - 1]
      if (last && target >= scope[0].pos && target <= last.pos + last.node.nodeSize) ids.push(id)
    } else if (target > pos && target < pos + node.nodeSize) {
      // For callouts only the body is hidden; the first block (question) stays visible.
      const firstChildEnd = pos + 1 + (node.firstChild?.nodeSize ?? 0)
      if (node.type.name !== 'callout' || target >= firstChildEnd) ids.push(id)
    }
    return true
  })
  return ids
}

export function isCollapsed(state: EditorState, id: string | null | undefined) {
  return !!id && !!collapseKey.getState(state)?.collapsed.has(id)
}

export const Collapsible = Extension.create({
  name: 'collapsible',

  addGlobalAttributes() {
    return [
      {
        types: [...ID_TYPES],
        attributes: {
          'data-toc-id': {
            default: null,
            parseHTML: el => el.dataset.tocId || null,
            renderHTML: attrs => (attrs['data-toc-id'] ? { 'data-toc-id': attrs['data-toc-id'], id: attrs['data-toc-id'] } : {}),
          },
        },
      },
    ]
  },

  // Run before TableOfContents' create hook: ids assigned here stay out of the undo history,
  // so a freshly opened page has nothing to undo.
  priority: 1000,

  onCreate() {
    const tr = assignBlockIds(this.editor.state, new Set([...ID_TYPES, 'heading']))
    if (tr) this.editor.view.dispatch(tr.setMeta('addToHistory', false))
  },

  addCommands() {
    const meta =
      (value: CollapseMeta) =>
      ({ tr, dispatch }: { tr: Transaction; dispatch?: unknown }) => {
        if (dispatch) tr.setMeta(collapseKey, value).setMeta('addToHistory', false)
        return true
      }
    return {
      toggleCollapsed: id => meta({ type: 'toggle', id }),
      setCollapsed: (ids, collapsed) => meta({ type: 'set', ids, collapsed }),
      expandAll: () => meta({ type: 'expandAll' }),
      revealPosition:
        pos =>
        ({ state, tr, dispatch }) => {
          const current = collapseKey.getState(state)
          if (!current) return false
          const ids = idsHiding(state.doc, current.collapsed, pos)
          if (!ids.length) return false
          if (dispatch) tr.setMeta(collapseKey, { type: 'set', ids, collapsed: false } satisfies CollapseMeta)
          return true
        },
    }
  },

  addProseMirrorPlugins() {
    return [
      new Plugin<CollapseState>({
        key: collapseKey,
        appendTransaction: (transactions, _old, state) => (transactions.some(t => t.docChanged) ? assignBlockIds(state) : null),
        state: {
          init: (_, state) => {
            const defaults = readDefaults(state.doc)
            const collapsed = new Set([...defaults].filter(([, c]) => c).map(([id]) => id))
            return { collapsed, defaults, decorations: buildDecorations(state.doc, collapsed) }
          },
          apply: (tr, prev) => {
            const action = tr.getMeta(collapseKey) as CollapseMeta | undefined
            if (!tr.docChanged && !action) return prev

            let collapsed = prev.collapsed
            let defaults = prev.defaults
            const edit = () => (collapsed === prev.collapsed ? (collapsed = new Set(collapsed)) : collapsed)

            if (tr.docChanged) {
              defaults = readDefaults(tr.doc)
              for (const [id, value] of defaults) {
                if (prev.defaults.get(id) !== value) value ? edit().add(id) : edit().delete(id)
              }
            }
            if (action?.type === 'toggle') {
              edit().has(action.id) ? collapsed.delete(action.id) : collapsed.add(action.id)
            } else if (action?.type === 'set') {
              for (const id of action.ids) action.collapsed ? edit().add(id) : edit().delete(id)
            } else if (action?.type === 'expandAll') {
              collapsed = new Set()
            }

            return { collapsed, defaults, decorations: buildDecorations(tr.doc, collapsed) }
          },
        },
        props: {
          decorations: state => collapseKey.getState(state)?.decorations,
          handleDOMEvents: {
            mousedown: (view, event) => {
              const toggle = (event.target as HTMLElement).closest<HTMLElement>('[data-toggle-id]')
              if (!toggle) return false
              event.preventDefault()
              view.dispatch(
                view.state.tr.setMeta(collapseKey, { type: 'toggle', id: toggle.dataset.toggleId! }).setMeta('addToHistory', false),
              )
              return true
            },
          },
        },
      }),
    ]
  },
})
