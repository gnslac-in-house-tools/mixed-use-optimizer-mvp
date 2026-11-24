// The Note tool (Shift+T; Phase AS.5, Decision "Notes"): one click places a note reading *Note* on the level in view, picks it, opens Properties with its text selected (its text is its
// name, as Rename's is: typing replaces it), and the tool lets go. The point goes through the snap (Shift is free) and the command line takes a typed one (x,y · @x,y · 12<30). Escape
// leaves the tool. The note is one undo step; the notes' eye opens if it was closed, as every drawing tool shows what it draws.
import { useCallback, useEffect, useState } from 'react'
import type { Point } from '../../../model/schema.ts'
import { actions } from '../../../state/actions/index.ts'
import { useApp } from '../../../state/store.ts'
import { renameRef } from '../../editing/refOps.ts'
import { NOTES } from '../../layers/keys.ts'
import { showLayers } from '../../layers/layerView.ts'
import { letGo } from '../../tools/hand.ts'
import { useCommand } from '../command/commandState.ts'
import { pickRefs } from '../mix.ts'
import type { SnapMark as Mark } from '../snap/move.ts'
import { SnapMark } from '../snap/SnapMark.tsx'
import { Capture, Crosshair, useDrawingKeys, useToolSnap, type ToolCamera } from '../tools/common.tsx'
import { noteBox, noteLines } from './noteLook.ts'

/** What a new note reads. */
const NEW_NOTE = 'Note'

/** A note at this point of the level in view, picked, its text asked for in Properties, and the tool let go; false when it is not made (the point is not one). */
export function placeNote(at: Point): boolean {
  let made: string | undefined
  useApp.getState().apply((p) => {
    const r = actions.addNote(p, at, NEW_NOTE, useApp.getState().level)
    made = r?.id
    return r?.project ?? p
  })
  if (made === undefined) return false
  showLayers(NOTES)
  const ref = { kind: 'note', id: made }
  pickRefs([ref])
  letGo()
  renameRef(ref)
  return true
}

export function PlaceNote({ camera }: { camera: ToolCamera }) {
  const snap = useToolSnap(camera.scale)
  const [cursor, setCursor] = useState<Point | null>(null)
  const [mark, setMark] = useState<Mark | null>(null)
  const px = 1 / camera.scale
  const escape = useCallback(() => letGo(), [])
  // Enter and Delete have nothing to finish or take back: one click is the whole tool
  useDrawingKeys({ enter: () => false, escape, back: () => {} })

  const at = (e: { clientX: number; clientY: number; shiftKey: boolean }): Point => {
    const r = snap(camera.toWorld(e), e, null)
    setMark(r.mark)
    useCommand.getState().setCursor(r.point)
    return r.point
  }

  useEffect(() => {
    useCommand.getState().register({
      tool: 'Note',
      prompt: 'Where the note goes',
      help: 'click or type x,y',
      context: () => ({ first: true, base: null, cursor: useCommand.getState().cursor, rectangle: false, angle: useCommand.getState().angle }),
      apply: (c) => (c.kind === 'point' ? placeNote(c.point) : false),
      cancel: escape,
    })
  }, [escape])
  useEffect(() => () => useCommand.getState().register(null), [])

  const ghost = cursor ? noteBox({ at: cursor, text: NEW_NOTE, size: undefined }, px) : null
  return (
    <g data-tool="note">
      <Capture
        camera={camera}
        onPointerDown={(e) => {
          if (e.button === 0) e.stopPropagation()
        }}
        onPointerUp={(e) => {
          if (e.button === 0) placeNote(at(e))
        }}
        onPointerMove={(e) => setCursor(at(e))}
        onPointerLeave={() => {
          setCursor(null)
          setMark(null)
        }}
      />
      {cursor && ghost && (
        <text data-note-ghost x={cursor.x} y={-cursor.y} fontSize={ghost.size} fill="var(--ink-secondary)" stroke="var(--panel)" strokeWidth={ghost.size / 3} paintOrder="stroke" pointerEvents="none">
          {noteLines(NEW_NOTE)[0]}
        </text>
      )}
      {cursor && <Crosshair q={cursor} px={px} />}
      {cursor && <SnapMark mark={mark} px={px} />}
    </g>
  )
}
