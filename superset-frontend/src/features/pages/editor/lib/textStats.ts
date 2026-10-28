import type { JSONContent } from '@tiptap/core'

export type TextStats = {
  words: number
  characters: number
  headings: number
  images: number
  webParts: number
  readingMinutes: number
}

const WORDS_PER_MINUTE = 230
const SECONDS_PER_IMAGE = 10
const WEB_PARTS = new Set(['kpiGrid', 'chart', 'quickLinks', 'pageProperties'])

/** Text that lives in attributes (web parts, section titles) still gets read, so it counts. */
function attributeText(node: JSONContent): string[] {
  const attrs = node.attrs ?? {}
  switch (node.type) {
    case 'section':
      return [attrs.title ?? '']
    case 'statusPill':
      return [attrs.label ?? '']
    case 'kpiGrid':
      return (attrs.items ?? []).flatMap((i: Record<string, string>) => [i.label, i.value, i.unit, i.status, i.delta, i.target, i.note])
    case 'quickLinks':
      return [attrs.title ?? '', ...(attrs.items ?? []).flatMap((i: Record<string, string>) => [i.label, i.description])]
    case 'chart':
      return [attrs.title ?? '', attrs.caption ?? '', ...(attrs.data ?? []).map((d: Record<string, string>) => d.label)]
    case 'pageProperties':
      return (attrs.items ?? []).flatMap((i: Record<string, string>) => [i.label, i.value])
    case 'card':
      return [attrs.href ? attrs.cta ?? '' : '']
    default:
      return []
  }
}

/** Walk the document JSON once and sum up what a reader will actually read. */
export function textStats(doc: JSONContent): TextStats {
  const chunks: string[] = []
  let headings = 0
  let images = 0
  let webParts = 0

  const visit = (node: JSONContent) => {
    if (node.type === 'text') {
      chunks.push(node.text ?? '')
      return
    }
    if (node.type === 'heading') headings += 1
    if (node.type === 'image') images += 1
    if (node.type === 'card' && node.attrs?.image) images += 1
    if (node.type && WEB_PARTS.has(node.type)) webParts += 1
    const fromAttrs = attributeText(node).filter(Boolean)
    if (fromAttrs.length) chunks.push(` ${fromAttrs.join(' ')} `)
    node.content?.forEach(visit)
    // Block boundaries separate words even though no whitespace is typed between blocks.
    if (node.content) chunks.push(' ')
  }
  visit(doc)

  const text = chunks.join('').replace(/\s+/g, ' ').trim()
  const words = text ? text.split(' ').filter(token => /[\p{L}\p{N}]/u.test(token)).length : 0
  const characters = text.length
  const seconds = (words / WORDS_PER_MINUTE) * 60 + images * SECONDS_PER_IMAGE
  return { words, characters, headings, images, webParts, readingMinutes: words ? Math.max(1, Math.round(seconds / 60)) : 0 }
}
