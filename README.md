# Mixed-use optimizer · MVP

Se arma pieza por pieza con partes de `C:\dev\mixed-use-optimizer` y de Plaza Praktico.

## Pieza 1 · Catálogo de unidades

- **Biblioteca GFit**: los cuatro tipos (estudio, 1, 2 y 3 rec.) en ancho compacto, estándar y amplio, al fondo de 8.1 m.
  El WFC de cuartos de GFit acomoda los recintos y las reglas los amueblan.
- **Mi biblioteca**: crear un plano (con el motor o vacío), copiar uno de GFit, renombrarlo o borrarlo. Se guarda en el navegador.
- **Visor 3D**: usa el motor de Praktico (luces, suelo, órbita, encuadre 3/4, `extruir`). Cada recinto lleva su losa de color,
  sus muros, la fachada en vidrio y los muebles como bloques. En la barra de dibujo, el detalle elige entre Esquema (corte
  a 1.2 m, sin muebles), Presentación (corte a 1.2 m, con muebles) y Muros completos.

## Pieza 2 · El marco de GIM

Es la misma interfaz de GFit GIM:

- **Arriba:** la barra superior, con el logo, los menús Archivo · Editar · Ver · Sitio · Diseño · Herramientas · Ayuda, Deshacer y Rehacer, el proyecto y la opción. Debajo va la barra de KPIs del plano elegido.
- **Al centro:** el viewport (Planta · 3D · Dividida), con la barra de herramientas arriba y la barra de dibujo abajo.
- **Panel izquierdo:** las pestañas Capas · **Catálogo** · Propiedades, y Optimizar y Agente como «próximamente». Las plantas del catálogo viven aquí.
- **Panel derecho:** Resumen, con su riel (Resumen · Contra el programa · Avisos).

Ver › Paneles y Ver › Barras muestran u ocultan cada pieza. La orilla interior de cada panel se arrastra para cambiar su ancho. Los botones que todavía no aplican se ven atenuados: falta decidir cuáles se quedan.

## Correr

```powershell
npm install
npm run dev        # http://localhost:5180
```

## Verificar

```powershell
npm run typecheck
npm test           # 16 tests: 11 del WFC de cuartos de GFit y 5 del catálogo
```

## Estructura

| Carpeta | Qué hay |
|---|---|
| `engine/gfit/` | El código copiado de GFit: geometría, programa y WFC de cuartos. Ver `VENDOR.md` |
| `engine/catalogo.ts` | Recintos, muebles, planos, Biblioteca GFit y coincidencia |
| `ui/tresd/` | El motor 3D de Praktico y `Unidad3d.tsx` |
| `ui/marco/` | El marco de GIM: barra superior, KPIs, paneles, barras y viewport |
| `ui/styles/` | Los tokens y estilos de GIM (Tailwind) |
| `ui/` | El catálogo, los planos SVG y el estado (zustand) |
