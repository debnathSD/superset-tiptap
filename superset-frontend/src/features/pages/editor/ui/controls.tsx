import { Check, ChevronDown } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { colorHex, isHexColor, PALETTE } from '../lib/palette'

/** Small, dependency-free form controls shared by the toolbar and the property pane. */

let nextId = 0
/** React 17-safe stable id (Superset is on React 17, which has no useId). */
const useStableId = () => {
  const ref = useRef<string>()
  if (!ref.current) ref.current = `pg-field-${(nextId += 1)}`
  return ref.current
}

export function Popover({
  label,
  title,
  children,
  className = '',
  align = 'start',
  disabled,
  active,
}: {
  label: ReactNode
  title: string
  children: (close: () => void) => ReactNode
  className?: string
  align?: 'start' | 'end'
  disabled?: boolean
  active?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent) => !ref.current?.contains(event.target as Node) && setOpen(false)
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`popover ${className}`} ref={ref}>
      <button
        type="button"
        className="tb-button tb-button--menu"
        title={title}
        aria-label={title}
        aria-haspopup="dialog"
        aria-expanded={open}
        data-active={active ? 'true' : undefined}
        disabled={disabled}
        onMouseDown={event => event.preventDefault()}
        onClick={() => setOpen(v => !v)}
      >
        {label}
        <ChevronDown size={12} className="tb-caret" />
      </button>
      {open && (
        <div className="popover__panel" data-align={align} role="dialog" aria-label={title}>
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  )
}

export function Swatches({
  value,
  onChange,
  allowNone = true,
  noneLabel = 'None',
  colors,
}: {
  value: string | null | undefined
  onChange: (value: string | null) => void
  allowNone?: boolean
  noneLabel?: string
  /** Override the palette (e.g. raw text colors); defaults to palette keys. */
  colors?: Array<{ key: string; label: string; hex: string }>
}) {
  const list = colors ?? PALETTE.map(c => ({ ...c }))
  const custom = isHexColor(value) && !list.some(c => c.key === value)
  return (
    <div className="swatches" role="radiogroup">
      {allowNone && (
        <button
          type="button"
          role="radio"
          aria-checked={!value}
          className="swatch swatch--none"
          title={noneLabel}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onChange(null)}
        />
      )}
      {list.map(color => (
        <button
          key={color.key}
          type="button"
          role="radio"
          aria-checked={value === color.key}
          className="swatch"
          title={color.label}
          style={{ background: color.hex }}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onChange(color.key)}
        >
          {value === color.key && <Check size={12} />}
        </button>
      ))}
      <label className="swatch swatch--custom" title="Custom color" data-checked={custom || undefined}>
        <input
          type="color"
          value={colorHex(value as never) ?? (isHexColor(value) ? value : '#0f766e')}
          onChange={event => onChange(event.target.value)}
          aria-label="Custom color"
        />
      </label>
    </div>
  )
}

export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  label,
}: {
  value: T
  options: Array<{ value: T; label: ReactNode; title?: string }>
  onChange: (value: T) => void
  label?: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map(option => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          title={option.title}
          onMouseDown={event => event.preventDefault()}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function Toggle({ checked, onChange, label, hint }: { checked: boolean; onChange: (v: boolean) => void; label: string; hint?: string }) {
  const id = useStableId()
  return (
    <div className="toggle-row">
      <label htmlFor={id}>
        <span>{label}</span>
        {hint && <small>{hint}</small>}
      </label>
      <button id={id} type="button" role="switch" aria-checked={checked} aria-label={label} className="toggle" onClick={() => onChange(!checked)}>
        <span />
      </button>
    </div>
  )
}

export function Slider({
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  label,
}: {
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (v: number) => void
  label: string
}) {
  return (
    <div className="slider">
      <input type="range" min={min} max={max} step={step} value={value} aria-label={label} onChange={event => onChange(Number(event.target.value))} />
      <output>
        {value}
        {unit}
      </output>
    </div>
  )
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="field">
      <div className="field__label">{label}</div>
      {children}
      {hint && <div className="field__hint">{hint}</div>}
    </div>
  )
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  label,
  multiline,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: 'text' | 'url' | 'number'
  label?: string
  multiline?: boolean
}) {
  if (multiline) {
    return <textarea className="input" rows={3} value={value} placeholder={placeholder} aria-label={label} onChange={event => onChange(event.target.value)} />
  }
  return <input className="input" type={type} value={value} placeholder={placeholder} aria-label={label} onChange={event => onChange(event.target.value)} />
}

export function PaneSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="pane-section">
      <h3>{title}</h3>
      {children}
    </section>
  )
}
