// A grid line picked by its bubble on the block's plan (Decision "Grid by line", GR.3): a chip at the plan's corner,
// its distances to the lines either side typed (*From B · To D*, to the module line nearest), *Delete line* (or Del);
// the box's first and last lines are its walls, step 2's: the chip says so. Each edit one undo step (commands.ts).
import type { WarehouseType } from '../../../model/schema.ts'
import { lineName } from '../../../engine/grid/index.ts'
import type { Generated } from '../engine/generate.ts'
import { LengthField } from './LengthField.tsx'
import { moveLine, removeLine } from './commands.ts'
import { useLengths } from './units.ts'

export function GridLineChip({ t, g, axis, line }: { t: WarehouseType; g: Generated; axis: 'x' | 'y'; line: number }) {
  const { text } = useLengths()
  const lines = g.runs[axis].lines
  if (line < 0 || line >= lines.length) return null
  const name = lineName(axis, line)
  const inner = line > 0 && line < lines.length - 1
  return (
    <section
      aria-label={`Grid line ${name}`}
      data-grid-line-chip={`${axis}${line}`}
      className="absolute right-3 top-3 flex w-[15rem] flex-col gap-2 panel p-3 shadow-panel"
      onPointerDown={(e) => e.stopPropagation()}
    >
      <span className="text-body font-semibold text-ink">{`Grid line ${name}`}</span>
      {inner ? (
        <>
          <LengthField label={`From ${lineName(axis, line - 1)}`} min={0} max={10000} value={lines[line] - lines[line - 1]} onCommit={(d) => moveLine(t.id, axis, line, lines[line - 1] + d)} />
          <LengthField label={`To ${lineName(axis, line + 1)}`} min={0} max={10000} value={lines[line + 1] - lines[line]} onCommit={(d) => moveLine(t.id, axis, line, lines[line + 1] - d)} />
          <span className="flex items-center justify-between gap-2">
            <button type="button" className="h-row rounded-control border border-separator px-2 text-body text-ink hover:bg-fill" onClick={() => removeLine(t.id, axis, line)}>
              {`Delete line ${name}`}
            </button>
            <span className="text-caption text-ink-tertiary">{`or Del: ${text(lines[line + 1] - lines[line - 1])}`}</span>
          </span>
          <p className="text-caption text-ink-tertiary">Dragged by its bubble, it moves module by module.</p>
        </>
      ) : (
        <p className="text-caption text-ink-tertiary">{`The box’s ${line === 0 ? 'first' : 'last'} line: its wall. Its length is step 2’s.`}</p>
      )}
    </section>
  )
}
