// Recorrido de los Blocks residenciales (spec 2026-11-26): Uso mixto → Departamentos → Agregar tipologías de
// referencia → Colocar 105, 85 y 150 → la planta con sus interiores → la de 150 en el editor. Capturas en evidence/blocks/.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/blocks'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
await page.addInitScript(() => localStorage.setItem('gfit-idioma', 'en'))
const errores = []
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', (e) => errores.push(String(e)))
const espera = (ms) => page.waitForTimeout(ms)
await page.goto(process.env.URL ?? 'http://localhost:5180/#/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'New project' }).click()
await page.getByRole('button', { name: 'Uso mixto' }).click()
await page.getByRole('button', { name: 'Create project' }).click()
await espera(1200)
await page.getByRole('button', { name: 'Skip' }).click().catch(() => {})
await page.getByRole('tab', { name: 'Departamentos' }).first().click()
await espera(600)
await page.getByRole('button', { name: 'Agregar tipologías de referencia' }).click()
await espera(600)
for (const n of ['Tipología 105 m²', 'Tipología 85 m²', 'Tipología 150 m² esquina']) {
  await page.getByRole('button', { name: `Colocar ${n}` }).click()
  await espera(700)
}
await page.keyboard.press('Escape')
await page.keyboard.press('Escape')
await espera(1500)
await page.screenshot({ path: `${OUT}/01-colocados.png` })
// el de 105: elegirlo en la planta, ver sus manijas de muros y mover uno
// acercar la vista a los departamentos (rueda) y elegir el primero por su masa
const svgPlan = await page.locator('[data-mass]').first().boundingBox()
if (svgPlan) {
  await page.mouse.move(svgPlan.x + svgPlan.width, svgPlan.y + svgPlan.height / 2)
  for (let i = 0; i < 2; i++) { await page.mouse.wheel(0, -200); await espera(150) }
}
await espera(600)
const caja = await page.locator('[data-mass]').first().boundingBox()
if (caja) await page.mouse.click(caja.x + caja.width * 0.15, caja.y + caja.height * 0.3)
await espera(800)
await page.screenshot({ path: `${OUT}/02-elegido.png` })
const muro = page.locator('[data-muro-depto^="x:"]').first()
const mb = await muro.boundingBox({ timeout: 3000 }).catch(() => null)
if (mb) {
  await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2)
  await page.mouse.down()
  await page.mouse.move(mb.x + mb.width / 2 + 25, mb.y + mb.height / 2, { steps: 5 })
  await page.mouse.up()
}
await espera(800)
await page.screenshot({ path: `${OUT}/03-muro-movido.png` })
console.log(JSON.stringify({ manijas: await page.locator('[data-muro-depto]').count(), recintos: await page.locator('[data-recinto-unidad]').count(), interiores: await page.locator('[data-interior="depto"]').count(), errores }, null, 2))
await browser.close()
