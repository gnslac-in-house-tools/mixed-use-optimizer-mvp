// Editar un departamento de la referencia en 3D (v4): elegirlo en planta (una 105 del Piso 4), pasar al 3D con su piso
// elegido, y arrastrar uno de sus muros. Capturas en evidence/referencia/.
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
// la masa de un departamento en la planta: la de más a la izquierda de la barra de abajo
const caja = await page.evaluate(() => {
  const ms = [...document.querySelectorAll('path[data-mass]')].map((e) => ({ id: e.getAttribute('data-mass'), b: e.getBoundingClientRect() }))
  // la que queda a la izquierda del primer núcleo, a su altura
  const n = document.querySelector('[data-nucleo-detalle]').getBoundingClientRect()
  const px = n.left - n.width * 0.8, py = n.top + n.height / 2
  const m = ms.find((m) => m.b.left < px && m.b.right > px && m.b.top < py && m.b.bottom > py)
  return m ? { id: m.id, x: px, y: py } : null
})
console.log('departamento:', caja?.id)
await page.mouse.click(caja.x, caja.y)
await espera(600)
await page.getByText('3D', { exact: true }).filter({ visible: true }).last().click()
await espera(2000)
await page.getByRole('toolbar', { name: 'Pisos de uso mixto' }).getByRole('button', { name: '5', exact: true }).click()
await espera(2000)
if (process.env.MX) {
  await page.mouse.move(Number(process.env.MX), Number(process.env.MY))
  for (let k = 0; k < Number(process.env.ZOOM ?? 10); k++) { await page.mouse.wheel(0, -300); await espera(120) }
  await espera(1500)
}
if (process.env.MX2) {
  await page.mouse.move(Number(process.env.MX2), Number(process.env.MY2))
  for (let k = 0; k < Number(process.env.ZOOM2 ?? 8); k++) { await page.mouse.wheel(0, -300); await espera(120) }
  await espera(1500)
}
await page.screenshot({ path: `${OUT}/20-edicion3d.png` })
if (process.env.DE) {
  const [x0, y0, x1, y1] = process.env.DE.split(',').map(Number)
  await page.mouse.move(x0, y0)
  await page.mouse.down()
  await page.mouse.move(x1, y1, { steps: 8 })
  await espera(300)
  await page.screenshot({ path: `${OUT}/21-edicion3d-arrastre.png` })
  await page.mouse.up()
  await espera(1200)
  await page.screenshot({ path: `${OUT}/22-edicion3d-suelto.png` })
  await page.getByText('Planta', { exact: true }).filter({ visible: true }).last().click()
  await espera(1500)
  const n = await page.locator('[data-nucleo-detalle]').first().boundingBox()
  await page.mouse.move(n.x - n.width, n.y + n.height / 2)
  for (let k = 0; k < 5; k++) { await page.mouse.wheel(0, -300); await espera(120) }
  await espera(800)
  await page.screenshot({ path: `${OUT}/23-edicion3d-en-planta.png` })
  // lo guardado: los ejes del plano de 150 contra los de como sale del código
  const guardado = await page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.includes('referencia') && x !== 'gfit.projects')
    const p = k ? JSON.parse(localStorage.getItem(k)).project : null
    const plan = p?.residential?.catalogo?.find((c) => c.id === 'ref-150')
    const m = p?.masses?.find((x) => x.depto?.variante)
    return { clave: k, rooms: plan?.rooms?.map((r) => r.shape.flat().join(',')).join('|').slice(0, 400), variante: !!m }
  })
  console.log('guardado:', JSON.stringify(guardado))
}
console.log('errores:', errores.length ? errores.slice(0, 5) : 'ninguno')
await browser.close()
