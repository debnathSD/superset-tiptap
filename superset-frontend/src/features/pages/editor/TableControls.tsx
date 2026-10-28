import type { Editor } from '@tiptap/core'
import { TableMap } from '@tiptap/pm/tables'
import { Plus } from 'lucide-react'
import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { MIN_COLUMN_WIDTH, MIN_ROW_HEIGHT, scaleWidths } from './extensions/tables'

/**
 * Word-style table handles while editing: a "+" bar under the table adds a
 * row, one to its right adds a column, every row border can be dragged to
 * set that row's height, and the corner grip resizes the whole table
 * (columns and rows scale together). Columns resize from their borders
 * through the table extension's own column resizing.
 *
 * Drawn in a fixed layer over the canvas, so it stays put when pages are
 * scaled to fit the window, and is clipped to the canvas. Mounted in the
 * editor's scoped .pg-root when there is one, so scoped styles apply.
 */

type Box = { left: number; top: number; width: number; height: number }
type Row = { pos: number; top: number; bottom: number; height: number }
type Geometry = {
  pos: number
  /** Table, in viewport px. */
  box: Box
  /** Canvas the controls are clipped to, in viewport px. */
  clip: Box
  rows: Row[]
  /** Rendered column widths, in CSS px of the page. */
  columns: number[]
  /** Screen px per page px (sheets may be scaled to fit). */
  scale: number
  /** Widest the table can be: its container. */
  maxWidth: number
}
type Drag =
  | { kind: 'row'; index: number; startY: number; startHeight: number; height: number }
  | { kind: 'corner'; startX: number; startY: number; startWidth: number; startHeight: number; width: number; height: number }

const rectOf = (el: Element): Box => {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function measure(editor: Editor, table: HTMLTableElement): Geometry | null {
  const { view } = editor
  const wrapper = table.closest('.tableWrapper')
  const canvas = table.closest('.pg-canvas')
  if (!wrapper || !canvas || !view.dom.contains(table)) return null
  let pos = -1
  view.state.doc.descendants((node, p) => {
    if (pos >= 0) return false
    if (node.type.name === 'table' && view.nodeDOM(p) === wrapper) pos = p
    return pos < 0
  })
  const node = pos >= 0 ? view.state.doc.nodeAt(pos) : null
  if (!node) return null

  const box = rectOf(table)
  const scale = table.offsetWidth ? box.width / table.offsetWidth : 1
  const rows: Row[] = []
  node.forEach((_row, offset) => {
    const tr = view.nodeDOM(pos + 1 + offset)
    if (tr instanceof HTMLElement) {
      const r = tr.getBoundingClientRect()
      rows.push({ pos: pos + 1 + offset, top: r.top, bottom: r.bottom, height: tr.offsetHeight })
    }
  })

  // One rendered width per grid column, read from a cell that spans only that column.
  const map = TableMap.get(node)
  const columns = Array.from({ length: map.width }, (_, col) => {
    for (let row = 0; row < map.height; row++) {
      const rel = map.map[row * map.width + col]
      const { left, right } = map.findCell(rel)
      if (right - left !== 1) continue
      const cell = view.nodeDOM(pos + 1 + rel)
      if (cell instanceof HTMLElement) return cell.offsetWidth
    }
    return table.offsetWidth / map.width
  })

  return { pos, box, clip: rectOf(canvas), rows, columns, scale, maxWidth: (wrapper as HTMLElement).clientWidth }
}

export function TableControls({ editor }: { editor: Editor }) {
  const [table, setTable] = useState<HTMLTableElement | null>(null)
  const [geo, setGeo] = useState<Geometry | null>(null)
  const [drag, setDrag] = useState<Drag | null>(null)
  const dragRef = useRef<Drag | null>(null)
  dragRef.current = drag

  // Which table: the one under the pointer, else the one holding the cursor.
  useEffect(() => {
    const fromSelection = () => {
      const { $from } = editor.state.selection
      for (let depth = $from.depth; depth > 0; depth--) {
        if ($from.node(depth).type.name === 'table') {
          const dom = editor.view.nodeDOM($from.before(depth))
          return dom instanceof HTMLElement ? dom.querySelector('table') : null
        }
      }
      return null
    }
    let hovered: HTMLTableElement | null = null
    const pick = () => setTable(hovered ?? fromSelection())
    const onMove = (event: PointerEvent) => {
      if (dragRef.current) return
      const target = event.target as Element | null
      if (target?.closest?.('.table-controls')) return // keep the table whose controls are in use
      const over = target?.closest?.('.pg-content table') as HTMLTableElement | null
      if (over && editor.view.dom.contains(over)) hovered = over
      else if (hovered) {
        // Leave a margin around the table so the pointer can reach the bars outside it.
        const r = hovered.getBoundingClientRect()
        const near = event.clientX > r.left - 12 && event.clientX < r.right + 36 && event.clientY > r.top - 12 && event.clientY < r.bottom + 36
        if (!near) hovered = null
      }
      pick()
    }
    document.addEventListener('pointermove', onMove, { passive: true })
    editor.on('selectionUpdate', pick)
    return () => {
      document.removeEventListener('pointermove', onMove)
      editor.off('selectionUpdate', pick)
    }
  }, [editor])

  // Keep the geometry in step with edits, scrolling and resizing.
  const refresh = useCallback(() => setGeo(table && table.isConnected ? measure(editor, table) : null), [editor, table])
  useEffect(() => {
    let frame = 0
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(refresh)
    }
    schedule()
    // Every transaction: page breaks can move a table without changing it.
    editor.on('transaction', schedule)
    window.addEventListener('scroll', schedule, true)
    window.addEventListener('resize', schedule)
    const observer = table ? new ResizeObserver(schedule) : null
    if (table) observer!.observe(table)
    return () => {
      cancelAnimationFrame(frame)
      editor.off('transaction', schedule)
      window.removeEventListener('scroll', schedule, true)
      window.removeEventListener('resize', schedule)
      observer?.disconnect()
    }
  }, [editor, table, refresh])

  if (!geo) return null
  const { box, clip, rows, scale } = geo
  // Inside the editor's scoped root when there is one (Superset scopes every style under .pg-root), else the body.
  const host = (editor.view.dom.closest('.pg-root') as HTMLElement | null) ?? document.body
  // Positions inside the clipped layer.
  const x = (v: number) => v - clip.left
  const y = (v: number) => v - clip.top

  const addRow = () => editor.chain().focus().addTableRowAtEnd(geo.pos).run()
  const addColumn = () => editor.chain().focus().addTableColumnAtEnd(geo.pos).run()

  const track = (event: ReactPointerEvent, start: Drag, onMove: (e: PointerEvent, d: Drag) => Drag, onEnd: (d: Drag) => void) => {
    event.preventDefault()
    event.stopPropagation()
    setDrag(start)
    // Keep the resize cursor and stop text selection while the pointer is away from the handle.
    document.documentElement.dataset.tableDrag = start.kind
    const move = (e: PointerEvent) => {
      const next = onMove(e, dragRef.current ?? start)
      dragRef.current = next
      setDrag(next)
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      const last = dragRef.current ?? start
      delete document.documentElement.dataset.tableDrag
      setDrag(null)
      onEnd(last)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const startRow = (event: ReactPointerEvent, index: number) => {
    const row = rows[index]
    track(
      event,
      { kind: 'row', index, startY: event.clientY, startHeight: row.height, height: row.height },
      (e, d) => (d.kind === 'row' ? { ...d, height: Math.max(MIN_ROW_HEIGHT, d.startHeight + (e.clientY - d.startY) / scale) } : d),
      d => {
        if (d.kind === 'row' && Math.abs(d.height - d.startHeight) >= 2) editor.chain().focus().setTableRowHeight(row.pos, d.height).run()
      },
    )
  }

  const startCorner = (event: ReactPointerEvent) => {
    const startWidth = box.width / scale
    const startHeight = box.height / scale
    const minWidth = geo.columns.length * MIN_COLUMN_WIDTH
    const minHeight = rows.length * MIN_ROW_HEIGHT
    track(
      event,
      { kind: 'corner', startX: event.clientX, startY: event.clientY, startWidth, startHeight, width: startWidth, height: startHeight },
      (e, d) =>
        d.kind === 'corner'
          ? {
              ...d,
              width: Math.min(geo.maxWidth, Math.max(minWidth, d.startWidth + (e.clientX - d.startX) / scale)),
              height: Math.max(minHeight, d.startHeight + (e.clientY - d.startY) / scale),
            }
          : d,
      d => {
        if (d.kind !== 'corner') return
        const widthChanged = Math.abs(d.width - d.startWidth) >= 2
        const heightChanged = Math.abs(d.height - d.startHeight) >= 2
        if (!widthChanged && !heightChanged) return
        const columns = widthChanged ? scaleWidths(geo.columns, d.width) : geo.columns
        const factor = d.height / d.startHeight
        const heights = heightChanged ? rows.map(r => r.height * factor) : null
        editor.chain().focus().resizeTable(geo.pos, columns, heights).run()
      },
    )
  }

  const guide =
    drag?.kind === 'row'
      ? { left: x(box.left), top: y(rows[drag.index].top + drag.height * scale) - 1, width: box.width }
      : null
  const ghost = drag?.kind === 'corner' ? { left: x(box.left), top: y(box.top), width: drag.width * scale, height: drag.height * scale } : null

  return createPortal(
    <div
      className="table-controls"
      data-dragging={drag ? drag.kind : undefined}
      style={{ left: clip.left, top: clip.top, width: clip.width, height: clip.height }}
    >
      {rows.map((row, index) => (
        <div
          key={row.pos}
          className="table-controls__row-handle"
          style={{ left: x(box.left), top: y(row.bottom) - 4, width: box.width }}
          title="Drag to change the row height · double-click to fit the content"
          onPointerDown={event => startRow(event, index)}
          onDoubleClick={() => editor.chain().focus().setTableRowHeight(row.pos, null).run()}
        />
      ))}
      <button
        type="button"
        className="table-controls__add table-controls__add--row"
        style={{ left: x(box.left), top: y(box.top + box.height) + 6, width: box.width }}
        title="Add a row"
        aria-label="Add a row"
        onMouseDown={event => event.preventDefault()}
        onClick={addRow}
      >
        <Plus size={13} />
      </button>
      <button
        type="button"
        className="table-controls__add table-controls__add--column"
        style={{ left: x(box.left + box.width) + 6, top: y(box.top), height: box.height }}
        title="Add a column"
        aria-label="Add a column"
        onMouseDown={event => event.preventDefault()}
        onClick={addColumn}
      >
        <Plus size={13} />
      </button>
      <div
        className="table-controls__corner"
        style={{ left: x(box.left + box.width) - 6, top: y(box.top + box.height) - 6 }}
        title="Drag to resize the table · double-click for full width"
        onPointerDown={startCorner}
        onDoubleClick={() => editor.chain().focus().resetTableSize(geo.pos).run()}
      />
      {guide && <div className="table-controls__guide" style={guide} />}
      {ghost && drag?.kind === 'corner' && (
        <div className="table-controls__ghost" style={ghost}>
          <span>
            {Math.round(drag.width)} × {Math.round(drag.height)}
          </span>
        </div>
      )}
    </div>,
    host,
  )
}
