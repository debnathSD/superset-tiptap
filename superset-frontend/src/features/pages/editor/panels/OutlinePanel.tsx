import type { Editor } from '@tiptap/core'
import type { Node as PMNode } from '@tiptap/pm/model'
import { useEditorState } from '@tiptap/react'
import { ChevronDown, ChevronsDownUp, ChevronsUpDown, X } from 'lucide-react'
import { useEffect, useState, type RefObject } from 'react'
import { collapseKey, headingScope } from '../extensions/collapsible'
import type { TextStats } from '../lib/textStats'

export type OutlineItem = {
  id: string
  pos: number
  level: number
  text: string
  kind: 'heading' | 'section'
  foldable: boolean
  collapsed: boolean
}

/** Headings plus titled sections, in document order — the page's table of contents. */
export function outlineItems(doc: PMNode, collapsed: Set<string> = new Set()): OutlineItem[] {
  const items: OutlineItem[] = []
  doc.descendants((node, pos, parent, index) => {
    const id = node.attrs['data-toc-id'] as string | null
    if (!id) return true
    if (node.type.name === 'heading' && node.textContent.trim()) {
      items.push({
        id,
        pos,
        level: node.attrs.level,
        text: node.textContent,
        kind: 'heading',
        foldable: !!parent && headingScope(parent, index, pos).length > 0,
        collapsed: collapsed.has(id),
      })
    } else if (node.type.name === 'section' && node.attrs.title) {
      items.push({ id, pos, level: 2, text: node.attrs.title, kind: 'section', foldable: !!node.attrs.collapsible, collapsed: collapsed.has(id) })
    }
    return node.type.name !== 'heading'
  })
  return items
}

export function OutlinePanel({
  editor,
  stats,
  canvasRef,
  onClose,
}: {
  editor: Editor
  stats: TextStats
  canvasRef: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  const items = useEditorState({
    editor,
    selector: ({ editor: e }) => outlineItems(e.state.doc, collapseKey.getState(e.state)?.collapsed),
  })
  const [activeId, setActiveId] = useState<string | null>(null)
  const minLevel = Math.min(...items.map(i => i.level), 6)

  // Scroll spy: the active entry is the last heading that has scrolled past the top of the canvas.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    let frame = 0
    const update = () => {
      frame = 0
      const bounds = canvas.getBoundingClientRect()
      const atBottom = canvas.scrollTop + canvas.clientHeight >= canvas.scrollHeight - 4
      // Near the bottom, headings can no longer reach the top, so anything on screen counts.
      const line = atBottom ? bounds.bottom - 48 : bounds.top + 96
      let current: string | null = items[0]?.id ?? null
      for (const item of items) {
        const el = editor.view.dom.querySelector(`[data-toc-id="${item.id}"]`)
        if (!el || !(el as HTMLElement).offsetParent) continue
        if (el.getBoundingClientRect().top <= line) current = item.id
        else break
      }
      setActiveId(current)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    canvas.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      canvas.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(frame)
    }
  }, [items, editor, canvasRef])

  const go = (item: OutlineItem) => {
    editor.commands.revealPosition(item.pos + 1)
    // Folded node views re-render asynchronously; scroll once the revealed content is laid out.
    setTimeout(() => {
      const el = editor.view.dom.querySelector<HTMLElement>(`[data-toc-id="${item.id}"]`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      if (editor.isEditable && item.kind === 'heading') editor.commands.setTextSelection(item.pos + 1)
      setActiveId(item.id)
    }, 0)
  }

  const foldTargets = items.filter(i => i.foldable && i.level === Math.min(...items.filter(x => x.foldable && x.level > 1).map(x => x.level), 9))
  const anyCollapsed = items.some(i => i.collapsed)

  return (
    <aside className="outline" aria-label="On this page">
      <header className="outline__header">
        <div>
          <div className="pane__eyebrow">On this page</div>
          <div className="outline__meta">
            {stats.readingMinutes} min read · {stats.words.toLocaleString()} words
          </div>
        </div>
        <div className="outline__actions">
          <button
            type="button"
            className="icon-btn"
            title={anyCollapsed ? 'Expand all' : 'Collapse all'}
            onClick={() =>
              anyCollapsed
                ? editor.commands.expandAll()
                : editor.commands.setCollapsed(
                    foldTargets.map(i => i.id),
                    true,
                  )
            }
          >
            {anyCollapsed ? <ChevronsUpDown size={16} /> : <ChevronsDownUp size={16} />}
          </button>
          <button type="button" className="icon-btn" title="Hide outline" onClick={onClose}>
            <X size={16} />
          </button>
        </div>
      </header>
      {items.length ? (
        <ol className="outline__list">
          {items.map(item => (
            <li key={item.id} style={{ ['--indent' as string]: item.level - minLevel }} data-active={item.id === activeId || undefined}>
              {item.foldable ? (
                <button
                  type="button"
                  className="outline__fold"
                  aria-label={item.collapsed ? `Expand ${item.text}` : `Collapse ${item.text}`}
                  aria-expanded={!item.collapsed}
                  onClick={() => editor.commands.toggleCollapsed(item.id)}
                >
                  <ChevronDown size={13} />
                </button>
              ) : (
                <span className="outline__fold" aria-hidden="true" />
              )}
              <button type="button" className="outline__link" data-level={item.level} onClick={() => go(item)} title={item.text}>
                {item.text}
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="outline__empty">Add headings or titled sections and they will show up here.</p>
      )}
    </aside>
  )
}
