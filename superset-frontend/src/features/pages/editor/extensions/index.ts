import type { Extensions } from '@tiptap/core'
import FileHandler from '@tiptap/extension-file-handler'
import Highlight from '@tiptap/extension-highlight'
import Image from '@tiptap/extension-image'
import { TaskItem, TaskList } from '@tiptap/extension-list'
import { TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import { TableOfContents } from '@tiptap/extension-table-of-contents'
import TextAlign from '@tiptap/extension-text-align'
import { Color, TextStyle } from '@tiptap/extension-text-style'
import { Placeholder } from '@tiptap/extensions'
import StarterKit from '@tiptap/starter-kit'
import { readFileAsDataURL } from '../lib/dom'
import { uid } from '../lib/nodeAttrs'
import { BlockStyle, StyledTable } from './blockStyle'
import { Collapsible } from './collapsible'
import { Banner, Callout, Card } from './containers'
import { Divider, Spacer } from './divider'
import { Column, PageDocument, Section } from './section'
import { SlashCommand } from './slashCommand'
import { Chart, KpiGrid, PageProperties, QuickLinks, StatusPill, WebPartLinkGuard } from './webparts'
import { ChartDrop, SupersetChart } from '../../chart/SupersetChart'
import { PageBreak, Pagination } from '../../pagination/pagination'
import { DEFAULT_PAGE_SETTINGS, type PageSettings } from '../../pagination/settings'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml']

/** Schema-only extensions: enough to parse, render and export pages (also used by tests). */
export function schemaExtensions(): Extensions {
  return [
    PageDocument,
    StarterKit.configure({
      document: false,
      horizontalRule: false,
      heading: { levels: [1, 2, 3, 4] },
      link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      dropcursor: { color: 'var(--accent)', width: 3 },
    }),
    Section,
    Column,
    Divider,
    Spacer,
    Callout,
    Card,
    Banner,
    QuickLinks,
    KpiGrid,
    Chart,
    PageProperties,
    StatusPill,
    SupersetChart,
    PageBreak,
    BlockStyle,
    TextStyle,
    Color,
    Highlight.configure({ multicolor: true }),
    TextAlign.configure({ types: ['heading', 'paragraph'] }),
    TaskList,
    TaskItem.configure({ nested: true }),
    StyledTable.configure({ resizable: true, cellMinWidth: 60 }),
    TableRow,
    TableHeader,
    TableCell,
    Image.configure({
      allowBase64: true,
      resize: { enabled: true, alwaysPreserveAspectRatio: true, minWidth: 80, minHeight: 40 },
    }),
    // Stable heading ids: outline, deep links and fold state key off them (sections/callouts get theirs from Collapsible).
    TableOfContents.configure({ getId: () => uid('h') }),
    Collapsible,
  ]
}

/** Full authoring setup for the page editor. */
export function editorExtensions(settings: PageSettings = DEFAULT_PAGE_SETTINGS): Extensions {
  return [
    ...schemaExtensions(),
    Pagination.configure({ settings }),
    ChartDrop,
    SlashCommand,
    WebPartLinkGuard,
    Placeholder.configure({
      includeChildren: true,
      placeholder: ({ node }) =>
        node.type.name === 'heading' ? `Heading ${node.attrs.level}` : "Type '/' for sections and web parts, or just start writing",
    }),
    FileHandler.configure({
      allowedMimeTypes: IMAGE_TYPES,
      onDrop: async (editor, files, pos) => {
        for (const file of files) {
          const src = await readFileAsDataURL(file)
          editor.chain().insertContentAt(pos, { type: 'image', attrs: { src, alt: file.name } }).focus().run()
        }
      },
      onPaste: async (editor, files, html) => {
        if (html) return
        for (const file of files) {
          const src = await readFileAsDataURL(file)
          editor.chain().focus().insertContent({ type: 'image', attrs: { src, alt: file.name } }).run()
        }
      },
    }),
  ]
}
