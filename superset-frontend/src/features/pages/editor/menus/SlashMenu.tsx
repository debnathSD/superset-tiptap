import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { INSERT_GROUPS, type InsertItem } from './catalog'

export type SlashMenuHandle = { onKeyDown: (event: KeyboardEvent) => boolean }
type Props = { items: InsertItem[]; command: (item: InsertItem) => void; query?: string }

/** Grouped, keyboard-driven list used by the "/" menu and the Insert menu. */
export const InsertList = forwardRef<SlashMenuHandle, Props & { autoFocusSearch?: boolean }>(function InsertList(
  { items, command },
  ref,
) {
  const [active, setActive] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => setActive(0), [items])

  useLayoutEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  useImperativeHandle(ref, () => ({
    onKeyDown: event => {
      if (!items.length) return false
      if (event.key === 'ArrowDown') {
        setActive(i => (i + 1) % items.length)
        return true
      }
      if (event.key === 'ArrowUp') {
        setActive(i => (i - 1 + items.length) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[active]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  if (!items.length) return <div className="insert-list__empty">No matching blocks</div>

  let index = -1
  return (
    <div className="insert-list" ref={listRef} role="listbox" aria-label="Insert a block">
      {INSERT_GROUPS.map(group => {
        const groupItems = items.filter(item => item.group === group)
        if (!groupItems.length) return null
        return (
          <div key={group} className="insert-list__group" role="group" aria-label={group}>
            <div className="insert-list__heading">{group}</div>
            {groupItems.map(item => {
              index += 1
              const i = index
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  type="button"
                  role="option"
                  data-index={i}
                  aria-selected={i === active}
                  className="insert-list__item"
                  onMouseEnter={() => setActive(i)}
                  onMouseDown={event => event.preventDefault()}
                  onClick={() => command(item)}
                >
                  <span className="insert-list__icon">
                    <Icon size={17} />
                  </span>
                  <span className="insert-list__text">
                    <span className="insert-list__title">{item.title}</span>
                    <span className="insert-list__desc">{item.description}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
})

export const SlashMenu = forwardRef<SlashMenuHandle, Props>(function SlashMenu(props, ref) {
  return (
    <div className="floating-menu slash-menu">
      <InsertList {...props} ref={ref} />
    </div>
  )
})
