// Recorrido de la calificación por palancas en el navegador (Playwright de C:\dev\mixed-use-optimizer\node_modules, como
// scripts/recorrido.mjs): Home → Create new → Uso mixto; una masa de Vivienda; el juego «Calificación» en la barra con un
// número; la pestaña Calificación y la tarjeta de «Uso del índice de edificabilidad» al pasar el cursor; Design → Reglas de
// calificación…, el umbral +1 a 0.80 y Aplicar; el KPI cambia y Ctrl+Z lo regresa. Además: Escape con el foco en un campo
// de la ventana (un umbral, la fórmula) — ¿se cierra sin tocar el proyecto? Capturas en docs/superpowers/capturas/
// calificacion-*.png. Falla (código 1) si un paso no pasa o si hay errores en la consola.
//   npx vite --port 5183 --strictPort --host 127.0.0.1   (otra terminal)
//   URL=http://127.0.0.1:5183/ node scripts/recorrido-calificacion.mjs
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'

const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const URL = process.env.URL ?? 'http://127.0.0.1:5183/'
const OUT = 'docs/superpowers/capturas'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', (e) => errores.push(String(e)))
const foto = (n) => page.screenshot({ path: `${OUT}/calificacion-${n}.png` })
const espera = (ms) => page.waitForTimeout(ms)

const pasos = []
const observaciones = []
async function paso(nombre, fn) {
  try {
    const nota = await fn()
    pasos.push({ paso: nombre, ok: true, ...(nota ? { nota } : {}) })
    console.log(`PASA  ${nombre}${nota ? ' — ' + JSON.stringify(nota) : ''}`)
  } catch (e) {
    pasos.push({ paso: nombre, ok: false, error: String(e?.message ?? e).split('\n')[0] })
    console.log(`FALLA ${nombre} — ${String(e?.message ?? e).split('\n')[0]}`)
    await foto(`falla-${pasos.length}`).catch(() => {})
  }
}
const afirma = (cond, msg) => { if (!cond) throw new Error(msg) }

const barra = () => page.getByRole('region', { name: 'Project figures' })
const puntajeBarra = () => barra().getByRole('group', { name: 'Calificación', exact: true })
const textoBarra = async () => (await barra().innerText()).replace(/\s+/g, ' ')
const ventana = () => page.getByRole('dialog', { name: 'Reglas de calificación' })
const editor = () => ventana().getByRole('region', { name: 'Variable elegida' })
const lista = () => ventana().getByRole('region', { name: 'Palancas y variables' })
async function abreReglas() {
  await page.getByRole('menubar').getByRole('menuitem', { name: 'Design' }).click()
  await page.locator('[data-menu-key]').filter({ hasText: 'Reglas de calificación…' }).first().click()
  await ventana().waitFor({ state: 'visible', timeout: 3000 })
}
async function eligeUsoIndice() {
  await lista().getByRole('button', { name: /^Uso del índice de edificabilidad/ }).click()
  await editor().getByRole('textbox', { name: '+1 desde' }).waitFor()
}

/** Site → Draw boundary: un rectángulo de 34.4 × `fondo` m con esquina en (−1, −1) (la masa adentro), sus esquinas
 *  tecleadas en la línea de comandos. Un predio nuevo reemplaza al anterior (actions.setBoundary). */
async function predio(fondo) {
  await page.getByRole('menubar').getByRole('menuitem', { name: 'Site' }).click()
  await page.locator('[data-menu-key]').filter({ hasText: /^Draw boundary/ }).first().click()
  await espera(300)
  const x1 = 33.4, y1 = (-1 + fondo).toFixed(2)
  for (const q of ['-1,-1', `${x1},-1`, `${x1},${y1}`, `-1,${y1}`]) {
    await page.keyboard.type(q)
    await page.keyboard.press('Enter')
    await espera(150)
  }
  await page.keyboard.press('Enter')
  await espera(600)
  await page.keyboard.press('Escape')
  await espera(600)
}
/** El valor de «Uso del índice de edificabilidad» en la pestaña Calificación (su aria-label), o null sin dato. */
async function usoIndice() {
  const tab = page.getByRole('tablist', { name: 'Summary' }).getByRole('tab', { name: 'Calificación' })
  await tab.click()
  const panel = page.getByRole('tabpanel', { name: 'Calificación' })
  const pal = panel.getByRole('button', { name: /^m² vendibles:/ })
  if ((await pal.getAttribute('aria-expanded')) !== 'true') await pal.click()
  const l = (await panel.getByRole('group', { name: /^Uso del índice de edificabilidad/ }).getAttribute('aria-label')) ?? ''
  const m = l.match(/:\s*(\d+(?:\.\d+)?)\s*(%?)/)
  console.log('      uso del índice:', l)
  if (!m) return null
  const n = Number(m[1])
  return m[2] ? n / 100 : n
}

let antes = '', despues = '', antesTab = ''

await paso('1. crear «Uso mixto», dibujar una masa de Vivienda y su predio', async () => {
  await page.goto(URL, { waitUntil: 'networkidle' })
  await page.evaluate(() => localStorage.removeItem('muo.kpiJuego'))
  await page.getByRole('button', { name: 'New project' }).click()
  await page.getByRole('button', { name: 'Uso mixto' }).click()
  await page.getByRole('button', { name: 'Create project' }).click()
  await espera(1500)
  // el centro de la planta: el svg más grande en pantalla ([data-capture] solo existe con una herramienta puesta)
  const { cx, cy } = await page.evaluate(() => {
    const r = [...document.querySelectorAll('svg')].map((s) => s.getBoundingClientRect()).sort((a, b) => b.width * b.height - a.width * a.height)[0]
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 }
  })
  await page.mouse.move(cx, cy)
  await page.keyboard.press('b')
  await espera(200)
  await page.mouse.move(cx + 200, cy - 150)
  await page.keyboard.type('0,0')
  await page.keyboard.press('Enter')
  await page.mouse.move(cx + 260, cy - 200)
  await page.keyboard.type('32.4x16.2')
  await page.keyboard.press('Enter')
  await espera(800)
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')
  await espera(1000)
  // la altura: con la de inicio el uso del índice (permitido 9) no pasa de ~0.1 en un predio que contenga la masa
  await page.keyboard.press('Control+a')
  await espera(300)
  await page.getByRole('tab', { name: 'Properties' }).click()
  const altura = page.getByRole('textbox', { name: 'Height' }).first()
  await altura.fill('60')
  await altura.press('Enter')
  await espera(800)
  await page.keyboard.press('Escape')
  await page.getByRole('tab', { name: 'Layers' }).click().catch(() => {})
  // el predio: sin él «Uso del índice» no tiene dato (indice_usado = m² brutos / área del predio) y su umbral no mueve
  // nada. Un fondo de prueba; luego se ajusta (el uso va con 1 / área) para que caiga entre 0.80 y 0.85: el umbral +1
  // que se baja a 0.80 en el paso 4 cambia entonces la calificación de la variable de 0 a +1.
  let fondo = 40, v = null
  for (let i = 0; i < 4; i++) {
    await predio(fondo)
    v = await usoIndice()
    afirma(v != null, 'con predio, «Uso del índice» sigue sin dato')
    if (v >= 0.81 && v <= 0.84) break
    fondo = Math.max(18.2, fondo * v / 0.825)
  }
  afirma(v >= 0.8 && v < 0.85, `el uso del índice no quedó entre 0.80 y 0.85: ${v}`)
  const unidades = await page.locator('[data-capa="residencial"] path[data-tipo]').count()
  await foto('01-masa-vivienda')
  afirma(unidades > 0, `sin unidades de vivienda en la planta (${unidades})`)
  return { unidades }
})

await paso('2. el juego «Calificación» en la barra, con un número', async () => {
  const grupo = barra().getByRole('group', { name: 'KPIs' })
  const pressed = await grupo.getByRole('button', { name: 'Calificación' }).getAttribute('aria-pressed')
  afirma(pressed === 'true', `«Calificación» no está presionado (${pressed})`)
  const t = (await puntajeBarra().innerText()).replace(/\s+/g, ' ')
  afirma(/[+−-]?\d/.test(t) && !/—/.test(t.split(' ')[0]), `el puntaje no tiene número: «${t}»`)
  const todo = await textoBarra()
  afirma(!/NaN|Infinity/.test(todo), 'la barra dice NaN/Infinity')
  antes = todo
  await foto('02-barra-calificacion')
  return { puntaje: t }
})

await paso('3. la pestaña Calificación; el cursor sobre «Uso del índice» saca la tarjeta', async () => {
  await page.getByRole('tablist', { name: 'Summary' }).getByRole('tab', { name: 'Calificación' }).click()
  const panel = page.getByRole('tabpanel', { name: 'Calificación' })
  await panel.waitFor()
  const pal = panel.getByRole('button', { name: /^m² vendibles:/ })
  if ((await pal.getAttribute('aria-expanded')) !== 'true') await pal.click()
  const v = panel.getByRole('group', { name: /^Uso del índice de edificabilidad/ })
  await v.hover()
  const tip = page.getByRole('tooltip')
  await tip.waitFor({ state: 'visible', timeout: 3000 })
  const txt = (await tip.innerText()).replace(/\s+/g, ' ')
  afirma(/Fórmula/.test(txt) && /indice_usado/.test(txt), `la tarjeta no trae la fórmula: «${txt.slice(0, 120)}»`)
  antesTab = (await v.getAttribute('aria-label')) ?? ''
  await foto('03-pestana-tarjeta')
  await page.mouse.move(5, 500)
  return { variable: antesTab }
})

await paso('4. Design → Reglas de calificación…, umbral +1 a 0.80 y Aplicar', async () => {
  await abreReglas()
  await eligeUsoIndice()
  const campo = editor().getByRole('textbox', { name: '+1 desde' })
  await campo.fill('0.80')
  await campo.blur()
  await foto('04-ventana-reglas')
  const aplicar = ventana().getByRole('button', { name: 'Aplicar' })
  afirma(await aplicar.isEnabled(), 'Aplicar está desactivado')
  await aplicar.click()
  await ventana().waitFor({ state: 'detached', timeout: 3000 })
})

await paso('5. el KPI cambia', async () => {
  await espera(500)
  despues = await textoBarra()
  const panel = page.getByRole('tabpanel', { name: 'Calificación' })
  const ahoraTab = (await panel.getByRole('group', { name: /^Uso del índice de edificabilidad/ }).getAttribute('aria-label')) ?? ''
  await foto('05-kpi-cambia')
  afirma(despues !== antes, `la barra no cambió: «${antes}»`)
  afirma(/, 0$/.test(antesTab) && /, \+1$/.test(ahoraTab), `la variable no pasó de 0 a +1: «${antesTab}» → «${ahoraTab}»`)
  return { barraAntes: antes, barraDespues: despues, variableAntes: antesTab, variableDespues: ahoraTab }
})

await paso('6. Ctrl+Z lo regresa', async () => {
  await page.mouse.move(800, 500)
  await page.keyboard.press('Control+z')
  await espera(600)
  const t = await textoBarra()
  await foto('06-deshacer')
  afirma(t === antes, `tras Ctrl+Z la barra no volvió: «${t}» ≠ «${antes}»`)
})

// Lo que pidió la revisión: Escape con el foco dentro de un campo de la ventana. Se registra lo que pasa (no se cambia
// la app): ¿se cierra la ventana?, ¿el proyecto queda igual? Un cambio tecleado en el campo, sin Aplicar, no debe llegar.
for (const [n, nombre, valor] of [['07', '+1 desde', '0.70'], ['08', 'Fórmula', 'indice_usado / indice_permitido * 2']]) {
  await paso(`${n === '07' ? '7' : '8'}. Escape con el foco en «${nombre}»`, async () => {
    const base = await textoBarra()
    await abreReglas()
    await eligeUsoIndice()
    const campo = editor().getByRole('textbox', { name: nombre })
    await campo.click()
    await campo.fill(valor)
    const enfocado = await page.evaluate(() => `${document.activeElement?.tagName}[${document.activeElement?.getAttribute('aria-label')}]`)
    await page.keyboard.press('Escape')
    await espera(400)
    const abierta1 = await ventana().isVisible()
    await foto(`${n}-escape-en-campo`)
    const valorTrasEscape = abierta1 ? await campo.inputValue() : null
    let cierraFueraDelCampo = !abierta1
    if (abierta1) {
      // GIM (useShortcuts.ts escapeKey) deja el Escape a un campo en que se teclea; fuera del campo la ventana se cierra
      await ventana().focus()
      await page.keyboard.press('Escape')
      await espera(400)
      cierraFueraDelCampo = !(await ventana().isVisible())
    }
    const t = await textoBarra()
    const obs = { campo: nombre, foco: enfocado, cierraConEscapeEnElCampo: !abierta1, valorTrasEscape, cierraConEscapeFueraDelCampo: cierraFueraDelCampo, proyectoIgual: t === base }
    observaciones.push(obs)
    if (await ventana().isVisible()) { await ventana().getByRole('button', { name: 'Cancelar' }).click(); await espera(300) }
    afirma(cierraFueraDelCampo, 'la ventana no se cierra con Escape ni fuera del campo')
    afirma(t === base, `el proyecto cambió: «${t}» ≠ «${base}»`)
    return obs
  })
}

const ok = pasos.every((p) => p.ok) && errores.length === 0
console.log(JSON.stringify({ ok, pasos, observaciones, errores }, null, 2))
await browser.close()
process.exit(ok ? 0 : 1)
