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
console.log('errores:', errores.length ? errores.slice(0, 5) : 'ninguno')
await browser.close()
