import type { Editor, JSONContent } from '@tiptap/core'
import { NodeSelection, Selection } from '@tiptap/pm/state'

/**
 * Insert a block the way page builders do: an empty paragraph under the cursor
 * is replaced, otherwise the block goes below the current one. Web parts
 * (atoms) end up selected so their property pane opens immediately; for
 * containers the cursor moves inside. A trailing paragraph is added when the
 * block would otherwise be the last thing in its column.
 */
export function insertBlock(editor: Editor, content: JSONContent) {
  return editor
    .chain()
    .focus()
    .command(({ tr, state }) => {
      const node = state.schema.nodeFromJSON(content)
      const { $from } = tr.selection

      let from = tr.selection.from
      let to = tr.selection.to
      if (tr.selection instanceof NodeSelection) {
        from = to = tr.selection.to
      } else if ($from.parent.isTextblock && $from.depth > 0) {
        const empty = $from.parent.content.size === 0
        from = empty ? $from.before() : $from.after()
        to = empty ? $from.after() : from
        // Inside a list item, place the block after the whole list instead.
        for (let d = $from.depth - 1; d > 0; d--) {
          const ancestor = $from.node(d)
          if (ancestor.type.name === 'bulletList' || ancestor.type.name === 'orderedList' || ancestor.type.name === 'taskList') {
            from = to = $from.after(d)
          }
        }
      }

      tr.replaceWith(from, to, node)
      const at = tr.doc.nodeAt(from)?.type === node.type ? from : tr.mapping.map(from)
      const end = at + node.nodeSize
      const $end = tr.doc.resolve(Math.min(end, tr.doc.content.size))
      if ($end.index() >= $end.parent.childCount && state.schema.nodes.paragraph) {
        tr.insert(end, state.schema.nodes.paragraph.create())
      }

      if (node.isAtom && NodeSelection.isSelectable(node)) tr.setSelection(NodeSelection.create(tr.doc, at))
      else tr.setSelection(Selection.near(tr.doc.resolve(at + 1)))
      tr.scrollIntoView()
      return true
    })
    .run()
}
