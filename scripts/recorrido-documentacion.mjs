// La vista de documentación (estilo Finch) sobre la referencia: el piso 4 completo y de cerca. Capturas en evidence/referencia/.
import { createRequire } from 'node:module'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/referencia'
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('pageerror', (e) => errores.push(String(e)))
const espera = (ms) => page.waitForTimeout(ms)
await page.goto(process.env.URL ?? 'http://localhost:5180/', { waitUntil: 'networkidle' })
await espera(2000)
await page.getByRole('toolbar', { name: 'Interiors' }).getByText('Documentación').click()
await espera(1200)
console.log('láminas:', await page.locator('[data-documentacion]').count(), 'puertas:', await page.locator('[data-puerta-doc]').count())
await page.screenshot({ path: `${OUT}/30-documentacion.png` })
const n = await page.locator('[data-nucleo-detalle]').first().boundingBox()
await page.mouse.move(n.x - n.width * 2.5, n.y + n.height / 2)
for (let k = 0; k < Number(process.env.ZOOM ?? 4); k++) { await page.mouse.wheel(0, -300); await espera(120) }
await espera(1000)
await page.screenshot({ path: `${OUT}/31-documentacion-cerca.png` })
console.log('errores:', errores.length ? errores.slice(0, 5) : 'ninguno')
await browser.close()
