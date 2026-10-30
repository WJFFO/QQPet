// 渲染 docs/hero.html 并截图，用于 README 顶部横幅
const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const fs = require('node:fs')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1000,
    height: 400,
    frame: false,
    show: false,
    backgroundColor: '#f4f8ff',
    webPreferences: { offscreen: false }
  })
  await win.loadFile(path.join(__dirname, '../docs/hero.html'))
  await new Promise((r) => setTimeout(r, 1800))
  const img = await win.webContents.capturePage()
  const out = path.join(__dirname, '../docs/screenshots/00-hero.png')
  fs.writeFileSync(out, img.toPNG())
  console.log('hero saved', img.getSize())
  app.quit()
})
