// A NumberField for a length (Phase BE.8): its value, bounds and commit are in metres, what it shows and takes is in the
// block editor's unit (units.ts). In feet a bound shown rounded can still be typed back: the bounds give half a displayed
// unit of room, and the committed value is clamped to the real ones.
import { NumberField, type NumberFieldProps } from '../../../views/controls/fields.tsx'
import { fromShown, toShown, useUnits } from './units.ts'

/** Half of the last decimal shown (two). */
const SLACK = 0.005

export function LengthField(props: Omit<NumberFieldProps, 'unit'>) {
  const unit = useUnits((s) => s.unit)
  // in metres the NumberField it was, its own props as given
  if (unit === 'm') return <NumberField {...props} unit="m" />
  const { value, min = -Infinity, max = Infinity, onCommit, ...rest } = props
  const shown = value === null ? null : toShown(value, unit)
  return (
    <NumberField
      {...rest}
      unit={unit}
      value={shown}
      min={toShown(min, unit) - SLACK}
      max={toShown(max, unit) + SLACK}
      onCommit={(v) => {
        const metres = Math.min(max, Math.max(min, fromShown(v, unit)))
        // what it showed, typed again: nothing changed
        if (value !== null && Math.abs(metres - value) < 1e-9) return
        onCommit(metres)
      }}
    />
  )
}
