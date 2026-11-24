// shpjs ships no types: the one function GFit uses (io/site/geojson.ts readShapefile).
declare module 'shpjs' {
  /** A zipped Shapefile (or several) as GeoJSON, projected to WGS 84 from its .prj. */
  export function parseZip(buffer: ArrayBuffer | Uint8Array, whiteList?: string[]): Promise<unknown>
}
