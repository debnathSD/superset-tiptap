import type { CSSProperties } from 'react'
import type { Decoration } from '@tiptap/pm/view'

/**
 * Convert attributes written for `renderHTML` (class, style string) into React
 * props, so node views and static HTML share a single attribute builder.
 */
export function toReactProps(attrs: Record<string, unknown>): Record<string, unknown> {
  const props: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue
    if (key === 'class') props.className = value
    else if (key === 'style') props.style = styleToObject(String(value))
    else props[key] = value
  }
  return props
}

export function styleToObject(style: string): CSSProperties {
  const out: Record<string, string> = {}
  for (const decl of style.split(';')) {
    const index = decl.indexOf(':')
    if (index < 0) continue
    const prop = decl.slice(0, index).trim()
    const value = decl.slice(index + 1).trim()
    if (!prop) continue
    const key = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    out[key] = value
  }
  return out as CSSProperties
}

/** True when the collapsible plugin marked this node view as collapsed. */
export function hasCollapsedDecoration(decorations: readonly Decoration[] | undefined) {
  return !!decorations?.some(d => (d as unknown as { spec?: { collapsed?: boolean } }).spec?.collapsed)
}

export function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function pickImageFile(): Promise<string | null> {
  return new Promise(resolve => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'image/*'
    input.onchange = async () => {
      const file = input.files?.[0]
      resolve(file ? await readFileAsDataURL(file) : null)
    }
    input.click()
  })
}

/**
 * ReactNodeView only re-renders when the node changes; fold state arrives as a
 * decoration, so also re-render when the collapsed decoration flips.
 */
export const collapseAwareUpdate = {
  update: ({
    oldNode,
    newNode,
    oldDecorations,
    newDecorations,
    updateProps,
  }: {
    oldNode: { type: unknown }
    newNode: { type: unknown }
    oldDecorations: readonly Decoration[]
    newDecorations: readonly Decoration[]
    updateProps: () => void
  }) => {
    if (oldNode.type !== newNode.type) return false
    if (oldNode !== newNode || hasCollapsedDecoration(oldDecorations) !== hasCollapsedDecoration(newDecorations)) updateProps()
    return true
  },
}
