// El proyecto de referencia en 3D (v3): el núcleo con sus cubos de elevador y sus escaleras. Capturas en evidence/referencia/.
import { createRequire } from 'node:module'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/referencia'
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('pageerror', (e) => errores.push(String(e)))
const espera = (ms) => page.waitForTimeout(ms)
await page.goto(process.env.URL ?? 'http://localhost:5180/', { waitUntil: 'networkidle' })
await espera(2000)
await page.getByText('3D', { exact: true }).filter({ visible: true }).last().click()
await espera(2500)
await page.screenshot({ path: `${OUT}/10-3d.png` })
const piso = process.env.PISO ?? '5'
const barra = page.getByRole('toolbar', { name: 'Pisos de uso mixto' })
console.log('barra:', (await barra.innerText()).split(/\s+/).join(' '))
await barra.getByRole('button', { name: piso, exact: true }).click()
await espera(2500)
await page.screenshot({ path: `${OUT}/11-3d-piso.png` })
// acercarse al centro (donde están los núcleos)
await page.mouse.move(Number(process.env.MX ?? 800), Number(process.env.MY ?? 520))
for (let k = 0; k < Number(process.env.ZOOM ?? 6); k++) { await page.mouse.wheel(0, -300); await espera(150) }
await espera(1500)
await page.screenshot({ path: `${OUT}/12-3d-nucleo.png` })
if (process.env.MX2) {
  await page.mouse.move(Number(process.env.MX2), Number(process.env.MY2))
  for (let k = 0; k < Number(process.env.ZOOM2 ?? 6); k++) { await page.mouse.wheel(0, -300); await espera(150) }
  await espera(1500)
  await page.screenshot({ path: `${OUT}/13-3d-nucleo-cerca.png` })
}
console.log('errores:', errores.length ? errores.slice(0, 5) : 'ninguno')
await browser.close()
