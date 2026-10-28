/**
 * Shared color system for regions, blocks, callouts, cards and data web parts.
 *
 * A color value stored in the document is either a palette key ("teal") or a
 * custom hex ("#1f6feb"). Rendering never hard-codes the final color: it emits
 * `data-color` (+ an inline `--c` for custom hex) and the stylesheet derives
 * tint / solid / accent treatments with `color-mix`, so the same document
 * looks right in light and dark themes.
 */

export const PALETTE = [
  { key: 'neutral', label: 'Neutral', hex: '#64748b' },
  { key: 'teal', label: 'Teal', hex: '#0f766e' },
  { key: 'blue', label: 'Blue', hex: '#1d4ed8' },
  { key: 'indigo', label: 'Indigo', hex: '#4338ca' },
  { key: 'purple', label: 'Purple', hex: '#7e22ce' },
  { key: 'pink', label: 'Pink', hex: '#be185d' },
  { key: 'red', label: 'Red', hex: '#b91c1c' },
  { key: 'orange', label: 'Orange', hex: '#c2410c' },
  { key: 'amber', label: 'Amber', hex: '#a16207' },
  { key: 'green', label: 'Green', hex: '#15803d' },
] as const

export type PaletteKey = (typeof PALETTE)[number]['key']
export type ColorValue = PaletteKey | `#${string}` | null

const KEYS = new Set<string>(PALETTE.map(c => c.key))
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i

export function isPaletteKey(value: unknown): value is PaletteKey {
  return typeof value === 'string' && KEYS.has(value)
}

export function isHexColor(value: unknown): value is `#${string}` {
  return typeof value === 'string' && HEX.test(value)
}

/** "0f766e", "#0F766E" or "#abc" → "#0f766e"; anything else → null. */
export function parseHex(input: string): `#${string}` | null {
  const raw = input.trim().replace(/^#?/, '#')
  if (!HEX.test(raw)) return null
  const digits = raw.slice(1).toLowerCase()
  return `#${digits.length === 3 ? [...digits].map(d => d + d).join('') : digits}`
}

export function normalizeColor(value: unknown): ColorValue {
  if (isPaletteKey(value) || isHexColor(value)) return value
  return null
}

export function colorHex(value: ColorValue): string | null {
  if (!value) return null
  if (isHexColor(value)) return value
  return PALETTE.find(c => c.key === value)?.hex ?? null
}

/** Black or white, whichever reads better on top of `hex`. */
export function readableOn(hex: string): string {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('')
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
  const luminance = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
  return luminance > 0.4 ? '#111827' : '#ffffff'
}

/**
 * HTML attributes that hook an element into the color system.
 * `prefix` lets one element carry two colors (e.g. section background + accent).
 */
export function colorAttrs(value: unknown, prefix = 'color'): Record<string, string> {
  const color = normalizeColor(value)
  if (!color) return {}
  if (isPaletteKey(color)) return { [`data-${prefix}`]: color }
  const cssVar = prefix === 'color' ? '--c' : `--c-${prefix}`
  return {
    [`data-${prefix}`]: 'custom',
    style: `${cssVar}: ${color}; ${cssVar}-on: ${readableOn(color)};`,
  }
}

/** Merge several `style` strings produced by helpers into one attribute. */
export function mergeStyles(...styles: Array<string | undefined | null | false>): string | undefined {
  const merged = styles.filter(Boolean).join(' ').trim()
  return merged || undefined
}

export const TONES = [
  { key: 'good', label: 'On track / good' },
  { key: 'info', label: 'In progress / info' },
  { key: 'warn', label: 'At risk / warning' },
  { key: 'bad', label: 'Off track / bad' },
  { key: 'neutral', label: 'Neutral' },
] as const

export type Tone = (typeof TONES)[number]['key']

export function normalizeTone(value: unknown): Tone {
  return TONES.some(t => t.key === value) ? (value as Tone) : 'neutral'
}
