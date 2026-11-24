// Recorrido de la pieza 1 en el navegador (Playwright de C:\dev\mixed-use-optimizer\node_modules): Home → Create new →
// Uso mixto; una masa de Vivienda de 32.4 × 16.2 m y su núcleo con las cotas tecleadas de GIM; planta con unidades,
// columnas y KPIs; 3D. Capturas en evidence/pieza-1/ (fuera de git). Requiere `npm run dev` en 5180.
//   node scripts/recorrido.mjs
import { createRequire } from 'node:module'
import { mkdirSync, writeFileSync } from 'node:fs'

const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const URL = process.env.URL ?? 'http://localhost:5180/'
const OUT = 'evidence/pieza-1'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
// los recorridos buscan los textos en inglés (la app arranca en español: src/i18n)
await page.addInitScript(() => localStorage.setItem('gfit-idioma', 'en'))
const errores = []
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', (e) => errores.push(String(e)))
const foto = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
const espera = (ms) => page.waitForTimeout(ms)

await page.goto(URL, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'New project' }).click()
await page.getByRole('button', { name: 'Uso mixto' }).click()
await page.getByRole('button', { name: 'Create project' }).click()
await espera(1500)
await foto('01-proyecto-nuevo')

// el cursor arriba a la derecha del centro: el rectángulo tecleado va hacia ese cuadrante
// el centro del plano (la zona que la herramienta captura, una vez tomada)
let cx = 780, cy = 540
async function dibuja(punto, medida) {
  await page.mouse.move(cx, cy)
  await page.keyboard.press('b')
  await espera(300)
  const plan = await page.locator('[data-capture]').first().boundingBox()
  if (plan) { cx = plan.x + plan.width / 2; cy = plan.y + plan.height / 2 }
  await page.mouse.move(cx + 200, cy - 150)
  await page.keyboard.type(punto)
  await page.keyboard.press('Enter')
  await page.mouse.move(cx + 260, cy - 200)
  await page.keyboard.type(medida)
  await page.keyboard.press('Enter')
  await espera(800)
}
await dibuja('0,0', '32.4x16.2')
// la torre de 30 m: la masa queda elegida; su Height en Properties
await page.getByText('Properties', { exact: true }).first().click()
await espera(500)
const alto = page.getByLabel(/^Height/).first()
console.log('campo Height:', await alto.count())
await alto.fill('30')
await alto.press('Enter')
await espera(1500)
await page.getByText('Layers', { exact: true }).first().click()
// el programa del siguiente trazo: Núcleo
await page.keyboard.press('Escape')
const opciones = page.getByRole('button', { name: 'Massing options' })
if (await opciones.count()) {
  await opciones.first().click()
  await page.getByRole('combobox').filter({ hasText: 'Núcleo' }).first().selectOption({ label: 'Núcleo' }).catch(() => {})
  await page.keyboard.press('Escape')
}
await dibuja('12.15,5.4', '8.1x5.4')
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')
await espera(1500)
// encuadra
await espera(800)
await foto('02-planta-unidades-columnas')

const estado = await page.evaluate(() => ({
  unidades: document.querySelectorAll('[data-capa="residencial"] path[data-tipo]').length,
  columnas: document.querySelectorAll('[data-capa="residencial"] rect[data-columna]').length,
  kpis: document.body.innerText.match(/(Área construida|Área vendible|Departamentos|Cajones requeridos|Margen)[^\n]*\n?[^\n]*/g)?.slice(0, 10) ?? [],
}))

await page.getByText('3D', { exact: true }).filter({ visible: true }).last().click()
await espera(3000)
await foto('03-3d')

writeFileSync(`${OUT}/recorrido.json`, JSON.stringify({ ...estado, errores }, null, 2))
console.log(JSON.stringify({ ...estado, errores }, null, 2))
await browser.close()
