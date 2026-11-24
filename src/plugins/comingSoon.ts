// The plugins held back for now (Decision "Coming soon"): the one list, with the notice each shows. It lives in a file
// of its own so that settings.ts can start from it without importing the registry (which imports every plugin);
// registry.ts re-exports it. Removing an entry brings that plugin back, with no other change.
export const COMING_SOON: Record<string, string> = {
  optimizer: 'Optimizer: in progress, available soon',
  agent: 'Agent: in progress, available soon',
}
