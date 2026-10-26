import { NodeViewContent, NodeViewWrapper, type ReactNodeViewProps } from '@tiptap/react'
import { ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { calloutDomAttrs, type CalloutAttrs } from '../extensions/containers'
import { hasCollapsedDecoration, toReactProps } from '../lib/dom'
import { useEditable } from '../lib/mode'

export const CALLOUT_ICONS = ['💡', 'ℹ️', '✅', '⚠️', '⛔', '📌', '❓', '📣', '🚀', '🗓️', '⭐', '🔒', '📝', '🎯', '🔥', '']

export function CalloutView({ node, editor, updateAttributes, decorations, selected }: ReactNodeViewProps) {
  const attrs = node.attrs as CalloutAttrs
  const editable = useEditable()
  const id: string | null = node.attrs['data-toc-id']
  const collapsed = attrs.collapsible && hasCollapsedDecoration(decorations)
  const [picking, setPicking] = useState(false)
  const pickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!picking) return
    const onDown = (event: MouseEvent) => !pickerRef.current?.contains(event.target as Node) && setPicking(false)
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [picking])

  return (
    <NodeViewWrapper
      as="aside"
      {...toReactProps(calloutDomAttrs(attrs))}
      id={id ?? undefined}
      data-toc-id={id ?? undefined}
      data-collapsed={collapsed ? 'true' : undefined}
      data-selected={selected ? 'true' : undefined}
    >
      {(attrs.icon || editable) && (
        <div className="pg-callout__icon-slot" contentEditable={false} ref={pickerRef}>
          {editable ? (
            <button
              type="button"
              className="pg-callout__icon"
              data-empty={attrs.icon ? undefined : 'true'}
              title="Change icon"
              onClick={() => setPicking(v => !v)}
            >
              {attrs.icon || '+'}
            </button>
          ) : (
            <span className="pg-callout__icon" aria-hidden="true">
              {attrs.icon}
            </span>
          )}
          {picking && (
            <div className="icon-picker" role="listbox" aria-label="Callout icon">
              {CALLOUT_ICONS.map(icon => (
                <button
                  key={icon || 'none'}
                  type="button"
                  role="option"
                  aria-selected={icon === attrs.icon}
                  title={icon ? icon : 'No icon'}
                  onClick={() => {
                    updateAttributes({ icon })
                    setPicking(false)
                  }}
                >
                  {icon || '∅'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <NodeViewContent className="pg-callout__body" />

      {attrs.collapsible && (
        <button
          type="button"
          className="pg-collapse-toggle pg-callout__toggle"
          contentEditable={false}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Show answer' : 'Hide answer'}
          onClick={() => id && editor.commands.toggleCollapsed(id)}
        >
          <ChevronDown size={18} />
        </button>
      )}
    </NodeViewWrapper>
  )
}
