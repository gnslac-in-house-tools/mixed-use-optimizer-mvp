// Recorrido de la manija de altura en 3D: la barra de 48.6 × 16.2 a 30 m, elegida, en 3D; se busca la flecha naranja,
// se jala hacia arriba y se suelta: la masa gana pisos. Capturas en evidence/demo/.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/demo'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('pageerror', (e) => errores.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
const espera = (ms) => page.waitForTimeout(ms)
await page.goto('http://localhost:5180/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'New project' }).click()
await page.getByRole('button', { name: 'Uso mixto' }).click()
await page.getByRole('button', { name: 'Create project' }).click()
await espera(1200)
await page.mouse.move(780, 540)
await page.keyboard.press('b')
await espera(300)
await page.mouse.move(980, 390)
await page.keyboard.type('0,0'); await page.keyboard.press('Enter')
await page.mouse.move(1040, 340)
await page.keyboard.type('48.6x16.2'); await page.keyboard.press('Enter')
await espera(800)
await page.getByText('Properties', { exact: true }).first().click()
const alto = page.getByLabel(/^Height/).first()
await alto.fill('30'); await alto.press('Enter')
await espera(1000)
await page.getByText('3D', { exact: true }).filter({ visible: true }).last().click()
await espera(3000)
await page.screenshot({ path: `${OUT}/30-altura-antes.png` })
const b64 = (await page.screenshot()).toString('base64')
const hit = await page.evaluate(async (src) => {
  const im = new Image(); im.src = 'data:image/png;base64,' + src; await im.decode()
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height
  const g = c.getContext('2d'); g.drawImage(im, 0, 0)
  const d = g.getImageData(0, 0, c.width, c.height).data
  for (let y = 150; y < 900; y += 2) for (let x = 320; x < 1250; x += 2) {
    const i = (y * c.width + x) * 4
    if (d[i] > 210 && d[i + 1] > 110 && d[i + 1] < 170 && d[i + 2] < 80) return { x, y }
  }
  return null
}, b64)
console.log('flecha en:', hit)
if (hit) {
  await page.mouse.move(hit.x, hit.y + 14)
  await page.mouse.down()
  await page.mouse.move(hit.x, hit.y - 70, { steps: 10 })
  console.log('al arrastrar:', await page.locator('[data-height-handle]').innerText().catch(() => 'sin letrero'))
  await page.screenshot({ path: `${OUT}/31-altura-arrastre.png` })
  await page.mouse.up()
}
await espera(2000)
await page.screenshot({ path: `${OUT}/32-altura-despues.png` })
console.log('Height en Properties:', await page.getByLabel(/^Height/).first().inputValue().catch(() => ''))
console.log(JSON.stringify({ errores }, null, 2))
await browser.close()
