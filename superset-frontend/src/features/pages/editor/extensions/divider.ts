import { mergeAttributes, Node } from '@tiptap/core'
import HorizontalRule from '@tiptap/extension-horizontal-rule'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { colorAttrs, mergeStyles, normalizeColor } from '../lib/palette'
import { SpacerView } from '../nodeviews/SpacerView'

/**
 * Divider — SharePoint's divider web part. Keeps the `horizontalRule` name so
 * `---` input rules and `setHorizontalRule()` keep working, and adds style,
 * weight, length, alignment and color.
 */
export const Divider = HorizontalRule.extend({
  addAttributes() {
    const data = (name: string, fallback: string | number, parse: (v: string) => unknown = v => v) => ({
      default: fallback,
      parseHTML: (el: HTMLElement) => {
        const value = el.getAttribute(`data-${name}`)
        return value === null ? fallback : parse(value)
      },
      renderHTML: () => ({}),
    })
    return {
      lineStyle: data('style', 'solid'),
      weight: data('weight', 1, Number),
      length: data('length', 100, Number),
      align: data('align', 'center'),
      color: { default: null, parseHTML: el => normalizeColor(el.getAttribute('data-color-value')), renderHTML: () => ({}) },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="divider"]' }, { tag: 'hr' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const { lineStyle, weight, length, align, color } = node.attrs
    const colors = colorAttrs(color)
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'divider',
        class: 'pg-divider',
        'data-style': lineStyle,
        'data-weight': weight,
        'data-length': length,
        'data-align': align,
        'data-color-value': color ?? undefined,
        'data-color': colors['data-color'],
        style: mergeStyles(`--weight: ${weight}px; --length: ${length}%;`, colors.style),
      }),
      ['hr'],
    ]
  },
})

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    spacer: { insertSpacer: (height?: number) => ReturnType }
  }
}

/** Spacer — vertical whitespace with a drag-resizable height. */
export const Spacer = Node.create({
  name: 'spacer',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      height: {
        default: 48,
        parseHTML: el => Number(el.getAttribute('data-height')) || 48,
        renderHTML: () => ({}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'div[data-type="spacer"]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, {
        'data-type': 'spacer',
        class: 'pg-spacer',
        'data-height': node.attrs.height,
        style: `height: ${node.attrs.height}px`,
        'aria-hidden': 'true',
      }),
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(SpacerView)
  },

  addCommands() {
    return {
      insertSpacer:
        (height = 48) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { height } }),
    }
  },
})
