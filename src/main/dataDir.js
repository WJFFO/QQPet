/**
 * 数据存储目录（主进程）
 *
 * 默认放在 userData 下的 qqpetdata —— 不能放安装目录。
 * 原因：electron-builder 的 NSIS 安装器在装新版本前会先跑旧版卸载程序
 * （/S /KEEP_APP_DATA --updated），那条路径会把整个 $INSTDIR 移走删掉。
 * /KEEP_APP_DATA 只保护 %APPDATA%\QQPet，不保护安装目录里的自定义文件夹，
 * 所以 1.2.5 及以前「exe 同级 qqpetdata」的默认位置，每次升级都会把聊天记录清零。
 *
 * 老版本留下的数据可能在 exe 同级 qqpetdata 或 userData/pet-data，
 * 启动时一次性搬到新默认目录（只复制不删原件）。
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
import { dirname, isAbsolute, join, resolve, sep } from 'path'

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

/** 默认目录：打包后放 userData（升级安装不会碰），开发态放项目根 */
export function defaultDir() {
  if (app.isPackaged) return join(app.getPath('userData'), DIR_NAME)
  // 开发态 exe 在 node_modules/electron 里，不能用 exe 目录；也刻意不跟打包版共用，
  // 免得调试产生的测试存档混进用户的正式数据
  return join(app.getAppPath(), DIR_NAME)
}

/** 1.2.5 及以前的默认目录：exe 同级 qqpetdata，现在只当迁移来源 */
function legacyExeDir() {
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
 * 老数据搬迁。两个来源，按优先级：
 *   1. exe 同级 qqpetdata —— 1.2.5 及以前的默认位置（升级安装会清空，能救一次算一次）
 *   2. userData/pet-data —— 更老的版本
 * 只在目标还没有聊天记录时才搬，且只复制不删原件，避免误伤。
 */
function migrateLegacy(dir) {
  let moved = 0
  for (const from of [legacyExeDir(), join(app.getPath('userData'), 'pet-data')]) {
    try {
      if (!from || resolve(from) === resolve(dir) || !existsSync(from)) continue
      const dstChat = join(dir, 'chats')
      // 已经搬过一次就别再搬第二个来源，否则两份聊天记录会叠在一起
      if (existsSync(dstChat) && readdirSync(dstChat).length > 0) break
      moved += copyInto(from, dir)
    } catch {
      /* 单个来源失败不影响其它 */
    }
  }
  return moved
}

/**
 * 启动时调一次：确认当前目录可用，不可用就逐级回退。
 * 顺序：用户自定义 → 默认目录（userData，一定有权限）→ 临时目录兜底
 */
export function init() {
  const wanted = get()
  if (ensure(wanted).ok) {
    writeConfig({ dataDir: wanted === defaultDir() ? '' : wanted })
    const moved = migrateLegacy(wanted)
    lastNote = ''
    return { dir: wanted, fallback: false, migrated: moved }
  }

  // 自定义目录不可写（盘符没了、目录被删），退回默认目录，顺便把老数据搬过去
  const def = defaultDir()
  if (def !== wanted && ensure(def).ok) {
    current = def
    writeConfig({ dataDir: '' })
    lastNote = `原目录 ${wanted} 不可写，已回到默认目录`
    return { dir: def, fallback: true, migrated: migrateLegacy(def), reason: lastNote }
  }

  // 连默认目录都写不了（用户目录被同步软件锁住之类），兜到临时目录，至少别让程序起不来
  const safe = join(app.getPath('temp'), DIR_NAME)
  ensure(safe)
  current = safe
  writeConfig({ dataDir: '' })
  lastNote = '默认目录不可写，数据已暂存到临时目录'
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

  // 数据落在安装目录里的话，下次升级安装会被 NSIS 连目录一起删掉 —— 提前告诉用户
  let inInstallDir = false
  if (app.isPackaged) {
    const exeDir = resolve(dirname(app.getPath('exe')))
    const cur = resolve(dir)
    inInstallDir = cur === exeDir || cur.startsWith(exeDir + sep)
  }

  return {
    dir,
    defaultDir: def,
    isCustom,
    exists: existsSync(dir),
    inInstallDir,
    note: lastNote
  }
}
