// The two fs calls the gallery script uses (no @types/node in this project).
declare module 'fs' {
  export function writeFileSync(path: string, data: string): void
  export function readFileSync(path: string, encoding: 'utf8'): string
}
