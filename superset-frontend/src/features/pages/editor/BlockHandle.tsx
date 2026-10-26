import type { Editor } from '@tiptap/core'
import { DragHandle } from '@tiptap/extension-drag-handle-react'
import type { Node as PMNode } from '@tiptap/pm/model'
import { GripVertical, Plus } from 'lucide-react'
import { useRef } from 'react'

/** Notion-style handle: drag to move any block (also across columns), "+" to insert below via the "/" menu. */
export function BlockHandle({ editor }: { editor: Editor }) {
  const current = useRef<{ node: PMNode | null; pos: number }>({ node: null, pos: -1 })

  const insertBelow = () => {
    const { node, pos } = current.current
    if (!node || pos < 0) return
    const at = pos + node.nodeSize
    editor
      .chain()
      .focus()
      .insertContentAt(at, { type: 'paragraph', content: [{ type: 'text', text: '/' }] })
      .run()
  }

  return (
    <DragHandle
      editor={editor}
      className="block-handle"
      onNodeChange={({ node, pos }) => (current.current = { node, pos })}
      nested={{
        edgeDetection: 'left',
        rules: [
          // Columns are structure, not content: drag the section or the blocks inside instead.
          { id: 'noColumns', evaluate: ({ node }) => (node.type.name === 'column' ? 1000 : 0) },
          // Inside cards and banners, move the container as a whole.
          { id: 'containersWhole', evaluate: ({ parent }) => (parent && ['card', 'banner'].includes(parent.type.name) ? 1000 : 0) },
        ],
      }}
    >
      <div className="block-handle__inner">
        <button type="button" className="block-handle__btn" title="Insert below" onMouseDown={e => e.preventDefault()} onClick={insertBelow}>
          <Plus size={15} />
        </button>
        <span className="block-handle__btn block-handle__grip" title="Drag to move" data-drag-handle>
          <GripVertical size={15} />
        </span>
      </div>
    </DragHandle>
  )
}
