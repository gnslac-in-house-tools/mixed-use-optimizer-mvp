// The browser's file doors, shared by Load project (files.ts) and Export (exporting.ts): a download
// through a link, a picked file's text, and Chrome's and Edge's file pickers (the File System Access API), which give
// a handle (the app no longer writes a file again: Save keeps the project in this browser). Other browsers have no
// pickers: Export downloads, Load project uses an <input type=file>.

/** Downloads a Blob through a temporary link. */
export function download(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // freed later: some browsers still read the URL after the click
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function readText(f: File): Promise<string> {
  if (typeof f.text === 'function') return f.text()
  return new Promise((ok, fail) => {
    const r = new FileReader()
    r.onload = () => ok(String(r.result))
    r.onerror = () => fail(r.error)
    r.readAsText(f)
  })
}

/** A file on disk picked in this session. (What the app uses of FileSystemFileHandle.) */
export interface FileHandle {
  name: string
  getFile(): Promise<File>
  createWritable(): Promise<{ write(data: string): Promise<void>; close(): Promise<void> }>
}

/** What a .gft is, for the pickers. */
const GFT_TYPES = [{ description: 'GFit project', accept: { 'application/json': ['.gft'] } }]

interface Pickers {
  showSaveFilePicker?(o: { suggestedName: string; types: typeof GFT_TYPES }): Promise<FileHandle>
  showOpenFilePicker?(o: { types: typeof GFT_TYPES; multiple: false }): Promise<FileHandle[]>
}

const pickers = (): Pickers => (typeof window === 'undefined' ? {} : (window as unknown as Pickers))

/** Asks where to save a .gft; null where the browser has no picker. A cancel rejects with an AbortError. */
export function pickSaveFile(suggestedName: string): Promise<FileHandle> | null {
  const w = pickers()
  return w.showSaveFilePicker ? w.showSaveFilePicker({ suggestedName, types: GFT_TYPES }) : null
}

/** Asks for a .gft to open; null where the browser has no picker. A cancel rejects with an AbortError. */
export function pickOpenFile(): Promise<FileHandle> | null {
  const w = pickers()
  return w.showOpenFilePicker ? w.showOpenFilePicker({ types: GFT_TYPES, multiple: false }).then((hs) => hs[0]) : null
}

/** The picker was closed without a file. */
export const cancelled = (e: unknown) => e instanceof DOMException && e.name === 'AbortError'
