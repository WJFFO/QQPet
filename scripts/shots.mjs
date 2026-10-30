// 通过 CDP 截取运行中的 Electron 各页面，输出到 docs/screenshots
import { writeFileSync, mkdirSync } from 'node:fs'

const PORT = 9222
const OUT = 'docs/screenshots'
mkdirSync(OUT, { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json/list`)
  return (await r.json()).filter((t) => t.type === 'page')
}

function cdp(wsUrl) {
  const ws = new WebSocket(wsUrl)
  let id = 0
  const pending = new Map()
  const ready = new Promise((res, rej) => {
    ws.onopen = res
    ws.onerror = rej
  })
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data)
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m)
      pending.delete(m.id)
    }
  }
  return {
    ready,
    send(method, params = {}, timeout = 20000) {
      const mid = ++id
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout ' + method)), timeout)
        pending.set(mid, (m) => {
          clearTimeout(t)
          m.error ? rej(new Error(method + ': ' + JSON.stringify(m.error))) : res(m.result)
        })
        ws.send(JSON.stringify({ id: mid, method, params }))
      })
    },
    close: () => ws.close()
  }
}

async function find(file) {
  return (await targets()).find((t) => t.url.includes(file))
}

async function waitFor(file, tries = 40) {
  for (let i = 0; i < tries; i++) {
    const t = await find(file)
    if (t) return t
    await sleep(300)
  }
  throw new Error('未等到窗口 ' + file)
}

async function capture(t, file) {
  const c = cdp(t.webSocketDebuggerUrl)
  await c.ready
  await c.send('Page.enable')
  await c.send('Emulation.setDefaultBackgroundColorOverride', {
    color: { r: 233, g: 238, b: 245, a: 255 }
  })
  const { data } = await c.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
  const buf = Buffer.from(data, 'base64')
  writeFileSync(`${OUT}/${file}`, buf)
  console.log('✓', file, Math.round(buf.length / 1024) + 'KB')
  c.close()
}

// —— 1. 登录页（填好演示账号再截，更真实）——
let login = await find('login.html')
if (login) {
  const c = cdp(login.webSocketDebuggerUrl)
  await c.ready
  await c.send('Runtime.evaluate', {
    expression: `
      (() => {
        const ins = [...document.querySelectorAll('input')].filter(i => i.type !== 'checkbox')
        const set = (el, v) => {
          el.value = v
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        }
        if (ins[0]) set(ins[0], '123456')
        if (ins[1]) set(ins[1], '123456')
        return ins.length
      })()
    `
  })
  await sleep(600)
  await capture(login, '01-login.png')
  await c.send('Runtime.evaluate', { expression: 'window.api.loginDone()' })
  c.close()
  console.log('→ 已登录')
}

// —— 2. 选宠窗口（若有）——
await sleep(2500)
let pet = await find('petselect.html')
if (pet) {
  await sleep(1500)
  await capture(pet, '02-petselect.png')
}

// —— 3. 主窗口作为控制入口 ——
const main = await waitFor('index.html', 60)
const mc = cdp(main.webSocketDebuggerUrl)
await mc.ready
console.log('→ 主窗口就绪')

async function callMain(expr) {
  try {
    await mc.send('Runtime.evaluate', { expression: expr, awaitPromise: true })
  } catch (e) {
    console.log('  warn:', e.message)
  }
}

const steps = [
  ['api.openShop()', 'center.html', '03-shop.png'],
  ['api.openBag()', 'center.html', '04-bag.png'],
  ['api.openTask()', 'center.html', '05-task.png'],
  ['api.openWork()', 'center.html', '06-work.png'],
  ['api.openStudy()', 'center.html', '07-study.png'],
  ['api.openInfo()', 'center.html', '08-info.png'],
  ['api.openSettings()', 'settings.html', '09-settings.png'],
  ['api.openChat()', 'chat.html', '10-chat.png']
]

for (const [expr, file, out] of steps) {
  await callMain(`window.${expr}`)
  const t = await waitFor(file)
  await sleep(2000)
  await capture(t, out)
}

mc.close()
console.log('done')
