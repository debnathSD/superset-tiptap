import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { ArrowDown, ArrowUp, ChevronDown, Copy, Plus, Settings2, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { LAYOUTS, sectionDomAttrs, type SectionAttrs, type SectionLayout } from '../extensions/section'
import { hasCollapsedDecoration, toReactProps } from '../lib/dom'
import { useEditable } from '../lib/mode'

export function LayoutGlyph({ layout }: { layout: SectionLayout }) {
  const spans: Record<SectionLayout, number[]> = {
    one: [6],
    two: [3, 3],
    three: [2, 2, 2],
    oneThirdLeft: [2, 4],
    oneThirdRight: [4, 2],
  }
  return (
    <span className="layout-glyph" aria-hidden="true">
      {spans[layout].map((span, i) => (
        <span key={i} style={{ flexGrow: span }} />
      ))}
    </span>
  )
}

export function LayoutMenu({ onPick, onClose }: { onPick: (layout: SectionLayout) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose()
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="layout-menu" ref={ref} role="menu" aria-label="Section layout">
      <div className="layout-menu__title">Add a new section</div>
      {(Object.keys(LAYOUTS) as SectionLayout[]).map(layout => (
        <button key={layout} type="button" role="menuitem" className="layout-menu__item" onClick={() => onPick(layout)}>
          <LayoutGlyph layout={layout} />
          {LAYOUTS[layout].label}
        </button>
      ))}
    </div>
  )
}

export function SectionView({ node, editor, getPos, updateAttributes, selected, decorations }: ReactNodeViewProps) {
  const attrs = node.attrs as SectionAttrs
  const editable = useEditable()
  const [adding, setAdding] = useState(false)
  const id: string | null = node.attrs['data-toc-id']
  const collapsed = hasCollapsedDecoration(decorations)
  const hasHeader = !!attrs.title || attrs.collapsible
  const pos = () => getPos() ?? 0

  const toggle = () => id && editor.commands.toggleCollapsed(id)

  return (
    <NodeViewWrapper
      as="section"
      {...toReactProps(sectionDomAttrs(attrs))}
      id={id ?? undefined}
      data-toc-id={id ?? undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
      aria-label={attrs.title || undefined}
    >
      {editable && (
        <div className="pg-section__toolbar" contentEditable={false} role="toolbar" aria-label="Section">
          <span className="pg-section__toolbar-label">
            <LayoutGlyph layout={attrs.layout} />
            Section
          </span>
          <button type="button" title="Edit section" onClick={() => editor.chain().setNodeSelection(pos()).run()}>
            <Settings2 size={15} />
          </button>
          <button type="button" title="Move up" onClick={() => editor.commands.moveTopLevelNode(pos(), -1)}>
            <ArrowUp size={15} />
          </button>
          <button type="button" title="Move down" onClick={() => editor.commands.moveTopLevelNode(pos(), 1)}>
            <ArrowDown size={15} />
          </button>
          <button type="button" title="Duplicate section" onClick={() => editor.commands.duplicateNodeAt(pos())}>
            <Copy size={15} />
          </button>
          <button type="button" title="Delete section" className="is-danger" onClick={() => editor.commands.deleteNodeAt(pos())}>
            <Trash2 size={15} />
          </button>
        </div>
      )}

      {hasHeader && (
        <div className="pg-section__header" contentEditable={false}>
          {attrs.collapsible && (
            <button
              type="button"
              className="pg-collapse-toggle"
              aria-expanded={!collapsed}
              aria-label={collapsed ? 'Expand section' : 'Collapse section'}
              onClick={toggle}
            >
              <ChevronDown size={16} />
            </button>
          )}
          {editable ? (
            <input
              className="pg-section__title pg-section__title-input"
              value={attrs.title}
              placeholder="Section title"
              aria-label="Section title"
              onChange={event => updateAttributes({ title: event.target.value })}
            />
          ) : (
            <span className="pg-section__title" onClick={attrs.collapsible ? toggle : undefined}>
              {attrs.title}
            </span>
          )}
        </div>
      )}

      <NodeViewContent className="pg-section__grid" />

      {editable && (
        <div className="pg-section__add" contentEditable={false}>
          <button type="button" className="pg-add-button" title="Add a new section" onClick={() => setAdding(v => !v)}>
            <Plus size={14} />
          </button>
          {adding && (
            <LayoutMenu
              onClose={() => setAdding(false)}
              onPick={layout => {
                setAdding(false)
                editor.chain().focus().insertSection({ layout, at: pos() + node.nodeSize }).run()
              }}
            />
          )}
        </div>
      )}
    </NodeViewWrapper>
  )
}
