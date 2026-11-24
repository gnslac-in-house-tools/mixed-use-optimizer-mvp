// La barra superior (GIM `views/layout/TopBar.tsx` y `MenuBar.tsx`): el logo, la barra de menús (Archivo · Editar ·
// Ver · Sitio · Diseño · Herramientas · Ayuda, con los mismos comandos que GIM), Deshacer y Rehacer y, a la derecha, el
// proyecto, su guardado y la opción. Los comandos que esta app todavía no tiene se ven atenuados: luego se decide
// cuáles aplican.
import { useEffect, useRef, useState } from 'react'
import { Icon, IconButton } from './Icon'
import { encuadre, useUi } from './ui'

interface Item { label: string; keys?: string; run?: () => void; checked?: boolean; sub?: boolean }
type Entrada = Item | '—'

function useMenus(): { name: string; items: Entrada[] }[] {
  const u = useUi()
  const ver = (v: typeof u.vista) => () => u.setVista(v)
  return [
    { name: 'Archivo', items: [{ label: 'Nuevo proyecto' }, { label: 'Nuevo proyecto en blanco' }, '—', { label: 'Abrir proyecto…', keys: 'Ctrl+O' }, { label: 'Guardar', keys: 'Ctrl+S' }, { label: 'Exportar', sub: true }, '—', { label: 'Datos del proyecto…' }, { label: 'Autoguardado', checked: true }, { label: 'Abrir el proyecto demo' }, '—', { label: 'Inicio' }] },
    { name: 'Editar', items: [{ label: 'Deshacer', keys: 'Ctrl+Z' }, { label: 'Rehacer', keys: 'Ctrl+Y' }, '—', { label: 'Copiar', keys: 'Ctrl+C' }, { label: 'Pegar', keys: 'Ctrl+V' }, { label: 'Pegar aquí', keys: 'Ctrl+Shift+V' }, { label: 'Duplicar', keys: 'Ctrl+D' }, { label: 'Borrar', keys: 'Supr' }, { label: 'Seleccionar todo', keys: 'Ctrl+A' }, '—', { label: 'Agrupar', keys: 'Ctrl+G' }, { label: 'Desagrupar', keys: 'Ctrl+Shift+G' }, { label: 'Renombrar', keys: 'F2' }, { label: 'Bloquear', keys: 'Ctrl+Shift+L' }, { label: 'Ocultar', keys: 'Ctrl+H' }, { label: 'Girar 90°', keys: 'Shift+R' }, { label: 'Propiedades', run: () => { u.setPanel('left', true); u.setTabIzq('propiedades') } }, '—', { label: 'Atajos de teclado…' }] },
    {
      name: 'Ver',
      items: [
        { label: 'Planta', keys: 'Alt+1', run: ver('plan'), checked: u.vista === 'plan' },
        { label: '3D', keys: 'Alt+2', run: ver('3d'), checked: u.vista === '3d' },
        { label: 'Dividida', keys: 'Alt+3', run: ver('split'), checked: u.vista === 'split' },
        '—',
        { label: 'Encuadrar', keys: 'Z', run: () => encuadre.ir?.() },
        '—',
        { label: 'Panel Catálogo y propiedades', run: () => u.setPanel('left', !u.panels.left), checked: u.panels.left },
        { label: 'Panel Resumen', run: () => u.setPanel('right', !u.panels.right), checked: u.panels.right },
        { label: 'Barra de KPIs', run: () => u.setShow('kpis', !u.show.kpis), checked: u.show.kpis },
        { label: 'Barra de herramientas', run: () => u.setShow('tools', !u.show.tools), checked: u.show.tools },
        { label: 'Barra de dibujo', run: () => u.setShow('drafting', !u.show.drafting), checked: u.show.drafting },
        { label: 'Superposiciones', sub: true }, { label: 'Colorear por', sub: true }, { label: 'Terreno', sub: true }, { label: 'Detalle', sub: true },
        '—',
        { label: 'Imán', keys: 'F3' }, { label: 'Tipos de imán', sub: true }, { label: 'Alinear' }, { label: 'Orto', keys: 'F8' }, { label: 'Retícula', keys: 'F9' },
        '—',
        { label: 'Tema', sub: true }, { label: 'Pantalla completa', keys: 'Ctrl+Shift+F', run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) },
        { label: 'Arreglo predeterminado', run: u.reset },
      ],
    },
    { name: 'Sitio', items: [{ label: 'Importar…' }, { label: 'Dibujar lindero' }, { label: 'Colocar mapa' }, { label: 'Ubicación…' }, { label: 'Reglas del sitio…' }, { label: 'Terreno…' }, { label: 'Mover el pivote de la retícula' }, { label: 'Restaurar la retícula' }] },
    { name: 'Diseño', items: [{ label: 'Opciones', sub: true }, '—', { label: 'Programa…' }, { label: 'Reglas…' }, { label: 'Niveles…' }, { label: 'Nuevo edificio' }, '—', { label: 'Resolver todo', keys: 'Ctrl+Enter' }] },
    { name: 'Herramientas', items: [{ label: 'Seleccionar', keys: 'V', checked: true, run: () => undefined }, { label: 'Mover', keys: 'M' }, { label: 'Copiar', keys: 'C' }, { label: 'Girar', keys: 'R' }, { label: 'Reflejar', keys: 'I' }, { label: 'Arreglo', keys: 'A' }, { label: 'Alinear', keys: 'Shift+A' }, { label: 'Volumen', sub: true }, { label: 'Elementos', sub: true }, { label: 'Calles', sub: true }, { label: 'Estacionamiento', sub: true }, { label: 'Anotaciones', sub: true }] },
    { name: 'Ayuda', items: [{ label: 'Ayuda', keys: 'F1' }, { label: 'Aprende desde cero' }, { label: 'Recorrido de la muestra' }, { label: 'Acerca de' }, '—', { label: 'Grafo de estado' }] },
  ]
}

function MenuBar() {
  const menus = useMenus()
  const [open, setOpen] = useState<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (open === null) return
    const out = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(null) }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(null)
    window.addEventListener('pointerdown', out)
    window.addEventListener('keydown', esc)
    return () => { window.removeEventListener('pointerdown', out); window.removeEventListener('keydown', esc) }
  }, [open])

  return (
    <div ref={ref} role="menubar" aria-label="Barra de menús" className="relative flex shrink-0 items-center whitespace-nowrap">
      {menus.map((m, i) => (
        <div key={m.name} className="relative">
          <button
            type="button"
            role="menuitem"
            aria-haspopup="menu"
            aria-expanded={open === i}
            onClick={() => setOpen(open === i ? null : i)}
            onPointerEnter={() => open !== null && setOpen(i)}
            className={`pressable h-[2rem] shrink-0 rounded-control px-2.5 text-body hover:bg-hover hover:text-ink ${open === i ? 'bg-hover text-ink' : 'text-ink-secondary'}`}
          >
            {m.name}
          </button>
          {open === i && (
            <div role="menu" aria-label={m.name} className="absolute left-0 top-full z-30 mt-1 min-w-[15rem] rounded-glass bg-panel py-1 shadow-sheet">
              {m.items.map((it, k) =>
                it === '—' ? (
                  <div key={k} role="separator" className="mx-3 my-1 h-px bg-separator" />
                ) : (
                  <button
                    key={k}
                    type="button"
                    role={it.checked !== undefined ? 'menuitemcheckbox' : 'menuitem'}
                    aria-checked={it.checked}
                    disabled={!it.run}
                    title={it.run ? undefined : 'Por decidir si aplica a esta app'}
                    onClick={() => { it.run?.(); setOpen(null) }}
                    className="flex h-row w-full items-center gap-2 px-3 text-left text-body text-ink hover:bg-hover disabled:text-ink-tertiary disabled:hover:bg-transparent"
                  >
                    <span className="w-3 shrink-0 text-caption">{it.checked ? '✓' : ''}</span>
                    <span className="flex-1">{it.label}</span>
                    {it.keys && <span className="text-caption text-ink-tertiary">{it.keys}</span>}
                    {it.sub && <span className="text-caption text-ink-tertiary">▸</span>}
                  </button>
                ),
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export function TopBar() {
  return (
    <header aria-label="Barra superior" className="flex items-center gap-3 px-gutter py-2">
      <button type="button" aria-label="Inicio" title="Inicio" className="pressable shrink-0 rounded-control p-0.5 hover:bg-hover">
        <span aria-hidden className="grid h-[1.75rem] w-[1.75rem] place-items-center rounded-[0.5rem] bg-ink text-on-ink">
          <Icon name="logo" className="h-[1rem] w-[1rem]" />
        </span>
      </button>
      <MenuBar />
      <span aria-hidden className="h-4 w-px shrink-0 bg-separator" />
      <div className="flex shrink-0 items-center gap-1">
        <IconButton icon="undo" label="Deshacer" title="Nada que deshacer" disabled />
        <IconButton icon="redo" label="Rehacer" title="Nada que rehacer" disabled />
      </div>
      <div className="ml-auto flex min-w-0 shrink items-center justify-end">
        <div className="flex min-w-0 items-center gap-3">
          <h1 className="flex min-w-0 text-body text-ink-secondary">
            <button type="button" title="Datos del proyecto" className="pressable min-w-0 max-w-full truncate rounded-control px-1 hover:bg-hover hover:text-ink">
              Catálogo de unidades
            </button>
          </h1>
          <span title="Mi biblioteca se guarda en este navegador" className="relative flex h-7 shrink-0 items-center gap-1.5 rounded-control px-1.5 text-caption text-ink-tertiary">
            <Icon name="save" />
            <span className="hidden whitespace-nowrap tabular-nums panel:inline">Guardado en el navegador</span>
          </span>
          <span aria-hidden className="shrink-0 text-ink-tertiary">/</span>
          <button type="button" title="Opciones de diseño" className="pressable flex max-w-full items-center gap-1 rounded-control px-1.5 py-0.5 text-body text-ink hover:bg-hover">
            <span className="min-w-0 max-w-[10rem] truncate">Opción 1</span>
            <Icon name="chevron" className="h-3.5 w-3.5 shrink-0 text-ink-secondary" />
          </button>
        </div>
      </div>
    </header>
  )
}
