import { NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { useEditable } from '../lib/mode'

export const SPACER_MIN = 8
export const SPACER_MAX = 480

/** Spacer with a bottom grip: drag to resize, arrow keys for fine steps (Shift = 16px). */
export function SpacerView({ node, updateAttributes, selected }: ReactNodeViewProps) {
  const editable = useEditable()
  const [dragHeight, setDragHeight] = useState<number | null>(null)
  const start = useRef<{ y: number; height: number } | null>(null)
  const height = dragHeight ?? (node.attrs.height as number)

  const clamp = (value: number) => Math.round(Math.max(SPACER_MIN, Math.min(SPACER_MAX, value)))

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    start.current = { y: event.clientY, height: node.attrs.height }
    setDragHeight(node.attrs.height)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return
    setDragHeight(clamp(start.current.height + event.clientY - start.current.y))
  }
  const onPointerUp = () => {
    if (!start.current) return
    start.current = null
    if (dragHeight !== null) updateAttributes({ height: dragHeight })
    setDragHeight(null)
  }
  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.shiftKey ? 16 : 4
    if (event.key === 'ArrowDown') updateAttributes({ height: clamp(node.attrs.height + step) })
    else if (event.key === 'ArrowUp') updateAttributes({ height: clamp(node.attrs.height - step) })
    else return
    event.preventDefault()
  }

  return (
    <NodeViewWrapper
      className="pg-spacer"
      data-type="spacer"
      data-selected={selected ? 'true' : undefined}
      data-resizing={dragHeight !== null ? 'true' : undefined}
      style={{ height }}
    >
      {editable && (
        <>
          <span className="pg-spacer__label" contentEditable={false}>
            Spacer · {height}px
          </span>
          <div
            className="pg-spacer__grip"
            contentEditable={false}
            role="slider"
            tabIndex={0}
            aria-label="Spacer height"
            aria-valuemin={SPACER_MIN}
            aria-valuemax={SPACER_MAX}
            aria-valuenow={height}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onKeyDown={onKeyDown}
          />
        </>
      )}
    </NodeViewWrapper>
  )
}
