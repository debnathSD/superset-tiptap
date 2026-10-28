import { Extension } from '@tiptap/core'
import { TableRow } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import { TextSelection, type Transaction } from '@tiptap/pm/state'
import { TableMap } from '@tiptap/pm/tables'

/**
 * Table sizing and growth: rows remember a minimum height, and commands add
 * a row or column at the table's edge, set one row's height, or resize the
 * whole table (every column and row scaled together). Column widths use the
 * `colwidth` cell attribute that column resizing already writes.
 */

export const MIN_COLUMN_WIDTH = 60
export const MIN_ROW_HEIGHT = 28

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tableTools: {
      /** Add a row under the last row and put the cursor in it. */
      addTableRowAtEnd: (tablePos: number) => ReturnType
      /** Add a column right of the last column and put the cursor in it. */
      addTableColumnAtEnd: (tablePos: number) => ReturnType
      /** Minimum height of one row in px; null goes back to fitting its content. */
      setTableRowHeight: (rowPos: number, height: number | null) => ReturnType
      /** Set every column width (px) and, optionally, every row height. */
      resizeTable: (tablePos: number, columnWidths: number[], rowHeights?: Array<number | null> | null) => ReturnType
      /** Back to full width with even columns and rows that fit their content. */
      resetTableSize: (tablePos: number, what?: 'all' | 'columns' | 'rows') => ReturnType
      /** Same width for every column, keeping the table's current width. */
      distributeTableColumns: (tablePos: number, tableWidth: number) => ReturnType
    }
  }
}

/** Rows keep a minimum height, set by dragging their bottom border. */
export const SizedTableRow = TableRow.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      rowHeight: {
        default: null,
        parseHTML: el => {
          const value = Number(el.getAttribute('data-row-height') ?? parseFloat(el.style.height))
          return Number.isFinite(value) && value > 0 ? Math.round(value) : null
        },
        renderHTML: attrs => (attrs.rowHeight ? { 'data-row-height': attrs.rowHeight, style: `height: ${attrs.rowHeight}px` } : {}),
      },
    }
  },
})

function tableNode(doc: PMNode, tablePos: number) {
  const node = doc.nodeAt(tablePos)
  return node?.type.name === 'table' ? node : null
}

/** Document position of the cell at a row and column of the table's grid. */
export function cellPosAt(doc: PMNode, tablePos: number, row: number, col: number) {
  const table = tableNode(doc, tablePos)
  if (!table) return null
  const map = TableMap.get(table)
  const r = Math.max(0, Math.min(map.height - 1, row < 0 ? map.height + row : row))
  const c = Math.max(0, Math.min(map.width - 1, col < 0 ? map.width + col : col))
  return tablePos + 1 + map.map[r * map.width + c]
}

function selectCell(tr: Transaction, tablePos: number, row: number, col: number) {
  const pos = cellPosAt(tr.doc, tablePos, row, col)
  if (pos === null) return false
  tr.setSelection(TextSelection.near(tr.doc.resolve(pos + 1)))
  return true
}

/** Scale column widths to a new table width, keeping every column at least `min` wide. */
export function scaleWidths(widths: number[], targetWidth: number, min = MIN_COLUMN_WIDTH) {
  const total = widths.reduce((sum, w) => sum + w, 0) || 1
  const scaled = widths.map(w => Math.max(min, Math.round((w * targetWidth) / total)))
  // Absorb rounding in the widest column so the table lands on the target width.
  const drift = Math.max(targetWidth, min * widths.length) - scaled.reduce((sum, w) => sum + w, 0)
  if (drift && scaled.length) {
    const widest = scaled.indexOf(Math.max(...scaled))
    scaled[widest] = Math.max(min, scaled[widest] + drift)
  }
  return scaled
}

function setColumnWidths(tr: Transaction, tablePos: number, widths: Array<number | null>) {
  const table = tableNode(tr.doc, tablePos)
  if (!table) return
  const map = TableMap.get(table)
  const seen = new Set<number>()
  map.map.forEach(rel => {
    if (seen.has(rel)) return
    seen.add(rel)
    const cell = table.nodeAt(rel)!
    const { left, right } = map.findCell(rel)
    const span = widths.slice(left, right)
    const colwidth = span.every(w => w) ? (span as number[]) : null
    tr.setNodeMarkup(tablePos + 1 + rel, undefined, { ...cell.attrs, colwidth })
  })
}

function setRowHeights(tr: Transaction, tablePos: number, heights: Array<number | null>) {
  const table = tableNode(tr.doc, tablePos)
  if (!table) return
  table.forEach((row, offset, index) => {
    if (index >= heights.length) return
    tr.setNodeMarkup(tablePos + 1 + offset, undefined, { ...row.attrs, rowHeight: heights[index] })
  })
}

export const TableTools = Extension.create({
  name: 'tableTools',

  addCommands() {
    return {
      addTableRowAtEnd:
        tablePos =>
        ({ chain }) =>
          chain()
            .command(({ tr }) => selectCell(tr, tablePos, -1, 0))
            .addRowAfter()
            .command(({ tr }) => selectCell(tr, tablePos, -1, 0))
            .scrollIntoView()
            .run(),
      addTableColumnAtEnd:
        tablePos =>
        ({ chain }) =>
          chain()
            .command(({ tr }) => selectCell(tr, tablePos, 0, -1))
            .addColumnAfter()
            .command(({ tr }) => {
              // A fixed-width table grows by the new column; give it the narrowest existing width.
              const table = tableNode(tr.doc, tablePos)
              if (!table) return false
              const map = TableMap.get(table)
              const widths: Array<number | null> = Array.from({ length: map.width }, () => null)
              map.map.forEach(rel => {
                const { left, right } = map.findCell(rel)
                const colwidth = table.nodeAt(rel)!.attrs.colwidth as number[] | null
                for (let c = left; c < right; c++) widths[c] = colwidth?.[c - left] ?? widths[c]
              })
              const known = widths.filter((w): w is number => !!w)
              if (known.length === map.width - 1) {
                widths[map.width - 1] = Math.max(MIN_COLUMN_WIDTH, Math.min(...known))
                setColumnWidths(tr, tablePos, widths)
              }
              return selectCell(tr, tablePos, 0, -1)
            })
            .run(),
      setTableRowHeight:
        (rowPos, height) =>
        ({ tr, dispatch }) => {
          const row = tr.doc.nodeAt(rowPos)
          if (row?.type.name !== 'tableRow') return false
          if (dispatch) tr.setNodeMarkup(rowPos, undefined, { ...row.attrs, rowHeight: height === null ? null : Math.max(MIN_ROW_HEIGHT, Math.round(height)) })
          return true
        },
      resizeTable:
        (tablePos, columnWidths, rowHeights) =>
        ({ tr, dispatch }) => {
          if (!tableNode(tr.doc, tablePos)) return false
          if (dispatch) {
            setColumnWidths(tr, tablePos, columnWidths.map(w => Math.max(MIN_COLUMN_WIDTH, Math.round(w))))
            if (rowHeights) setRowHeights(tr, tablePos, rowHeights.map(h => (h === null ? null : Math.max(MIN_ROW_HEIGHT, Math.round(h)))))
          }
          return true
        },
      resetTableSize:
        (tablePos, what = 'all') =>
        ({ tr, dispatch }) => {
          const table = tableNode(tr.doc, tablePos)
          if (!table) return false
          if (dispatch) {
            const map = TableMap.get(table)
            if (what !== 'rows') setColumnWidths(tr, tablePos, Array.from({ length: map.width }, () => null))
            if (what !== 'columns') setRowHeights(tr, tablePos, Array.from({ length: map.height }, () => null))
          }
          return true
        },
      distributeTableColumns:
        (tablePos, tableWidth) =>
        ({ tr, dispatch }) => {
          const table = tableNode(tr.doc, tablePos)
          if (!table) return false
          const { width } = TableMap.get(table)
          if (dispatch) setColumnWidths(tr, tablePos, scaleWidths(Array.from({ length: width }, () => 1), tableWidth))
          return true
        },
    }
  },
})
