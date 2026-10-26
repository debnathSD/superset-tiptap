import type { Editor } from '@tiptap/core'
import { useEditorState } from '@tiptap/react'
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  Code,
  Highlighter,
  Italic,
  Link,
  List,
  ListOrdered,
  ListTodo,
  PaintBucket,
  Plus,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
  Unlink,
} from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BlockVariant } from '../extensions/blockStyle'
import { filterInsertItems } from '../menus/catalog'
import { InsertList, type SlashMenuHandle } from '../menus/SlashMenu'
import { PALETTE } from '../lib/palette'
import { Popover, Segmented, Swatches } from '../ui/controls'

const TEXT_COLORS = PALETTE.map(c => ({ key: c.hex, label: c.label, hex: c.hex }))

const HIGHLIGHTS = [
  { key: 'rgba(250, 204, 21, 0.4)', label: 'Yellow', hex: '#facc15' },
  { key: 'rgba(74, 222, 128, 0.35)', label: 'Green', hex: '#4ade80' },
  { key: 'rgba(96, 165, 250, 0.35)', label: 'Blue', hex: '#60a5fa' },
  { key: 'rgba(244, 114, 182, 0.35)', label: 'Pink', hex: '#f472b6' },
  { key: 'rgba(192, 132, 252, 0.35)', label: 'Purple', hex: '#c084fc' },
  { key: 'rgba(251, 146, 60, 0.4)', label: 'Orange', hex: '#fb923c' },
]

function TB({
  title,
  onClick,
  active,
  disabled,
  children,
}: {
  title: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      className="tb-button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      data-active={active ? 'true' : undefined}
      disabled={disabled}
      onMouseDown={event => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function InsertMenu({ editor, close }: { editor: Editor; close: () => void }) {
  const [query, setQuery] = useState('')
  const listRef = useRef<SlashMenuHandle>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => inputRef.current?.focus(), [])
  const items = filterInsertItems(query)
  return (
    <div className="insert-menu">
      <input
        ref={inputRef}
        className="input"
        placeholder="Search blocks and web parts…"
        value={query}
        aria-label="Search blocks"
        onChange={event => setQuery(event.target.value)}
        onKeyDown={event => {
          if (listRef.current?.onKeyDown(event.nativeEvent)) event.preventDefault()
        }}
      />
      <InsertList
        ref={listRef}
        items={items}
        command={item => {
          close()
          item.run(editor)
        }}
      />
    </div>
  )
}

function LinkEditor({ editor, close }: { editor: Editor; close: () => void }) {
  const [href, setHref] = useState<string>(editor.getAttributes('link').href ?? '')
  const apply = () => {
    if (!href.trim()) editor.chain().focus().extendMarkRange('link').unsetLink().run()
    else editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run()
    close()
  }
  return (
    <form
      className="link-editor"
      onSubmit={event => {
        event.preventDefault()
        apply()
      }}
    >
      <input className="input" autoFocus placeholder="https://…" value={href} aria-label="Link URL" onChange={e => setHref(e.target.value)} />
      <button type="submit" className="btn btn--primary">
        Apply
      </button>
    </form>
  )
}

/** The SharePoint-style command bar shown in edit mode. */
export function Toolbar({ editor }: { editor: Editor }) {
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => {
      const { $from } = e.state.selection
      const block = $from.parent
      return {
        canUndo: e.can().undo(),
        canRedo: e.can().redo(),
        blockType: block.type.name === 'heading' ? `h${block.attrs.level}` : block.type.name === 'paragraph' ? 'p' : 'other',
        bold: e.isActive('bold'),
        italic: e.isActive('italic'),
        underline: e.isActive('underline'),
        strike: e.isActive('strike'),
        code: e.isActive('code'),
        link: e.isActive('link'),
        bullet: e.isActive('bulletList'),
        ordered: e.isActive('orderedList'),
        task: e.isActive('taskList'),
        quote: e.isActive('blockquote'),
        align: (block.attrs.textAlign as string) ?? 'left',
        color: (e.getAttributes('textStyle').color as string) ?? null,
        highlight: (e.getAttributes('highlight').color as string) ?? null,
        blockColor: (block.attrs.blockColor as string) ?? null,
        blockVariant: (block.attrs.blockVariant as BlockVariant) ?? 'tint',
        textblock: block.isTextblock && ['paragraph', 'heading'].includes(block.type.name),
      }
    },
  })

  const setBlockType = (value: string) => {
    const chain = editor.chain().focus()
    if (value === 'p') chain.setParagraph().run()
    else chain.setHeading({ level: Number(value.slice(1)) as 1 | 2 | 3 | 4 }).run()
  }

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <div className="toolbar__group">
        <Popover title="Insert" label={<><Plus size={16} /> Insert</>} className="toolbar__insert">
          {close => <InsertMenu editor={editor} close={close} />}
        </Popover>
      </div>

      <div className="toolbar__group">
        <TB title="Undo (⌘Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!s.canUndo}>
          <Undo2 size={16} />
        </TB>
        <TB title="Redo (⇧⌘Z)" onClick={() => editor.chain().focus().redo().run()} disabled={!s.canRedo}>
          <Redo2 size={16} />
        </TB>
      </div>

      <div className="toolbar__group">
        <select
          className="tb-select"
          aria-label="Text style"
          value={s.blockType === 'other' ? '' : s.blockType}
          disabled={!s.textblock}
          onChange={event => setBlockType(event.target.value)}
        >
          {s.blockType === 'other' && <option value="">—</option>}
          <option value="p">Normal text</option>
          <option value="h1">Heading 1</option>
          <option value="h2">Heading 2</option>
          <option value="h3">Heading 3</option>
          <option value="h4">Heading 4</option>
        </select>
      </div>

      <div className="toolbar__group">
        <TB title="Bold (⌘B)" active={s.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={16} />
        </TB>
        <TB title="Italic (⌘I)" active={s.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={16} />
        </TB>
        <TB title="Underline (⌘U)" active={s.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <Underline size={16} />
        </TB>
        <TB title="Strikethrough" active={s.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={16} />
        </TB>
        <TB title="Inline code" active={s.code} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={16} />
        </TB>
      </div>

      <div className="toolbar__group">
        <Popover title="Text color" label={<Baseline size={16} style={{ color: s.color ?? undefined }} />} active={!!s.color}>
          {close => (
            <div className="popover__body">
              <div className="popover__title">Text color</div>
              <Swatches
                colors={TEXT_COLORS}
                value={s.color}
                noneLabel="Default"
                onChange={value => {
                  if (value) editor.chain().focus().setColor(value).run()
                  else editor.chain().focus().unsetColor().run()
                  close()
                }}
              />
            </div>
          )}
        </Popover>
        <Popover title="Highlight" label={<Highlighter size={16} />} active={!!s.highlight}>
          {close => (
            <div className="popover__body">
              <div className="popover__title">Highlight</div>
              <Swatches
                colors={HIGHLIGHTS}
                value={s.highlight}
                noneLabel="No highlight"
                onChange={value => {
                  if (value) editor.chain().focus().setHighlight({ color: value }).run()
                  else editor.chain().focus().unsetHighlight().run()
                  close()
                }}
              />
            </div>
          )}
        </Popover>
        <Popover title="Block color" label={<PaintBucket size={16} />} active={!!s.blockColor} disabled={!s.textblock}>
          {close => (
            <div className="popover__body">
              <div className="popover__title">Block color</div>
              <Segmented<BlockVariant>
                label="Treatment"
                value={s.blockVariant}
                options={[
                  { value: 'tint', label: 'Tint' },
                  { value: 'solid', label: 'Solid' },
                  { value: 'bar', label: 'Accent bar' },
                ]}
                onChange={variant => editor.chain().focus().setBlockStyle(s.blockColor ?? 'teal', variant).run()}
              />
              <Swatches
                value={s.blockColor}
                onChange={value => {
                  editor.chain().focus().setBlockStyle(value, s.blockVariant).run()
                  close()
                }}
              />
            </div>
          )}
        </Popover>
        {s.link ? (
          <TB title="Remove link" onClick={() => editor.chain().focus().extendMarkRange('link').unsetLink().run()}>
            <Unlink size={16} />
          </TB>
        ) : (
          <Popover title="Link" label={<Link size={16} />}>
            {close => <LinkEditor editor={editor} close={close} />}
          </Popover>
        )}
      </div>

      <div className="toolbar__group">
        <TB title="Align left" active={s.align === 'left'} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft size={16} />
        </TB>
        <TB title="Align center" active={s.align === 'center'} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter size={16} />
        </TB>
        <TB title="Align right" active={s.align === 'right'} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight size={16} />
        </TB>
      </div>

      <div className="toolbar__group">
        <TB title="Bulleted list" active={s.bullet} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={16} />
        </TB>
        <TB title="Numbered list" active={s.ordered} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={16} />
        </TB>
        <TB title="Checklist" active={s.task} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListTodo size={16} />
        </TB>
        <TB title="Quote" active={s.quote} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={16} />
        </TB>
      </div>
    </div>
  )
}
