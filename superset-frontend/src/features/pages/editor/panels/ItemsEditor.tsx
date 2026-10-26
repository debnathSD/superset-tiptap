import { ArrowDown, ArrowUp, ChevronRight, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { uid } from '../lib/nodeAttrs'
import { TONES } from '../lib/palette'

export type ItemField<T> = {
  key: keyof T & string
  label: string
  type?: 'text' | 'url' | 'number' | 'tone' | 'textarea' | 'percent'
  placeholder?: string
  half?: boolean
}

/** Edit a list of web-part items (links, KPI tiles, chart points…) inline in the property pane. */
export function ItemsEditor<T extends { id: string }>({
  items,
  fields,
  onChange,
  create,
  title,
  addLabel,
}: {
  items: T[]
  fields: ItemField<T>[]
  onChange: (items: T[]) => void
  create: () => Omit<T, 'id'>
  title: (item: T, index: number) => string
  addLabel: string
}) {
  const [open, setOpen] = useState<string | null>(items[0]?.id ?? null)

  const update = (index: number, patch: Partial<T>) => onChange(items.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  const move = (index: number, delta: number) => {
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item)
    onChange(next)
  }

  return (
    <div className="items-editor">
      {items.map((item, index) => {
        const expanded = open === item.id
        return (
          <div key={item.id} className="items-editor__item" data-open={expanded || undefined}>
            <div className="items-editor__head">
              <button type="button" className="items-editor__title" aria-expanded={expanded} onClick={() => setOpen(expanded ? null : item.id)}>
                <ChevronRight size={14} />
                <span>{title(item, index)}</span>
              </button>
              <button type="button" className="icon-btn" title="Move up" disabled={index === 0} onClick={() => move(index, -1)}>
                <ArrowUp size={14} />
              </button>
              <button type="button" className="icon-btn" title="Move down" disabled={index === items.length - 1} onClick={() => move(index, 1)}>
                <ArrowDown size={14} />
              </button>
              <button type="button" className="icon-btn is-danger" title="Remove" onClick={() => onChange(items.filter((_, i) => i !== index))}>
                <Trash2 size={14} />
              </button>
            </div>
            {expanded && (
              <div className="items-editor__fields">
                {fields.map(field => {
                  const value = item[field.key] as unknown
                  const id = `${item.id}-${field.key}`
                  let control
                  if (field.type === 'tone') {
                    control = (
                      <select id={id} className="input" value={String(value ?? 'neutral')} onChange={e => update(index, { [field.key]: e.target.value } as Partial<T>)}>
                        {TONES.map(t => (
                          <option key={t.key} value={t.key}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    )
                  } else if (field.type === 'textarea') {
                    control = (
                      <textarea id={id} className="input" rows={2} value={String(value ?? '')} placeholder={field.placeholder} onChange={e => update(index, { [field.key]: e.target.value } as Partial<T>)} />
                    )
                  } else if (field.type === 'number' || field.type === 'percent') {
                    control = (
                      <input
                        id={id}
                        className="input"
                        type="number"
                        step="any"
                        min={field.type === 'percent' ? 0 : undefined}
                        max={field.type === 'percent' ? 100 : undefined}
                        value={value === null || value === undefined ? '' : String(value)}
                        placeholder={field.placeholder}
                        onChange={e => update(index, { [field.key]: e.target.value === '' ? null : Number(e.target.value) } as Partial<T>)}
                      />
                    )
                  } else {
                    control = (
                      <input
                        id={id}
                        className="input"
                        type={field.type === 'url' ? 'url' : 'text'}
                        value={String(value ?? '')}
                        placeholder={field.placeholder}
                        onChange={e => update(index, { [field.key]: e.target.value } as Partial<T>)}
                      />
                    )
                  }
                  return (
                    <div key={field.key} className="field" data-half={field.half || undefined}>
                      <label className="field__label" htmlFor={id}>
                        {field.label}
                      </label>
                      {control}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
      <button
        type="button"
        className="btn btn--ghost items-editor__add"
        onClick={() => {
          const item = { ...create(), id: uid('it') } as T
          onChange([...items, item])
          setOpen(item.id)
        }}
      >
        <Plus size={14} /> {addLabel}
      </button>
    </div>
  )
}
