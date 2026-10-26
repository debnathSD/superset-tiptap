import { computePosition, flip, offset, shift } from '@floating-ui/dom'
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

          const place = (props: SuggestionProps<InsertItem, InsertItem>) => {
            const rect = props.clientRect?.()
            const element = renderer?.element as HTMLElement | undefined
            if (!rect || !element) return
            const virtual = { getBoundingClientRect: () => rect }
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
              document.body.appendChild(element)
              place(props)
            },
            onUpdate: props => {
              renderer?.updateProps(props)
              place(props)
            },
            onKeyDown: ({ event }) => {
              if (event.key === 'Escape') {
                renderer?.destroy()
                renderer?.element.remove()
                renderer = null
                return true
              }
              return renderer?.ref?.onKeyDown(event) ?? false
            },
            onExit: () => {
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
