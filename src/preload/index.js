import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// 自定义 API：读取 SWF 文件、拖动窗口、监听菜单选择
const api = {
  readSwf: async (pathOrRel) => {
    const { data, durationMs } = await ipcRenderer.invoke('read-swf', pathOrRel)
    const blob = new Blob([data], { type: 'application/x-shockwave-flash' })
    return { blobUrl: URL.createObjectURL(blob), durationMs }
  },
  pickSwf: async () => {
    return await ipcRenderer.invoke('pick-swf')
  },
  // 触发主进程弹出原生上下文菜单
  showContextMenu: () => ipcRenderer.send('show-context-menu'),
  // 菜单窗口点击某项 → 转发宠物动作并关闭菜单
  contextMenuAction: (action) => ipcRenderer.send('context-menu-action', action),
  // JS 手动拖动窗口
  windowDragStart: () => ipcRenderer.send('window-drag-start'),
  windowDragEnd: () => ipcRenderer.send('window-drag-end'),
  // 退出应用（渲染层播完 Exit 动画后调用）
  appQuit: () => ipcRenderer.send('app-quit'),
  // 把宠物窗口移到屏幕左/右边缘（height 可选：拖动贴边时传鼠标高度，不传则主进程随机），edge: 'left'|'right'
  moveToEdge: (edge, height) => ipcRenderer.send('hide-to-edge', edge, height),
  // 渲染层播完 Hide 动画后隐藏窗口
  hidePet: () => ipcRenderer.send('hide-pet'),
  // 显示宠物窗口（领养完成后/其它需要重新露出时）
  showPet: () => ipcRenderer.send('show-pet'),
  // 更新托盘 tooltip 状态文案（成长/学习/打工/休息/死亡）
  setTrayStatus: (text) => ipcRenderer.send('set-tray-tooltip', text),
  // 更新托盘图标性别（GG→Boy / MM→Girl，主进程据此切换 Tray 性别目录）
  setTrayGender: (gender) => ipcRenderer.send('set-tray-gender', gender),
  // 订阅主进程菜单选择事件，返回取消函数（先清旧监听防 HMR/重挂载累积）
  onMenuSelected: (callback) => {
    ipcRenderer.removeAllListeners('menu-selected')
    const listener = (_event, filePath) => callback(filePath)
    ipcRenderer.on('menu-selected', listener)
    return () => ipcRenderer.removeAllListeners('menu-selected')
  },
  // 订阅主进程"宠物状态动作"（右键菜单触发），返回取消函数（防监听器累积导致重复触发）
  onPetAction: (callback) => {
    ipcRenderer.removeAllListeners('pet-action')
    const listener = (_event, action, height) => callback(action, height)
    ipcRenderer.on('pet-action', listener)
    return () => ipcRenderer.removeAllListeners('pet-action')
  },
  // 读取 Communication 下的文案 txt（GBK 已解码，返回中文文本）
  readTxt: async (rel) => await ipcRenderer.invoke('read-txt', rel),
  // 列出 Communication 某类别下全部 .txt 文件名
  listTxt: async (category) => await ipcRenderer.invoke('list-txt', category),
  // 列出 Action 某子目录下全部 .swf 文件名
  listSwf: async (folder) => await ipcRenderer.invoke('list-swf', folder),
  // 读取 resources/assets 下的图片，返回 dataURL（供登录等 UI 使用）
  readImage: async (rel) => await ipcRenderer.invoke('read-image', rel),
  // 读取 resources/assets 下的 SVG 文件，返回 data:image/svg+xml;base64 dataURL（商店商品图标）
  readSvg: async (rel) => await ipcRenderer.invoke('read-svg', rel),
  // 通用文件列表：assets 下任意子目录的文件名，可选扩展名过滤
  listFiles: async (rel, ext) => await ipcRenderer.invoke('list-files', rel, ext),
  // 打开商店/小游戏/背包独立窗口（商店与小游戏共用中心窗口，tab 切换）
  openShop: () => ipcRenderer.send('open-shop'),
  openGame: () => ipcRenderer.send('open-game'),
  openInfo: () => ipcRenderer.send('open-info'),
  openBag: () => ipcRenderer.send('open-bag'),
  openWork: () => ipcRenderer.send('open-work'),
  openStudy: () => ipcRenderer.send('open-study'),
  openTask: () => ipcRenderer.send('open-task'),
  openFriend: () => ipcRenderer.send('open-friend'),
  // 系统设置 / 帮助 / 退出确认 三个辅助小窗
  openSettings: () => ipcRenderer.send('open-settings'),
  openHelp: () => ipcRenderer.send('open-help'),
  openConfirm: () => ipcRenderer.send('open-confirm'),
  // 通用提示框（tip/alert）：mode='alert' 只有一个确定，'confirm' 有确定+取消
  openAlert: (payload) => ipcRenderer.send('open-alert', payload),
  // 桌面提醒（公告）小窗：宠物窗口在饥饿/生病/奖励可领时调用
  openNotice: (payload) => ipcRenderer.send('open-notice', payload),
  // 打开 AI 聊天窗（右键菜单「和宝贝聊天」）
  openChat: () => ipcRenderer.send('open-chat'),
  // AI 对话：{ baseUrl, apiKey, model, messages } → { ok, parsed:{reply,emotion,action,mood}, ... }
  aiChat: (payload) => ipcRenderer.invoke('ai-chat', payload),
  // AI 设置页「测试连接」
  aiTest: (payload) => ipcRenderer.invoke('ai-test', payload),
  aiDefaults: () => ipcRenderer.invoke('ai-defaults'),
  // AI 台词 + 动作交给宠物窗口执行（气泡播报并在空闲时播动作动画）
  aiSay: (payload) => ipcRenderer.send('ai-say', payload),
  // —— 聊天记录与记忆（JSONL 落盘，读写都走主进程）——
  // 追加一条：{ role:'user'|'pet', text, src:'chat'|'auto', emotion?, action? }
  memAppend: (rec) => ipcRenderer.invoke('mem-append', rec),
  // 组装上下文：{ history:[{role,content}], summary, impression, facts, factCount }
  memContext: (limit, since) => ipcRenderer.invoke('mem-context', limit, since),
  // 按天分组的历史（聊天窗回填）
  memHistory: (opts) => ipcRenderer.invoke('mem-history', opts),
  // 清空：'today' 只清今天的聊天，'all' 连长期记忆一起清
  memClear: (scope) => ipcRenderer.invoke('mem-clear', scope),
  memProfile: () => ipcRenderer.invoke('mem-profile'),
  memForget: (text) => ipcRenderer.invoke('mem-forget', text),
  // 攒够条数后压缩 L0 → L1/L2（异步、失败静默，不要 await 在发送链路上）
  memCompact: (cfg) => ipcRenderer.invoke('mem-compact', cfg),
  memStats: () => ipcRenderer.invoke('mem-stats'),
  memOpenDir: () => ipcRenderer.invoke('mem-open-dir'),
  memExport: (meta) => ipcRenderer.invoke('mem-export', meta),
  // 数据存储目录：默认在用户数据目录下，可改；改动时旧数据会自动补过去
  dataDirInfo: () => ipcRenderer.invoke('datadir-info'),
  dataDirPick: () => ipcRenderer.invoke('datadir-pick'),
  dataDirSet: (dir) => ipcRenderer.invoke('datadir-set', dir),
  dataDirReset: () => ipcRenderer.invoke('datadir-reset'),
  dataDirOpen: () => ipcRenderer.invoke('datadir-open'),
  // 提示框的按钮结果回传（id 用于匹配发起方的请求）
  alertResult: (res) => ipcRenderer.send('alert-result', res),
  onAlertResult: (cb) => {
    ipcRenderer.removeAllListeners('alert-result')
    const listener = (_e, res) => cb(res)
    ipcRenderer.on('alert-result', listener)
    return () => ipcRenderer.removeAllListeners('alert-result')
  },
  // 按目标值设置窗口属性（设置窗口用，区别于菜单的"切换"）
  setWindowPrefs: (prefs) => ipcRenderer.send('set-window-prefs', prefs),
  // 中心窗口已打开时，主进程发来的"切到指定页签"通知（菜单点商店/打工等直接切页）
  onCenterTab: (cb) => {
    ipcRenderer.removeAllListeners('center-tab')
    const listener = (_e, tab) => cb(tab)
    ipcRenderer.on('center-tab', listener)
    return () => ipcRenderer.removeAllListeners('center-tab')
  },
  // 读取宠物窗口置顶/穿透状态（右键菜单渲染勾选标记用）
  getWindowPrefs: async () => await ipcRenderer.invoke('get-window-prefs'),
  // 订阅置顶/穿透状态变化（右键菜单打开期间从托盘/菜单切换后实时刷新勾选态）
  onWindowPrefsChanged: (callback) => {
    ipcRenderer.removeAllListeners('window-prefs-changed')
    const listener = (_event, prefs) => callback(prefs)
    ipcRenderer.on('window-prefs-changed', listener)
    return () => ipcRenderer.removeAllListeners('window-prefs-changed')
  },
  // 元宝/背包数据变更信号：写入方通知主进程广播，其他窗口收到后即时刷新（替代轮询）
  storageChanged: () => ipcRenderer.send('storage-changed'),
  onStorageChanged: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('storage-changed', listener)
    return () => ipcRenderer.removeListener('storage-changed', listener)
  },
  // 聊天记录有新增（宠物主动搭话落盘）→ 聊天窗收到后重载历史
  onChatUpdated: (cb) => {
    const listener = () => cb()
    ipcRenderer.on('chat-updated', listener)
    return () => ipcRenderer.removeListener('chat-updated', listener)
  },
  // 打开"首次领养宠物"选择窗口（选性别+命名）
  openPetSelect: () => ipcRenderer.send('open-pet-select'),
  // 领养完成：把选择的性别/昵称交给主进程 → 转发宠物窗口开始播放 First 出生动画
  adoptPet: (payload) => ipcRenderer.send('adopt-pet', payload),
  // 控制栏点击 → 转发给宠物窗口 dispatch（action 如 'work'/'study'/'eat'/...）
  sendControlAction: (action) => ipcRenderer.send('control-action', action),
  // 商店等窗口发来反馈气泡 → 宠物窗口气泡播报
  sendPetBubble: (text) => ipcRenderer.send('pet-bubble', text),
  // 关闭当前窗口（商店/游戏窗关闭按钮）
  closeSelf: () => ipcRenderer.send('close-self'),
  // 登录成功（登录窗 → 主进程关闭登录窗、弹出宠物窗）
  loginDone: () => ipcRenderer.send('login-success'),
  // 取消/关闭登录（退出应用）
  loginCancel: () => ipcRenderer.send('login-cancel')
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  window.electron = electronAPI
  window.api = api
}