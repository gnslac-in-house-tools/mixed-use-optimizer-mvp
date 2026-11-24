// Recorrido del editor de departamentos (pieza 3): Uso mixto → pestaña Departamentos → ✎ en un plano de la Biblioteca
// GFit → mover un muro tecleando su cota, fijar otra, poner una puerta y una ventana, grafo. Capturas en evidence/demo/.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/demo'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
page.on('pageerror', (e) => errores.push(String(e)))
const espera = (ms) => page.waitForTimeout(ms)
await page.goto(process.env.URL ?? 'http://localhost:5180/', { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'New project' }).click()
await page.getByRole('button', { name: 'Uso mixto' }).click()
await page.getByRole('button', { name: 'Create project' }).click()
await espera(1200)
await page.getByRole('tab', { name: 'Departamentos' }).first().click()
await espera(800)
await page.screenshot({ path: `${OUT}/10-catalogo.png` })
await page.getByRole('button', { name: /^Copiar y editar 2 rec\./ }).first().click()
await espera(2500)
await page.screenshot({ path: `${OUT}/11-editor.png` })
const c1 = page.getByRole('textbox', { name: 'Cota Frente 1' })
console.log('cota 1:', await c1.inputValue().catch(() => 'NO'))
await page.getByRole('button', { name: 'Fijar Frente 2' }).click().catch((e) => console.log('fijar', String(e).slice(0, 80)))
const v = Number(await c1.inputValue()) + 0.6
await c1.fill(v.toFixed(2)); await c1.press('Enter')
await espera(800)
// una puerta en el primer muro interior y una ventana en la fachada
const muro = page.locator('[data-muro^="x"]').first()
const caja = await muro.boundingBox()
await page.getByRole('button', { name: 'Puerta', exact: true }).click()
if (caja) await page.mouse.click(caja.x + caja.width / 2, caja.y + caja.height * 0.4)
await page.getByRole('button', { name: 'Ventana', exact: true }).click()
const svg = await page.getByRole('img', { name: /^Planta editable/ }).boundingBox()
if (svg) await page.mouse.click(svg.x + svg.width * 0.35, svg.y + svg.height * 0.78)
await page.getByRole('checkbox', { name: 'Grafo' }).check()
await espera(1500)
await page.screenshot({ path: `${OUT}/12-editor-editado.png` })
console.log(JSON.stringify({ puertas: await page.locator('[data-puerta]').count(), ventanas: await page.locator('[data-ventana]').count(), errores }, null, 2))
await browser.close()
