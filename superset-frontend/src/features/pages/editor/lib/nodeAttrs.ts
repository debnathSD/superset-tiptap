import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { NodeSelection, type EditorState } from '@tiptap/pm/state'

/**
 * Update attributes of the node at `pos` with AttrSteps. Unlike
 * `setNodeMarkup`, this never replaces the node, so a NodeSelection on an
 * atom (divider, KPI tiles, chart…) survives — the property pane keeps its
 * target while the author edits.
 */
export function setNodeAttrs(editor: Editor, pos: number, patch: Record<string, unknown>) {
  const node = editor.state.doc.nodeAt(pos)
  if (!node) return false
  return editor
    .chain()
    .command(({ tr }) => {
      for (const [key, value] of Object.entries(patch)) {
        if (node.attrs[key] !== value) tr.setNodeAttribute(pos, key, value)
      }
      return true
    })
    .run()
}

export type NodeRef = { node: PMNode; pos: number; depth: number }

/**
 * Everything the property pane needs to know about the selection: the
 * selected atom (if any) and the chain of ancestors, innermost first.
 */
export function selectionContext(state: EditorState): { selected: NodeRef | null; ancestors: NodeRef[] } {
  const { selection } = state
  const { $from } = selection
  const ancestors: NodeRef[] = []

  let selected: NodeRef | null = null
  if (selection instanceof NodeSelection) {
    selected = { node: selection.node, pos: selection.from, depth: $from.depth + 1 }
    ancestors.push(selected)
  }
  for (let depth = $from.depth; depth > 0; depth--) {
    ancestors.push({ node: $from.node(depth), pos: $from.before(depth), depth })
  }
  return { selected, ancestors }
}

/** Find the node carrying `data-toc-id === id`. */
export function findNodeById(doc: PMNode, id: string): { node: PMNode; pos: number } | null {
  let found: { node: PMNode; pos: number } | null = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (node.attrs['data-toc-id'] === id) {
      found = { node, pos }
      return false
    }
    return true
  })
  return found
}

export function uid(prefix = 'i') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}

/** Parse a JSON array stored in a data-* attribute; tolerate garbage. */
export function parseJSONAttr<T>(element: HTMLElement, name: string, fallback: T): T {
  const raw = element.getAttribute(name)
  if (!raw) return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}
