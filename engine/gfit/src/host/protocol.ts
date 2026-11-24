// Shim (no es de GFit): solo los tipos de geometría que `model/geom.ts` toma del protocolo del host de GFit.
// El protocolo completo arrastra el paquete de publicación; aquí no se necesita.
export type Pt = [number, number]
export type Ring = Pt[]
