import { Extension } from '@tiptap/core'
import { Table, TableView } from '@tiptap/extension-table'
import type { Node as PMNode } from '@tiptap/pm/model'
import { colorAttrs, normalizeColor } from '../lib/palette'

/**
 * Colors on blocks: a paragraph, heading or quote can carry a block color with
 * a treatment — `tint` (soft background), `solid` (filled header bar) or
 * `bar` (accent rule on the left). Table cells get a background color with an
 * opacity (it wins over the header color), and tables get a style preset with
 * a header color and opacity. Strong fills switch to readable text.
 */

export type BlockVariant = 'tint' | 'solid' | 'bar'

/** From this opacity on, text on the fill switches to the color's readable text color. */
export const STRONG_OPACITY = 60

export function parseOpacity(value: unknown): number | null {
  const n = Number(value)
  return value !== null && value !== '' && Number.isFinite(n) && n >= 5 && n <= 100 ? Math.round(n) : null
}

/** Attributes for a fill opacity: a CSS variable, plus a flag when text must switch color. */
function opacityAttrs(prefix: 'cell' | 'header', opacity: number) {
  return {
    [`data-${prefix}-opacity`]: opacity,
    ...(opacity >= STRONG_OPACITY ? { [`data-${prefix}-strong`]: '' } : {}),
    style: `--${prefix}-opacity: ${opacity}%`,
  }
}
export const BLOCK_STYLE_TYPES = ['paragraph', 'heading', 'blockquote']

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    blockStyle: {
      setBlockStyle: (color: string | null, variant?: BlockVariant) => ReturnType
    }
  }
}

export const BlockStyle = Extension.create({
  name: 'blockStyle',

  addGlobalAttributes() {
    return [
      {
        types: BLOCK_STYLE_TYPES,
        attributes: {
          blockColor: {
            default: null,
            parseHTML: el => normalizeColor(el.getAttribute('data-block-color')),
            renderHTML: attrs => {
              if (!attrs.blockColor) return {}
              const color = colorAttrs(attrs.blockColor)
              return {
                class: 'has-block-style',
                'data-block-color': attrs.blockColor,
                'data-color': color['data-color'],
                style: color.style,
              }
            },
          },
          blockVariant: {
            default: 'tint',
            parseHTML: el => el.getAttribute('data-variant') || 'tint',
            renderHTML: attrs => (attrs.blockColor ? { 'data-variant': attrs.blockVariant } : {}),
          },
        },
      },
      {
        types: ['tableCell', 'tableHeader'],
        attributes: {
          cellColor: {
            default: null,
            parseHTML: el => normalizeColor(el.getAttribute('data-cell-color')),
            renderHTML: attrs => {
              if (!attrs.cellColor) return {}
              const color = colorAttrs(attrs.cellColor)
              return { 'data-cell-color': attrs.cellColor, 'data-color': color['data-color'], style: color.style }
            },
          },
          /** 5–100 %: how strongly the color fills the cell; null is the theme's soft tint. */
          cellOpacity: {
            default: null,
            parseHTML: el => parseOpacity(el.getAttribute('data-cell-opacity')),
            renderHTML: attrs => (attrs.cellColor && attrs.cellOpacity ? opacityAttrs('cell', attrs.cellOpacity) : {}),
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setBlockStyle:
        (color, variant) =>
        ({ tr, state, dispatch }) => {
          const { from, to } = state.selection
          let applied = false
          state.doc.nodesBetween(from, to, (node, pos) => {
            if (!BLOCK_STYLE_TYPES.includes(node.type.name)) return true
            applied = true
            if (dispatch) {
              tr.setNodeAttribute(pos, 'blockColor', color)
              if (variant) tr.setNodeAttribute(pos, 'blockVariant', variant)
            }
            return node.type.name === 'blockquote'
          })
          return applied
        },
    }
  },
})

/** Table node view that also reflects the style preset on the wrapper. */
class StyledTableView extends TableView {
  constructor(node: PMNode, cellMinWidth: number) {
    super(node, cellMinWidth)
    this.applyStyle(node)
  }

  update(node: PMNode) {
    const ok = super.update(node)
    if (ok) this.applyStyle(node)
    return ok
  }

  private applyStyle(node: PMNode) {
    this.dom.dataset.tableStyle = node.attrs.tableStyle
    const color = colorAttrs(node.attrs.headerColor, 'header')
    if (color['data-header']) this.dom.dataset.header = color['data-header']
    else delete this.dom.dataset.header
    this.dom.style.cssText = color.style ?? ''
    const opacity = parseOpacity(node.attrs.headerOpacity)
    if (opacity && node.attrs.headerColor) {
      this.dom.dataset.headerOpacity = String(opacity)
      this.dom.style.setProperty('--header-opacity', `${opacity}%`)
      if (opacity >= STRONG_OPACITY) this.dom.dataset.headerStrong = ''
      else delete this.dom.dataset.headerStrong
    } else {
      delete this.dom.dataset.headerOpacity
      delete this.dom.dataset.headerStrong
    }
  }
}

export const StyledTable = Table.extend({
  addOptions() {
    return { ...this.parent!(), View: StyledTableView }
  },

  addAttributes() {
    return {
      ...this.parent?.(),
      tableStyle: {
        default: 'default',
        parseHTML: el => el.getAttribute('data-table-style') || el.closest('[data-table-style]')?.getAttribute('data-table-style') || 'default',
        renderHTML: attrs => ({ 'data-table-style': attrs.tableStyle }),
      },
      headerColor: {
        default: 'teal',
        parseHTML: el => normalizeColor(el.getAttribute('data-header-color')),
        renderHTML: attrs => {
          const color = colorAttrs(attrs.headerColor, 'header')
          return attrs.headerColor ? { 'data-header-color': attrs.headerColor, 'data-header': color['data-header'], style: color.style } : {}
        },
      },
      headerOpacity: {
        default: null,
        parseHTML: el => parseOpacity(el.getAttribute('data-header-opacity')),
        renderHTML: attrs => (attrs.headerColor && attrs.headerOpacity ? opacityAttrs('header', attrs.headerOpacity) : {}),
      },
    }
  },
})
