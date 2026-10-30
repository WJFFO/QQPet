/**
 * 聊天记录 + 三层记忆（主进程）
 *
 * 为什么不是数据库：单机单宠物、每天百来句、一年才 3MB，SQLite 的并发/索引/事务
 * 全用不上，却要引入 better-sqlite3 这种原生模块（rebuild + 三平台分别打包）。
 * 用 JSONL 按天分文件：append 是 O(1) 追加，单行损坏只丢一条，记事本能直接看。
 *
 * 为什么放主进程：聊天窗和宠物窗是两个 BrowserWindow，宠物主动说的话也要进同一份
 * 历史。文件只有主进程写，才是唯一数据源（localStorage 多窗口互相覆盖的老坑）。
 *
 * 记忆分层：
 *   L0 最近 N 轮原文  —— 进 messages，让模型接得上上一句
 *   L1 滚动摘要        —— 每攒够 20 条压一次，只留最近 5 条 + 一条长期印象
 *   L2 长期档案        —— 抽出「主人是谁、喜欢什么」这类稳定事实，去重后最多 50 条
 * L1/L2 拼进 system prompt，所以关掉重开也记得你之前说过什么。
 */
import { app, dialog } from 'electron'
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from 'fs'
import { join } from 'path'
import { chat as aiChat } from './ai'
import * as dataDir from './dataDir'

export const LIMITS = {
  maxDays: 30, // 聊天文件保留天数，更早的启动时清掉
  maxFileBytes: 5 * 1024 * 1024, // 单日文件上限，超了停止写入并提示
  compactEvery: 20, // 攒够多少条触发一次压缩
  maxFacts: 50, // 长期事实条数上限
  maxSummaries: 5, // 保留几条滚动摘要
  ctxMsgs: 12 // L0 默认带几轮
}

// app.getPath 必须等 ready，所以路径全部惰性求值；
// 具体根目录由 dataDir 决定（默认 exe 同级 qqpetdata，可在设置里改）
const root = () => dataDir.get()
const chatDir = () => join(root(), 'chats')
const profilePath = () => join(root(), 'profile.json')
const summaryPath = () => join(root(), 'summary.json')

function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
}

/** 按本地时区取 YYYY-MM-DD（跨时区不会串天） */
function dayKey(ts = Date.now()) {
  const d = new Date(ts)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function dayFile(day) {
  return join(chatDir(), `${day}.jsonl`)
}

/** 原子写：先写临时文件再 rename，避免断电/崩溃留下半个 JSON */
function writeJsonAtomic(path, data) {
  ensureDir(root())
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8')
  renameSync(tmp, path)
}

// —— L0：聊天记录 ——

/**
 * 追加一条消息。
 * @param {{role:'user'|'pet', text:string, t?:number, src?:'chat'|'auto', emotion?:string, action?:string}} rec
 */
export function append(rec = {}) {
  const text = String(rec.text || '').trim()
  if (!text) return { ok: false, error: '内容为空' }

  const t = Number(rec.t) || Date.now()
  const row = {
    t,
    role: rec.role === 'user' ? 'user' : 'pet',
    text: text.slice(0, 500),
    src: rec.src === 'auto' ? 'auto' : 'chat'
  }
  if (rec.emotion) row.emotion = String(rec.emotion)
  if (rec.action) row.action = String(rec.action)

  try {
    ensureDir(chatDir())
    const f = dayFile(dayKey(t))
    // 单日文件过大就停写：宁可少存，也别把一天的文件撑到几 MB 拖慢读取
    if (existsSync(f) && statSync(f).size > LIMITS.maxFileBytes) {
      return { ok: false, error: '今天的记录文件已满（5MB）' }
    }
    appendFileSync(f, `${JSON.stringify(row)}\n`, 'utf-8')
    return { ok: true, path: f }
  } catch (e) {
    return { ok: false, error: e?.message || '写入失败' }
  }
}

/** 读某一天的全部记录；坏行直接跳过，不影响其余内容 */
function readDay(day) {
  const f = dayFile(day)
  if (!existsSync(f)) return []
  let raw = ''
  try {
    raw = readFileSync(f, 'utf-8')
  } catch {
    return []
  }
  const out = []
  for (const line of raw.split('\n')) {
    const s = line.trim()
    if (!s) continue
    try {
      const o = JSON.parse(s)
      if (o && o.text) out.push(o)
    } catch {
      /* 单行损坏就跳过，这一条丢总比整天都读不出来强 */
    }
  }
  return out
}

/** 最近 N 条（按时间正序），days 控制往前翻几天 */
export function readRecent(limit = 30, days = 3) {
  const now = Date.now()
  const all = []
  for (let i = days - 1; i >= 0; i--) {
    all.push(...readDay(dayKey(now - i * 86400000)))
  }
  all.sort((a, b) => a.t - b.t)
  return limit > 0 ? all.slice(-limit) : all
}

/** 按天分组的历史（聊天窗滚动查看用） */
export function history({ days = 7, limit = 400 } = {}) {
  const now = Date.now()
  const groups = []
  for (let i = days - 1; i >= 0; i--) {
    const day = dayKey(now - i * 86400000)
    const rows = readDay(day)
    if (rows.length) groups.push({ day, rows: rows.slice(-limit) })
  }
  return groups
}

// —— L2：长期档案 ——

export function readProfile() {
  try {
    const raw = JSON.parse(readFileSync(profilePath(), 'utf-8'))
    const facts = (Array.isArray(raw?.facts) ? raw.facts : [])
      .map((f) =>
        typeof f === 'string'
          ? { t: f.trim(), at: 0 }
          : { t: String(f?.t || '').trim(), at: Number(f?.at) || 0 }
      )
      .filter((f) => f.t)
    return { facts, updatedAt: Number(raw?.updatedAt) || 0 }
  } catch {
    return { facts: [], updatedAt: 0 }
  }
}

export function writeProfile(p) {
  try {
    writeJsonAtomic(profilePath(), { facts: p.facts || [], updatedAt: p.updatedAt || Date.now() })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || '写入失败' }
  }
}

/** 忘掉一条（设置页手动删「记错的」） */
export function forgetFact(text) {
  const t = String(text || '').trim()
  if (!t) return { ok: false, error: '内容为空' }
  const p = readProfile()
  const facts = p.facts.filter((f) => f.t !== t)
  if (facts.length === p.facts.length) return { ok: false, error: '没找到这条记忆' }
  writeProfile({ facts, updatedAt: Date.now() })
  return { ok: true, facts }
}

// —— L1：滚动摘要 ——

export function readSummary() {
  try {
    const raw = JSON.parse(readFileSync(summaryPath(), 'utf-8'))
    const items = (Array.isArray(raw?.items) ? raw.items : [])
      .map((s) => String(s || '').trim())
      .filter(Boolean)
      .slice(-LIMITS.maxSummaries)
    return {
      items,
      impression: String(raw?.impression || '').trim(),
      compactedAt: Number(raw?.compactedAt) || 0
    }
  } catch {
    return { items: [], impression: '', compactedAt: 0 }
  }
}

function writeSummary(s) {
  try {
    writeJsonAtomic(summaryPath(), {
      items: s.items || [],
      impression: s.impression || '',
      compactedAt: s.compactedAt || 0
    })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || '写入失败' }
  }
}

// —— 组装上下文 ——

/**
 * 给渲染层拼 prompt 用：L0 原文 + L1 摘要 + L2 事实。
 * 事实按最近提及倒序取前 12 条，避免老早的东西一直占 token。
 */
export function context(limit = LIMITS.ctxMsgs) {
  // limit=0 表示只要 L1/L2（聊天窗已经用 mem-history 拿到原文，不必重复读）
  const n = Number(limit)
  const recent = n === 0 ? [] : readRecent(Math.max(1, n || LIMITS.ctxMsgs), 3)
  const p = readProfile()
  const s = readSummary()
  const topFacts = [...p.facts].sort((a, b) => b.at - a.at).slice(0, 12)

  return {
    history: recent.map((m) => ({
      role: m.role === 'user' ? 'user' : 'assistant',
      content: String(m.text || '')
    })),
    summary: s.items.map((x) => `- ${x}`).join('\n'),
    impression: s.impression,
    facts: topFacts.map((f) => `- ${f.t}`).join('\n'),
    factCount: p.facts.length,
    lastAt: recent.length ? recent[recent.length - 1].t : 0
  }
}

// —— 压缩：L0 → L1/L2 ——

/** 解析压缩结果，容忍代码围栏和前后废话 */
function parseMemoryJson(content) {
  const raw = String(content || '')
    .replace(/^```[a-zA-Z]*\s*/, '')
    .replace(/```\s*$/, '')
    .trim()
  const cands = [raw]
  const a = raw.indexOf('{')
  const b = raw.lastIndexOf('}')
  if (a >= 0 && b > a) cands.push(raw.slice(a, b + 1))

  for (const c of cands) {
    try {
      const o = JSON.parse(c)
      if (!o || typeof o !== 'object') continue
      const summary = String(o.summary || o['摘要'] || '').trim()
      const fr = o.facts || o['事实'] || []
      const list = Array.isArray(fr) ? fr : [fr]
      const facts = list
        .map((x) => (typeof x === 'object' && x ? x.t || x.text || '' : x))
        .map((x) => String(x || '').trim())
        .filter(Boolean)
      if (summary || facts.length) return { summary, facts }
    } catch {
      /* 试下一个候选 */
    }
  }
  // 兜底：整段当摘要（跳过以 { 开头的行，别把 JSON 壳写进记忆）
  const line = raw
    .split('\n')
    .map((s) => s.trim())
    .find((s) => s && !/^[{[]/.test(s))
  return { summary: (line || '').slice(0, 200), facts: [] }
}

/** 去重合并事实：完全相等或互相包含都算同一条，命中就刷新时间 */
function mergeFacts(old, fresh, now) {
  const out = [...old]
  for (const f of fresh) {
    const t = String(f || '').trim().slice(0, 40)
    if (t.length < 2) continue
    const hit = out.find((x) => x.t === t || x.t.includes(t) || t.includes(x.t))
    if (hit) {
      hit.at = now
      continue
    }
    out.push({ t, at: now })
  }
  if (out.length > LIMITS.maxFacts) {
    out.sort((a, b) => b.at - a.at)
    out.length = LIMITS.maxFacts
  }
  return out
}

let compacting = false

/**
 * 攒够 20 条就压一次。异步执行、失败静默，绝不能卡在用户点发送的链路上。
 * cfg: { apiKey, baseUrl, model, memoryModel? }
 */
export async function maybeCompact(cfg = {}) {
  if (compacting) return { ok: true, skipped: 'busy' }
  if (!String(cfg.apiKey || '').trim()) return { ok: false, error: '未配置 API Key' }

  const s = readSummary()
  const since = Number(s.compactedAt) || 0
  const pending = readRecent(200, 3).filter((m) => m.t > since)
  if (pending.length < LIMITS.compactEvery) {
    return { ok: true, skipped: 'not-enough', pending: pending.length }
  }

  compacting = true
  try {
    const p = readProfile()
    const lines = pending
      .slice(-60)
      .map((m) => `${m.role === 'user' ? '主人' : '宠物'}：${String(m.text || '').slice(0, 120)}`)
      .join('\n')
    const known = [s.impression, ...s.items].filter(Boolean).join('\n')

    const res = await aiChat({
      apiKey: cfg.apiKey,
      baseUrl: cfg.baseUrl,
      model: cfg.memoryModel || cfg.model,
      temperature: 0.2,
      maxTokens: 400,
      timeoutMs: 40000,
      messages: [
        {
          role: 'system',
          content: [
            '你在做对话记忆压缩。把一段宠物与主人的聊天整理成可长期复用的记忆。',
            '只输出一个 JSON 对象，不要代码块和解释：',
            '{"summary":"这一段的摘要","facts":["关于主人的稳定事实"]}',
            'summary：1~2 句，40~80 字，写清这几天聊了什么、主人提到的事，不要流水账。',
            'facts：只抽「稳定且以后还有用」的事实，比如主人的职业/在做的事/喜好/忌讳/重要日期/答应过的事。',
            '每条一句话、20 字内、第三人称（"主人是程序员"）。临时情绪、一次性的闲聊不要。',
            '没有值得记的 facts 就给空数组。单次最多 5 条。',
            '已经记过的事实不要重复输出。'
          ].join('\n')
        },
        {
          role: 'user',
          content: [
            `【已有摘要】\n${known || '（无）'}`,
            `【已有档案】\n${p.facts.map((f) => `- ${f.t}`).join('\n') || '（无）'}`,
            `【新对话】\n${lines}`
          ].join('\n\n')
        }
      ]
    })

    if (!res?.ok) return { ok: false, error: res?.error || '压缩请求失败' }

    const got = parseMemoryJson(res.content)
    if (!got.summary && !got.facts.length) return { ok: false, error: '模型没给出可用记忆' }

    const now = Date.now()
    const items = [...s.items]
    if (got.summary) items.push(got.summary)
    // 超出的旧摘要并进「长期印象」，再截断，避免无限增长
    let impression = s.impression
    if (items.length > LIMITS.maxSummaries) {
      const drop = items.splice(0, items.length - LIMITS.maxSummaries)
      impression = [impression, ...drop].filter(Boolean).join(' ').slice(-400)
    }
    writeSummary({ items, impression, compactedAt: now })
    if (got.facts.length) {
      writeProfile({ facts: mergeFacts(p.facts, got.facts, now), updatedAt: now })
    }

    return { ok: true, summary: got.summary, facts: got.facts }
  } catch (e) {
    return { ok: false, error: e?.message || '压缩异常' }
  } finally {
    compacting = false
  }
}

// —— 维护 ——

/** 删掉超过保留期的聊天文件，返回删除数量 */
export function pruneOld() {
  try {
    const dir = chatDir()
    if (!existsSync(dir)) return 0
    const cut = dayKey(Date.now() - LIMITS.maxDays * 86400000)
    let n = 0
    for (const f of readdirSync(dir)) {
      if (!/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)) continue
      // YYYY-MM-DD 字符串比较即时间比较
      if (f.slice(0, 10) < cut) {
        try {
          unlinkSync(join(dir, f))
          n++
        } catch {
          /* 单个删不掉不影响其它 */
        }
      }
    }
    return n
  } catch {
    return 0
  }
}

/**
 * 清空记录。scope='today' 只删今天的聊天（保留 L1/L2 记忆），
 * scope='all' 连长期档案和摘要一起清（真正「失忆」）。
 */
export function clear(scope = 'today') {
  try {
    if (scope === 'all') {
      const dir = chatDir()
      if (existsSync(dir)) {
        for (const f of readdirSync(dir)) {
          if (!f.endsWith('.jsonl')) continue
          try {
            unlinkSync(join(dir, f))
          } catch {
            /* 跳过删不掉的 */
          }
        }
      }
      for (const path of [profilePath(), summaryPath()]) {
        if (existsSync(path)) {
          try {
            unlinkSync(path)
          } catch {
            /* 跳过 */
          }
        }
      }
      return { ok: true }
    }
    const f = dayFile(dayKey())
    if (existsSync(f)) unlinkSync(f)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e?.message || '清空失败' }
  }
}

export function stats() {
  const dir = chatDir()
  let files = 0
  let bytes = 0
  let messages = 0
  try {
    if (existsSync(dir)) {
      for (const f of readdirSync(dir)) {
        if (!f.endsWith('.jsonl')) continue
        files++
        try {
          bytes += statSync(join(dir, f)).size
        } catch {
          /* 读不到大小就算了 */
        }
        messages += readDay(f.slice(0, 10)).length
      }
    }
  } catch {
    /* 目录不存在等情况按 0 处理 */
  }
  const p = readProfile()
  const s = readSummary()
  return {
    files,
    bytes,
    messages,
    facts: p.facts.length,
    summaries: s.items.length,
    impression: s.impression,
    dir: root()
  }
}

/** 导出为 Markdown 时间线（用户自己选路径） */
export async function exportAs(parentWindow, meta = {}) {
  const { canceled, filePath } = await dialog.showSaveDialog(parentWindow || undefined, {
    title: '导出聊天记录',
    defaultPath: join(app.getPath('downloads'), `qqpet-chat-${dayKey()}.md`),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  const groups = history({ days: LIMITS.maxDays })
  const lines = [`# ${meta.name || '宠物'}的聊天记录`, '']
  for (const g of groups) {
    lines.push(`## ${g.day}`, '')
    for (const m of g.rows) {
      const who = m.role === 'user' ? meta.owner || '主人' : meta.name || '宠物'
      const hhmm = new Date(m.t).toTimeString().slice(0, 5)
      lines.push(`- \`${hhmm}\` **${who}**：${m.text}`)
    }
    lines.push('')
  }
  const p = readProfile()
  if (p.facts.length) {
    lines.push('## 长期记忆', '', ...p.facts.map((f) => `- ${f.t}`), '')
  }
  try {
    writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return { ok: true, path: filePath }
  } catch (e) {
    return { ok: false, error: e?.message || '导出失败' }
  }
}
