# Mixed-use optimizer · MVP

Una herramienta de uso mixto y residencial que parte de **GFit GIM** para integrarse después a él. Se reutiliza GIM
(marco, modelado, retícula, niveles, 3D), el motor de GFit y, más adelante, el estacionamiento de Plaza Praktico. Lo
que viene de GIM se queda en inglés; lo nuevo se escribe en español.

## Piezas

| # | Pieza | Estado |
|---|---|---|
| 1 | GIM como base, con la tipología «Uso mixto»: masa, retícula de 8.1 m en módulos de 2.7 m, niveles, plantas tipo y departamentos con los muros sobre la retícula, columnas y KPIs | En curso |
| 2 | Sótanos de estacionamiento con el motor de cajones de Praktico, regidos por la misma retícula | Pendiente |
| 3 | Blocks habitacionales: catálogo de departamentos con editor (recintos, puertas, ventanas, pasillos y cotas fijas o movibles) | Pendiente |
| 4 | El reconfigurador de plantas, que estira los blocks respetando lo fijo | Pendiente |

## Correr

```powershell
npm install
npm run dev        # http://localhost:5180
```

## Verificar

```powershell
npm run typecheck
npm test
```

## Estructura

| Carpeta | Qué hay |
|---|---|
| `src/` | GIM (`b7909184`). Ver `VENDOR.md` para lo copiado y cada cambio a su núcleo |
| `src/modules/residential/` | El módulo nuevo de uso mixto |
| `src/modules/residential/engine/gfit/` | El motor de GFit, copiado completo con sus tests |
| `src/modules/residential/engine/catalogo.ts` | El catálogo de unidades de la pieza anterior (para la pieza 3) |
| `src/modules/residential/views/` | `Unidad3d`, `muebles3d`, `geometria3d` y `PlanMini` de la pieza anterior (para la pieza 3) |
