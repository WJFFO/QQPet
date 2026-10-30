import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
          login: resolve('src/renderer/login.html'),
          center: resolve('src/renderer/center.html'),
          menu: resolve('src/renderer/menu.html'),
          petselect: resolve('src/renderer/petselect.html'),
          settings: resolve('src/renderer/settings.html'),
          help: resolve('src/renderer/help.html'),
          confirm: resolve('src/renderer/confirm.html'),
          alert: resolve('src/renderer/alert.html'),
          notice: resolve('src/renderer/notice.html'),
          chat: resolve('src/renderer/chat.html')
        }
      }
    },
    publicDir: resolve('src/renderer/public'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src')
      }
    },
    plugins: [vue()]
  }
})
