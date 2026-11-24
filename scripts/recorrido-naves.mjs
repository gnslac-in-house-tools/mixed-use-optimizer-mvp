// Recorrido de las naves: el ejemplo Industrial park; Programs y Furniture en planta y en 3D. Capturas en evidence/naves/ (fuera de git).
// Requiere `npm run dev` (URL=… para otro puerto).
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/naves'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
// los recorridos buscan los textos en inglés (la app arranca en español: src/i18n)
await page.addInitScript(() => localStorage.setItem('gfit-idioma', 'en'))
const errores = []
page.on('pageerror', (e) => errores.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
const espera = (ms) => page.waitForTimeout(ms)
await page.goto(process.env.URL ?? 'http://localhost:5180/', { waitUntil: 'networkidle' })
// el ejemplo «Industrial park»: sus naves ya traen andenes
await page.getByRole('button', { name: 'Open' }).last().click()
await espera(2500)
const saltar = page.getByRole('button', { name: 'Skip' })
if (await saltar.count()) await saltar.click()
await espera(500)
await espera(800)
console.log('naves:', await page.locator('[data-nave]').count(), 'racks:', await page.locator('path[data-racks]').getAttribute('data-racks').catch(() => null))
await page.screenshot({ path: `${OUT}/01-planta.png` })
await page.getByText('3D', { exact: true }).filter({ visible: true }).last().click()
await espera(2500)
await page.screenshot({ path: `${OUT}/02-3d.png` })
console.log(JSON.stringify({ errores }, null, 2))
await browser.close()
