// "From site to massing" (Decisions "Steps", "Brief sync" and "Help"; the user asked for the tool to be easy to
// understand, for someone who does not know what to build): a card with the pipeline, Site → Brief → Rules → ▶ Solve →
// Massing, over the viewport (top left: the levels rail is top right). It is part of the help: Help › Help shows
// it with the notes, and its × turns the help off (remembered per browser, ui.ts).
import { Icon } from '../controls/Icon.tsx'
import { useUi } from '../layout/ui.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

const STEPS: { title: string; text: string }[] = [
  {
    title: 'Site: where it goes',
    text: 'The boundary, its setback and the maximum coverage: what can be built on.',
  },
  {
    title: 'Brief: what the client asks',
    text: 'Programs, their target area and count, and the size of a new mass: the source of truth. Approve brief goes on to Rules.',
  },
  {
    title: 'Rules: how the programs relate',
    text: 'In the list under the diagram, or with Draw rule: “Office must be adjacent to Warehouse”. The diagram changes as you edit them.',
  },
  {
    title: '▶ Solve makes the geometry',
    text: 'Solve all, in the Summary’s Issues (or S), places the masses the brief asks for and slides them until the rules are met: the smaller of two moves, the biggest stays.',
  },
  {
    title: 'Massing: edit by hand',
    text: 'The Program graph (an eye in Layers, under Annotations) shows the relations over the geometry; chips mark what breaks. Issues lists it all: Solve one, Solve all or Update brief.',
  },
]

export function Guide() {
  const open = useUi((s) => s.help)
  const setHelp = useUi((s) => s.setHelp)
  if (!open) return null
  return (
    <section
      aria-label="From site to massing"
      className="glass pointer-events-auto absolute left-4 top-4 z-10 flex max-h-[calc(100%-2rem)] w-80 flex-col gap-2 overflow-y-auto p-4 phone:inset-x-3 phone:w-auto"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-headline">{tr("From site to massing")}</h3>
        <button
          type="button"
          aria-label="Hide the help"
          title="Hide the guide and the notes (Help › Help in the top menu shows them again)"
          className="pressable -mr-1 -mt-0.5 grid h-6 w-6 place-items-center rounded-pill text-ink-glass hover:bg-hover hover:text-ink"
          onClick={() => setHelp(false)}
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      </div>
      <ol className="flex flex-col gap-2">
        {STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-2">
            <span aria-hidden className="grid h-5 w-5 shrink-0 place-items-center rounded-pill bg-ink text-caption text-on-ink">
              {i + 1}
            </span>
            <span className="flex flex-col">
              <span className="text-label text-ink">{s.title}</span>
              <span className="text-caption text-ink-glass">{s.text}</span>
            </span>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="pressable self-start rounded-control text-caption text-ink underline underline-offset-2"
        onClick={() => useUi.getState().openDialog('brief')}
      >
        {tr("Back to the Brief")}
      </button>
    </section>
  )
}
