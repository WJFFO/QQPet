/**
 * 数据存储目录（主进程）
 *
 * 默认放在 exe 同级的 qqpetdata 目录，方便用户直接看到、备份、拷走。
 * 开发态 exe 在 node_modules/electron 里，不能用 exe 目录，改用项目根。
 *
 * 用户可以在设置里改成任意目录。改路径时把旧目录里的聊天记录和记忆**补**到新目录
 * （目标已存在的文件不覆盖，避免把用户特意指过来的老备份冲掉）。
 *
 * 配置本身存在 userData 下的 qqpet-paths.json —— 它不能跟着数据目录走，
 * 否则换了路径下次启动就找不到"上次设的路径"了。
 */
import { app, dialog, shell } from 'electron'
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync
} from 'fs'
import { dirname, isAbsolute, join, resolve } from 'path'

const CONFIG_FILE = 'qqpet-paths.json'
const DIR_NAME = 'qqpetdata'
const DATA_FILES = ['profile.json', 'summary.json']

const configPath = () => join(app.getPath('userData'), CONFIG_FILE)

function readConfig() {
  try {
    const o = JSON.parse(readFileSync(configPath(), 'utf-8'))
    return o && typeof o === 'object' ? o : {}
  } catch {
    return {}
  }
}

function writeConfig(patch) {
  try {
    writeFileSync(configPath(), JSON.stringify({ ...readConfig(), ...patch }, null, 2), 'utf-8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || '配置写入失败' }
  }
}

/** 默认目录：打包后取 exe 同级，开发态取项目根 */
export function defaultDir() {
  const base = app.isPackaged ? dirname(app.getPath('exe')) : app.getAppPath()
  return join(base, DIR_NAME)
}

let current = null
// 启动时若发生回退，把原因留给设置页显示（否则用户只会看到路径"不对"却不知道原因）
let lastNote = ''

/** 当前数据目录（惰性求值，app ready 后才能调） */
export function get() {
  if (current) return current
  const custom = String(readConfig().dataDir || '').trim()
  current = custom && isAbsolute(custom) ? resolve(custom) : defaultDir()
  return current
}

/** 建目录 + 探一下可写（Program Files 这类位置常见没权限） */
export function ensure(dir) {
  try {
    mkdirSync(dir, { recursive: true })
    const probe = join(dir, '.qqpet-write-test')
    writeFileSync(probe, '1', 'utf-8')
    rmSync(probe, { force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || '目录不可写' }
  }
}

/**
 * 老版本把数据存在 userData/pet-data。换到新的默认目录后做一次性搬迁：
 * 只在目标还没有聊天记录时才复制，且只复制不删原件，避免误伤。
 */
function migrateLegacy(dir) {
  try {
    const legacy = join(app.getPath('userData'), 'pet-data')
    if (resolve(legacy) === resolve(dir) || !existsSync(legacy)) return 0
    const dstChat = join(dir, 'chats')
    if (existsSync(dstChat) && readdirSync(dstChat).length > 0) return 0
    return copyInto(legacy, dir)
  } catch {
    return 0
  }
}

/**
 * 启动时调一次：确认当前目录可用，不可用就逐级回退。
 * 顺序：用户自定义 → exe 同级 → userData（最后兜底，一定有权限）
 */
export function init() {
  const wanted = get()
  if (ensure(wanted).ok) {
    writeConfig({ dataDir: wanted === defaultDir() ? '' : wanted })
    const moved = migrateLegacy(wanted)
    lastNote = ''
    return { dir: wanted, fallback: false, migrated: moved }
  }

  const def = defaultDir()
  if (def !== wanted && ensure(def).ok) {
    current = def
    writeConfig({ dataDir: '' })
    lastNote = `原目录 ${wanted} 不可写，已回到默认目录`
    return { dir: def, fallback: true, reason: lastNote }
  }

  const safe = join(app.getPath('userData'), DIR_NAME)
  ensure(safe)
  current = safe
  writeConfig({ dataDir: '' })
  lastNote = '默认目录不可写，数据已存到用户数据目录'
  return { dir: safe, fallback: true, reason: lastNote }
}

/** 把旧目录里的数据补到新目录：目标已有的文件跳过，不覆盖 */
function copyInto(from, to) {
  if (!from || resolve(from) === resolve(to) || !existsSync(from)) return 0
  let moved = 0

  const srcChat = join(from, 'chats')
  const dstChat = join(to, 'chats')
  try {
    if (existsSync(srcChat)) {
      mkdirSync(dstChat, { recursive: true })
      for (const f of readdirSync(srcChat)) {
        if (!f.endsWith('.jsonl')) continue
        const dst = join(dstChat, f)
        if (existsSync(dst)) continue
        cpSync(join(srcChat, f), dst)
        moved++
      }
    }
  } catch {
    /* 单天文件拷失败不影响其它 */
  }

  for (const f of DATA_FILES) {
    const src = join(from, f)
    const dst = join(to, f)
    try {
      if (existsSync(src) && !existsSync(dst)) {
        cpSync(src, dst)
        moved++
      }
    } catch {
      /* 跳过 */
    }
  }
  return moved
}

/** 切换目录（会先校验可写，再把旧数据补过去） */
export function set(target) {
  const next = resolve(String(target || '').trim())
  if (!target || !next) return { ok: false, error: '路径为空' }

  const from = get()
  if (next === from) return { ok: true, dir: next, moved: 0, unchanged: true }

  const check = ensure(next)
  if (!check.ok) return { ok: false, error: `这个目录不可写：${check.error}` }

  const moved = copyInto(from, next)
  current = next
  // 和默认目录一致就清空配置，这样「是否自定义」的判断才准
  const w = writeConfig({ dataDir: next === defaultDir() ? '' : next })
  if (!w.ok) return { ok: false, error: w.error, dir: next }
  return { ok: true, dir: next, moved }
}

/** 弹目录选择框 */
export async function pick(parentWindow) {
  const { canceled, filePaths } = await dialog.showOpenDialog(parentWindow || undefined, {
    title: '选择数据存储目录',
    buttonLabel: '用这个目录',
    properties: ['openDirectory', 'createDirectory']
  })
  if (canceled || !filePaths?.length) return { ok: false, canceled: true }
  return { ok: true, dir: filePaths[0] }
}

/** 恢复默认目录（同样会把当前数据补过去） */
export function reset() {
  return set(defaultDir())
}

export function open() {
  const dir = get()
  ensure(dir)
  shell.openPath(dir)
  return { ok: true, dir }
}

/** 设置页展示用 */
export function info() {
  const dir = get()
  const def = defaultDir()
  // 是否自定义以「配置里有没有写 dataDir」为准，而不是比较路径：
  // 默认目录不可写而回退到 userData 时，路径虽不等于默认值，但那不是用户选的
  const isCustom = !!String(readConfig().dataDir || '').trim()
  return {
    dir,
    defaultDir: def,
    isCustom,
    exists: existsSync(dir),
    note: lastNote
  }
}
