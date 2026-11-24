// The circulation's settings: the option's road area, the trucks' and the cars' (Decision "Circulation layout"; the whole a KPI
// the strip can show too: road-area). Properties shows it for the Circulation branch and the Streets row of Layers (Phase AS.3,
// Decision "Settings by what is picked"), and the Flow tab did until it went (Decisions "Exterior circulation", 4.4–4.5, "Parameter
// tabs" and "Flow step"). Its streets are drawn on the plan (the Street tool; since ST.4 no road is derived, so the ring roads'
// boxes and *Restore removed roads* went). The roads' and the gates' standards (the road width, the clearances, what a new gate
// starts with), like the street types, are the Brief's (its Circulation tab): `BriefCirculationLink` says so and opens it, once, under
// this section in Properties. The car parking has its own settings (ParkingTab.tsx).
import { useApp } from '../../state/store.ts'
import { Section, Total } from '../controls/fields.tsx'
import { m2 } from '../format.ts'
import { useUi } from '../layout/ui.ts'
import { t as tr } from '../../i18n/idioma.ts' // mixed-use-mvp

/** The line that says where the roads', gates' and stalls' standards are, with the button that opens them (Brief › Circulation). */
export function BriefCirculationLink() {
  return (
    <p className="text-caption text-ink-secondary">
      What the roads, gates and stalls are made with:{' '}
      <button
        type="button"
        title={tr("The Brief’s Circulation tab: the standards, the ranges the optimizer searches, the parking’s demand")}
        onClick={() => {
          useUi.getState().setBriefTab('circulation')
          useUi.getState().openDialog('brief')
        }}
        className="pressable rounded-control underline underline-offset-2 hover:text-ink"
      >
        Brief › Circulation
      </button>
      .
    </p>
  )
}

export function CirculationTab() {
  const totals = useApp((s) => s.derived.circulation.totals)

  return (
    <div className="flex flex-col gap-5">
      <Section title={tr("Totals")}>
        <dl aria-label="Circulation totals" className="flex flex-col gap-1.5">
          <Total label="Truck roads" value={m2(totals.roadArea - totals.carRoadArea)} />
          <Total label="Car roads" value={m2(totals.carRoadArea)} />
          <Total label="Roads" value={m2(totals.roadArea)} />
        </dl>
      </Section>
    </div>
  )
}
