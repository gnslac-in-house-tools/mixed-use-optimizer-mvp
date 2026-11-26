// Recorrido del proyecto de referencia (spec 2026-11-26, fase 6): entrar sin dirección abre las barras del compañero
// en el Piso 4; luego cada piso en planta y una vista 3D. Capturas en evidence/referencia/.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/referencia'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', (e) => errores.push(String(e)))
const espera = (ms) => page.waitForTimeout(ms)
await page.goto(process.env.URL ?? 'http://localhost:5180/', { waitUntil: 'networkidle' })
await espera(2500)
console.log('dirección:', page.url())
await page.screenshot({ path: `${OUT}/01-entrada.png` })
const titulo = await page.locator('body').innerText()
console.log('muestra la referencia:', titulo.includes('Referencia'))
// v2: elegir un núcleo (acercando la vista) y arrastrar su elevador
const nuc = await page.locator('[data-nucleo-detalle]').first().boundingBox()
if (nuc) {
  await page.mouse.move(nuc.x + nuc.width / 2, nuc.y + nuc.height / 2)
  for (let i = 0; i < 5; i++) { await page.mouse.wheel(0, -300); await espera(150) }
  await espera(400)
  const n2 = await page.locator('[data-nucleo-detalle]').first().boundingBox()
  await page.mouse.click(n2.x + n2.width / 2, n2.y + n2.height / 2)
  await espera(600)
  await page.screenshot({ path: `${OUT}/02-nucleo-elegido.png` })
  const el = page.locator('[data-elemento-editable="elevador1"]').first()
  console.log('manijas de elementos:', await page.locator('[data-elemento-editable]').count())
  const b = await el.boundingBox()
  if (b) {
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2)
    await page.mouse.down()
    await page.mouse.move(b.x + b.width / 2 - 30, b.y + b.height / 2, { steps: 6 })
    await page.mouse.up()
    await espera(600)
    await page.screenshot({ path: `${OUT}/03-elevador-movido.png` })
    await page.getByRole('tab', { name: 'Propiedades' }).first().click().catch(() => page.getByText('Propiedades').first().click())
    await espera(500)
    await page.getByRole('region', { name: 'Núcleo' }).scrollIntoViewIfNeeded().catch(() => {})
    await page.screenshot({ path: `${OUT}/04-propiedades-nucleo.png` })
  }
}
console.log('errores:', errores.length ? errores.slice(0, 5) : 'ninguno')
await browser.close()
