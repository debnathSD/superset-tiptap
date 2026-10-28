import { autoUpdate, computePosition, flip, offset, shift } from '@floating-ui/dom'
import { Extension } from '@tiptap/core'
import { PluginKey } from '@tiptap/pm/state'
import { ReactRenderer } from '@tiptap/react'
import Suggestion, { type SuggestionProps } from '@tiptap/suggestion'
import { filterInsertItems, type InsertItem } from '../menus/catalog'
import { SlashMenu, type SlashMenuHandle } from '../menus/SlashMenu'

export const slashKey = new PluginKey('slashCommand')

/** "/" opens the block catalog at the cursor — the fluid equivalent of SharePoint's "+" toolbox. */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<InsertItem, InsertItem>({
        editor: this.editor,
        pluginKey: slashKey,
        char: '/',
        allowSpaces: false,
        startOfLine: false,
        allow: ({ state, range }) => {
          const $from = state.doc.resolve(range.from)
          return !$from.parent.type.spec.code && state.selection.empty
        },
        items: ({ query }) => filterInsertItems(query),
        command: ({ editor, range, props }) => {
          editor.chain().focus().deleteRange(range).run()
          props.run(editor)
        },
        render: () => {
          type MenuProps = { items: InsertItem[]; command: (item: InsertItem) => void }
          let renderer: ReactRenderer<SlashMenuHandle, MenuProps> | null = null
          let current: SuggestionProps<InsertItem, InsertItem> | null = null
          let stopFollowing: (() => void) | null = null

          const place = () => {
            const rect = current?.clientRect?.()
            const element = renderer?.element as HTMLElement | undefined
            if (!rect || !element) return
            const virtual = { getBoundingClientRect: () => current?.clientRect?.() ?? rect }
            computePosition(virtual, element, {
              placement: 'bottom-start',
              strategy: 'fixed',
              middleware: [offset(6), flip({ padding: 8 }), shift({ padding: 8 })],
            }).then(({ x, y }) => {
              Object.assign(element.style, { left: `${x}px`, top: `${y}px` })
            })
          }

          return {
            onStart: props => {
              const created = new ReactRenderer<SlashMenuHandle, MenuProps>(SlashMenu, { props, editor: props.editor })
              renderer = created
              const element = created.element as HTMLElement
              element.style.position = 'fixed'
              element.style.zIndex = '60'
              // Mount inside the editor's scoped root when there is one (Superset scopes every style and theme
              // token under .pg-root); otherwise on the body.
              const host = (props.editor.view.dom.closest('.pg-root') as HTMLElement | null) ?? document.body
              host.appendChild(element)
              current = props
              // Follow the "/" while the menu is open: scrolling, page breaks re-measuring or the menu growing all move it.
              const anchor = { getBoundingClientRect: () => current?.clientRect?.() ?? new DOMRect(), contextElement: props.editor.view.dom }
              stopFollowing = autoUpdate(anchor, element, place, { animationFrame: true })
            },
            onUpdate: props => {
              current = props
              renderer?.updateProps(props)
              place()
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                stopFollowing?.()
                stopFollowing = null
                renderer?.destroy()
                renderer?.element.remove()
                renderer = null
                return true
              }
              return renderer?.ref?.onKeyDown(event) ?? false
            },
            onExit: () => {
              stopFollowing?.()
              stopFollowing = null
              current = null
              renderer?.element.remove()
              renderer?.destroy()
              renderer = null
            },
          }
        },
      }),
    ]
  },
})
