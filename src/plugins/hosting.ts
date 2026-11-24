// Where the app is served from (Decision "Public link"). GitHub Pages serves files and nothing else, so what GFit's own
// server brings (the shared keys, their usage) is not there and is not offered (Decision "Only what
// works is shown"). The build for the public link sets VITE_STATIC_HOST=true; dev, preview and `dev:lan` do not.
export const STATIC_HOST = import.meta.env.VITE_STATIC_HOST === 'true'
