// From zero, chapter 1 — A new project: Home's Create new, a project, Industrial, no terrain; the project it makes is
// "My first project" (zero/run.ts).
import { useApp } from '../../../state/store.ts'
import { openCreateNew, useCreateNew } from '../../home/CreateNew.tsx'
import { showHome, useScreen } from '../../home/screen.ts'
import type { TourStep } from '../tour.ts'
import { adoptAsTutorial, createTutorialProject, isTutorialProject } from './run.ts'

const CHAPTER = 'A new project'

/** A new Industrial project with no site is open: the tutorial's, or the one Create project just made. */
const made = () => {
  const { project } = useApp.getState()
  return !useScreen.getState().home && project.site.boundary === null && (isTutorialProject() || project.name === 'New industrial project')
}
const dialog = () => useCreateNew.getState()
/** Create new open on a project, unless the project is made already. */
const openOnProject = () => {
  if (made()) return
  if (!dialog().open) openCreateNew()
}

export const PROJECT_STEPS: TourStep[] = [
  {
    id: 'zero-welcome',
    chapter: CHAPTER,
    title: 'Build a project from zero',
    body: [
      'In eight short chapters you will make a warehouse project from an empty one to a CAD plan: the site, a block, the streets, the earthwork and the export.',
      'Each card says what to click and points at it. Do it yourself, or press Do it for me.',
    ],
    before: () => {
      if (!made()) showHome()
    },
  },
  {
    id: 'zero-create',
    chapter: CHAPTER,
    title: 'Create new',
    body: ['Click Create new.'],
    why: 'Everything starts here: a project (a site and its buildings) or a block (a building designed once and placed as copies).',
    anchor: 'create-new',
    before: () => {
      if (!made()) showHome()
    },
    act: () => openCreateNew(),
    done: () => dialog().open || made(),
  },
  {
    id: 'zero-kind',
    chapter: CHAPTER,
    title: 'A project',
    body: ['Choose Project.'],
    anchor: 'create-project',
    before: openOnProject,
    act: () => useCreateNew.setState({ kind: 'project' }),
    done: () => dialog().kind === 'project' || made(),
  },
  {
    id: 'zero-type',
    chapter: CHAPTER,
    title: 'Industrial',
    body: ['Choose Industrial.'],
    why: 'A project type brings its programs (warehouse, offices, yards…), their rules and the blocks it offers.',
    anchor: 'create-industrial',
    before: () => {
      openOnProject()
      if (dialog().open && dialog().kind !== 'project') useCreateNew.setState({ kind: 'project' })
    },
    act: () => useCreateNew.setState({ type: 'industrial' }),
    done: () => dialog().type === 'industrial' || made(),
  },
  {
    id: 'zero-terrain',
    chapter: CHAPTER,
    title: 'No terrain',
    body: ['Keep No terrain: you will import the site from a drawing in the next chapter.'],
    anchor: 'create-no-terrain',
    before: openOnProject,
    act: () => useCreateNew.setState({ terrain: null }),
    done: () => dialog().terrain === null || made(),
  },
  {
    id: 'zero-start',
    chapter: CHAPTER,
    title: 'Create project',
    body: ['Click Create project.'],
    anchor: 'create-start',
    before: openOnProject,
    act: () => {
      useCreateNew.setState({ open: false })
      createTutorialProject()
    },
    done: made,
  },
  {
    id: 'zero-made',
    chapter: CHAPTER,
    title: 'My first project',
    body: ['Your project is open on the Layers tab: no site yet. It is kept in this browser as My first project.'],
    why: 'Layers holds what the project has, and Properties the settings of what you pick there (the site, the levels, the circulation); any of them can be opened at any time, and the tools are in the Tools strip.',
    before: adoptAsTutorial,
  },
]
