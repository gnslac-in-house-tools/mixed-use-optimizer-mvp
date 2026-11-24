// The top menu (Project C, AS.1; spec "The top menu"): the top bar's seven menus, File · Edit · View · Site · Design · Tools ·
// Help, each a button that opens the registry's tree under it (`menuEntries([name])`, read when it opens, so a tick, a
// label that changed, a reason, a key the user gave and a list that grew are current). The bar is the one place the app's
// commands are listed; a strip, a key or a right-click menu show them by their id.
//   mouse     a click opens a menu, a second click on the same button closes it (the press that closed it is told apart from
//             the click that follows, so it is not reopened; a click with no press before it, a screen reader's or
//             element.click(), is a press of its own: the mark of a press goes when its pointer is released, as soon as the
//             click that belongs to it has been heard); with one open, resting on another button opens that one
//   keyboard  Alt pressed and released alone, or F10, puts the focus on the first button (Alt with another key is not
//             the bar's: Alt+1 is the Plan view); ← → walk the bar, ↓ Enter or Space open the menu, Escape gives the
//             focus back to where it was (the window losing the focus between Alt's press and its release, Alt+Tab away and
//             back, is not an Alt alone). In an open menu ← and → at its top level go to the previous and the next menu
//             (the bar wraps); Escape closes it and puts the focus back on its button
//   closing   a pick, Escape, a press outside (all `Menu`'s) and the window losing focus
// It shows the menus that have a command answering where the user is (`menusFor`): all seven in a project. Home covers the
// top bar altogether and keeps its own buttons, so the bar is not there.
// A phone has no room for seven menus: the bar is one ☰ button that opens them as a sheet, each menu a foldable section of
// its commands, a sub-menu a foldable one inside it (indented); a row is a command (label, tick, greyed with its reason), a
// pick closes the sheet and runs it; a greyed row says its reason under its label (a touch screen has no title to hover). The same registry, so nothing is on the desktop menu and not on the phone's.
import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { placeNow } from '../commands/dispatch.ts'
import { menuEntries, menusFor } from '../commands/index.ts'
import { Icon } from '../controls/Icon.tsx'
import { Menu, type MenuEntry } from '../controls/Menu.tsx'
import { usePhone } from './media.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

export function MenuBar() {
  return usePhone() ? <PhoneMenu /> : <Bar />
}

/** A menu that is open: which, its rows as they were when it opened, and where it hangs from. */
interface Opened {
  index: number
  items: MenuEntry[]
  at: { x: number; y: number }
  flip: { y: number }
}

const typingIn = (el: Element | null): boolean => el instanceof HTMLElement && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)

function Bar() {
  const names = menusFor('project')
  const [opened, setOpened] = useState<Opened | null>(null)
  // the button that takes the Tab: the one the focus was last on
  const [cursor, setCursor] = useState(0)
  const root = useRef<HTMLDivElement>(null)
  const buttons = useRef<(HTMLButtonElement | null)[]>([])
  // the latest values, for the listeners and handlers that outlive a render
  const namesRef = useRef(names)
  namesRef.current = names
  const openRef = useRef<number | null>(null)
  openRef.current = opened?.index ?? null
  /** The button a press landed on while its own menu was open: the click that follows is that press's, not a new one. */
  const pressed = useRef<number | null>(null)
  /** The key pressed last (Escape, to put the focus back on the button when the menu closes by it). */
  const lastKey = useRef<string | null>(null)
  const altAlone = useRef(false)
  /** Where the focus was before the bar took it. */
  const returnTo = useRef<HTMLElement | null>(null)

  const open = useCallback((index: number) => {
    const b = buttons.current[index]
    if (!b) return
    const r = b.getBoundingClientRect()
    setCursor(index)
    setOpened({ index, items: menuEntries([namesRef.current[index]]), at: { x: r.left, y: r.bottom }, flip: { y: r.top } })
  }, [])
  const close = useCallback(() => {
    if (lastKey.current === 'Escape') buttons.current[openRef.current ?? 0]?.focus()
    setOpened(null)
  }, [])
  const go = useCallback((delta: number) => {
    const n = namesRef.current.length
    if (openRef.current !== null && n > 0) open((openRef.current + delta + n) % n)
  }, [open])

  /** Puts the focus on the first button, remembering where it was. */
  const enter = useCallback(() => {
    const was = document.activeElement
    if (was instanceof HTMLElement && was !== document.body && !root.current?.contains(was)) returnTo.current = was
    setCursor(0)
    buttons.current[0]?.focus()
  }, [])
  const leave = useCallback(() => {
    const back = returnTo.current
    returnTo.current = null
    if (back?.isConnected) back.focus()
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, [])

  useEffect(() => {
    // registered at mount, so before a menu's own listeners: they read the state of the press or the key as it was
    const onDown = (e: PointerEvent) => {
      lastKey.current = null
      altAlone.current = false
      const i = buttons.current.findIndex((b) => b?.contains(e.target as Node))
      pressed.current = i >= 0 && openRef.current === i ? i : null
    }
    const onKeyDown = (e: KeyboardEvent) => {
      lastKey.current = e.key
      altAlone.current = e.key === 'Alt' && !e.ctrlKey && !e.metaKey && !e.shiftKey
      if (e.key === 'F10' && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && placeNow() === 'project') {
        e.preventDefault()
        enter()
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      lastKey.current = null
      if (e.key !== 'Alt') return
      const alone = altAlone.current
      altAlone.current = false
      // Alt alone: into the bar, or out of it when it is in; never while a field is being typed in or a window is open
      if (!alone || placeNow() !== 'project' || typingIn(document.activeElement)) return
      e.preventDefault()
      if (root.current?.contains(document.activeElement)) leave()
      else enter()
    }
    // the click of a press comes with the release of its pointer, in the same turn: after it the mark is stale (the press
    // ended elsewhere, no click will follow), and must not swallow the next click, a screen reader's for one
    const onUp = () => void setTimeout(() => (pressed.current = null), 0)
    // Alt+Tab away and back: the Alt pressed before the window went is not an Alt pressed and released alone
    const onBlur = () => {
      altAlone.current = false
    }
    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onUp, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
    return () => {
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onUp, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      window.removeEventListener('blur', onBlur)
    }
  }, [enter, leave])

  // the window losing the focus closes an open menu (Menu closes on a press outside and Escape, not on this)
  const isOpen = opened !== null
  useEffect(() => {
    if (!isOpen) return
    const away = () => setOpened(null)
    window.addEventListener('blur', away)
    return () => window.removeEventListener('blur', away)
  }, [isOpen])

  const onKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    const at = buttons.current.findIndex((b) => b === e.target)
    if (at < 0) return
    const n = names.length
    const focus = (i: number) => {
      e.preventDefault()
      setCursor(i)
      buttons.current[i]?.focus()
    }
    switch (e.key) {
      case 'ArrowRight':
        return focus((at + 1) % n)
      case 'ArrowLeft':
        return focus((at - 1 + n) % n)
      case 'Home':
        return focus(0)
      case 'End':
        return focus(n - 1)
      case 'ArrowDown':
      case 'Enter':
      case ' ':
        // the pick is made here: not the browser's click as well; a held Enter or Space opens the menu once
        e.preventDefault()
        if (e.repeat && e.key !== 'ArrowDown') return
        return open(at)
      case 'Escape':
        // the Escape is the bar's: the plan keeps its selection
        e.preventDefault()
        e.stopPropagation()
        return leave()
    }
  }

  return (
    <>
      <div
        ref={root}
        role="menubar"
        aria-label="Menu bar"
        className="flex shrink-0 items-center whitespace-nowrap"
        onKeyDown={onKeyDown}
        onFocus={(e) => {
          // coming in from the page (a click, Tab): that is where Escape goes back to; from a menu of this bar, not
          const from = e.relatedTarget
          if (from instanceof HTMLElement && !root.current?.contains(from) && !from.closest('[role="menu"]')) returnTo.current = from
        }}
      >
        {names.map((name, i) => {
          const shown = opened?.index === i
          return (
            <button
              key={name}
              ref={(el) => {
                buttons.current[i] = el
              }}
              type="button"
              role="menuitem"
              aria-haspopup="menu"
              aria-expanded={shown}
              data-tour={`menu-${name.toLowerCase()}`}
              tabIndex={i === cursor ? 0 : -1}
              onFocus={() => setCursor(i)}
              onMouseEnter={() => {
                if (openRef.current !== null && openRef.current !== i) open(i)
              }}
              onClick={() => {
                if (pressed.current === i) {
                  // the press already closed it: this click is its end, not a second press
                  pressed.current = null
                  return
                }
                if (shown) setOpened(null)
                else open(i)
              }}
              className={`pressable h-[2rem] shrink-0 rounded-control px-2.5 text-body ${
                shown ? 'bg-fill text-ink shadow-control' : 'text-ink-secondary hover:bg-hover hover:text-ink'
              }`}
            >
              {tr(name)}
            </button>
          )
        })}
      </div>
      {opened && <Menu key={opened.index} label={names[opened.index]} items={opened.items} at={opened.at} flip={opened.flip} onClose={close} onLeft={() => go(-1)} onRight={() => go(1)} />}
    </>
  )
}

/** A phone's menu: ☰ opens the seven menus as a sheet. */
function PhoneMenu() {
  const [open, setOpen] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const close = useCallback(() => {
    setOpen(false)
    button.current?.focus()
  }, [])
  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label="Menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        data-tour="menu"
        title={tr("Menu")}
        className="pressable grid h-11 w-11 shrink-0 place-items-center rounded-pill hover:bg-hover"
        onClick={() => (open ? close() : setOpen(true))}
      >
        <Icon name="menu" className="h-5 w-5" />
      </button>
      {open && <Sheet onClose={close} />}
    </>
  )
}

function Sheet({ onClose }: { onClose(): void }) {
  // read when the sheet opens, as the desktop menus are
  const [menus] = useState(() => menusFor('project').map((name) => ({ name, items: menuEntries([name]) })))
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('button')?.focus()
    // the Escape is the sheet's
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.preventDefault()
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose])
  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] bg-black/20" onClick={onClose} aria-hidden />
      <div
        ref={ref}
        role="dialog"
        aria-label="Menu"
        aria-modal="true"
        className="panel fixed inset-x-0 bottom-0 z-[90] flex max-h-[85dvh] flex-col rounded-b-none pb-[env(safe-area-inset-bottom)] shadow-sheet"
      >
        <div className="flex shrink-0 items-center justify-between px-4 pt-3">
          <h2 className="text-headline text-ink">{tr("Menu")}</h2>
          <button type="button" aria-label="Close menu" onClick={onClose} className="pressable grid h-11 w-11 place-items-center rounded-pill hover:bg-hover">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {menus.map((m) => (
            <Fold key={m.name} label={m.name} depth={0}>
              <Rows items={m.items} depth={1} onClose={onClose} />
            </Fold>
          ))}
        </div>
      </div>
    </>,
    document.body,
  )
}

/** A foldable section: a menu of the bar, or a sub-menu inside one (indented by its depth). */
function Fold({ label, depth, children }: { label: string; depth: number; children: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button
        type="button"
        data-sheet-label={label}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        style={{ paddingLeft: `${0.75 + depth}rem` }}
        className={`pressable flex min-h-11 w-full items-center gap-3 rounded-control pr-3 text-left text-body hover:bg-hover ${depth === 0 ? 'font-medium' : ''}`}
      >
        <span className="flex-1">{label}</span>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4 shrink-0 text-ink-secondary" />
      </button>
      {open && (
        <div role="group" aria-label={label}>
          {children}
        </div>
      )}
    </div>
  )
}

/** The rows of a menu: a command is a button (a tick when it is a switch, greyed with its reason), a sub-menu a fold. */
function Rows({ items, depth, onClose }: { items: MenuEntry[]; depth: number; onClose(): void }) {
  return (
    <>
      {items.map((e, i) => {
        if (e === 'separator') return <div key={`s${i}`} role="separator" className="mx-3 my-1 border-t border-separator" />
        if ('items' in e) {
          return (
            <Fold key={e.key} label={e.label} depth={depth}>
              <Rows items={e.items} depth={depth + 1} onClose={onClose} />
            </Fold>
          )
        }
        return (
          <button
            key={e.key}
            type="button"
            data-sheet-label={e.label}
            data-sheet-key={e.key}
            aria-pressed={e.checked}
            disabled={e.disabled}
            title={e.title === undefined ? undefined : tr(e.title)}
            onClick={() => {
              // the sheet closes first: what the command opens (a window, a panel's sheet) is not under it
              onClose()
              e.onSelect()
            }}
            style={{ paddingLeft: `${0.75 + depth}rem` }}
            className="pressable flex min-h-11 w-full items-center gap-3 rounded-control py-1 pr-3 text-left text-body hover:bg-hover disabled:hover:bg-transparent"
          >
            {/* a touch screen shows no title: a greyed row says why under its label */}
            <span className="flex-1">
              <span className={`block ${e.disabled ? 'opacity-40' : ''}`}>{e.label}</span>
              {e.disabled && e.title && <span data-sheet-reason className="block text-caption text-ink-secondary">{e.title}</span>}
            </span>
            {e.checked && <Icon name="check" className="h-4 w-4 shrink-0" />}
          </button>
        )
      })}
    </>
  )
}
