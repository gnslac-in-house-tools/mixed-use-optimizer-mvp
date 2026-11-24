// Recorrido de las rampas: Uso mixto, la barra de 48.6 × 16.2 con 30 m de alto y una calle existente al sur (cargada en
// el store por el servidor de Vite); planta del nivel de calle, el sótano y el 3D; después la calle al norte. Capturas en
// evidence/rampas/ (fuera de git). Requiere `npm run dev` en 5180.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire('C:/dev/mixed-use-optimizer/package.json')
const { chromium } = require('playwright')
const OUT = 'evidence/rampas'
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } })
const errores = []
page.on('pageerror', (e) => errores.push(String(e)))
page.on('console', (m) => { if (m.type() === 'error') errores.push(m.text()) })
const espera = (ms) => page.waitForTimeout(ms)
const foto = (n) => page.screenshot({ path: `${OUT}/${n}.png` })
await page.goto(process.env.URL ?? 'http://localhost:5180/', { waitUntil: 'networkidle' })
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
await espera(800)
await page.mouse.click(600, 800)
await page.keyboard.press('Escape'); await page.keyboard.press('Escape')

/** Pone una calle existente de x −20 a 70 en la cota y, con el mismo store que usa la app. */
const calle = (y) => page.evaluate(async (y) => {
  const { useApp } = await import('/src/state/store.ts')
  const { derive } = await import('/src/engine/derive.ts')
  const p0 = useApp.getState().project
  const p = { ...p0, site: { ...p0.site, existingRoads: [{ id: 'calle', points: [{ x: -20, y }, { x: 70, y }], stretches: [{ left: 5, right: 5 }] }] } }
  useApp.setState({ project: p, derived: derive(p) })
}, y)
const plano = () => page.evaluate(async () => {
  const { useApp } = await import('/src/state/store.ts')
  const { derivar } = await import('/src/modules/residential/engine/derivar.ts')
  const d = derivar(useApp.getState().project, useApp.getState().project.buildings[0].id)
  const rp = d?.estacionamiento.plano.rampa
  return { sotanos: d?.estacionamiento.sotanos, ys: rp?.huella.map((q) => Math.round(q[1] * 10) / 10), avisos: d?.avisos.filter((a) => /calle|rampa/i.test(a)) }
})

await calle(-12)
await espera(1500)
console.log('calle al sur:', JSON.stringify(await plano()))
const barra = page.getByRole('toolbar', { name: 'Pisos de uso mixto' })
await barra.getByRole('button', { name: '1', exact: true }).click()
await espera(1000)
console.log('rampa en planta de calle:', await page.locator('path[data-rampa-calle]').count(), (await page.locator('text[data-rampa-rotulo]').allInnerTexts()).join('|'))
await foto('01-planta-calle-sur')
await barra.getByRole('button', { name: /^S1/ }).click()
await espera(1000)
await foto('02-sotano')
await barra.getByRole('button', { name: 'Tipo' }).click()
await page.getByText('3D', { exact: true }).filter({ visible: true }).last().click()
await espera(2500)
await foto('03-3d')
await calle(28)
await espera(2500)
console.log('calle al norte:', JSON.stringify(await plano()))
await foto('04-3d-calle-norte')
console.log(JSON.stringify({ errores }, null, 2))
await browser.close()
