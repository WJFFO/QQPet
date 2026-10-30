/**
 * AI 对话模块（主进程）
 *
 * 只依赖「接口地址 + API Key + 模型名称」，走 OpenAI 兼容的 /chat/completions 协议，
 * 所以 DeepSeek、MiniMax、通义、Kimi、OpenRouter、本地 Ollama / vLLM 都能直接接，
 * 换服务商不用改代码。请求放在主进程发出，避开渲染进程的 CORS 限制。
 *
 * 约定：模型只回一个 JSON —— {"reply": "...", "emotion": "happy", "action": "play", "mood": 6}
 * 解析时做了容错（代码围栏、前后废话、[动作: xxx] 写法、纯文本），
 * 解析失败就整段当台词，action 视为 none，保证不会因为模型不听话就不能用。
 */

// 没填时用的兜底地址（与设置页默认值一致）
const DEFAULTS = {
  baseUrl: 'https://api.deepseek.com/v1',
  model: 'deepseek-chat'
}

// 老配置按 provider 存的迁移表（现在只作兜底，不再用于区分请求方式）
const LEGACY_PROVIDER = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  minimax: { baseUrl: 'https://api.minimax.io/v1', model: 'MiniMax-M2.5' }
}

// 允许 AI 控制的动作 → 宠物状态机里真实存在的动作
const ACTION_ALIAS = {
  eat: 'eat',
  feed: 'eat',
  food: 'eat',
  clean: 'clean',
  wash: 'clean',
  bath: 'clean',
  play: 'play',
  dance: 'play',
  happy: 'play',
  study: 'study',
  learn: 'study',
  work: 'work',
  game: 'game',
  shop: 'shop',
  store: 'shop',
  bag: 'bag',
  info: 'info',
  profile: 'info',
  task: 'task',
  friend: 'friend',
  interact: 'interact',
  touch: 'interact',
  shy: 'interact',
  sleep: 'stand',
  idle: 'stand',
  stand: 'stand',
  none: '',
  '': ''
}

// 情绪白名单：渲染层据此选心情动画与心情值增减
const EMOTION_ALIAS = {
  happy: 'happy',
  joy: 'happy',
  glad: 'happy',
  excited: 'excited',
  excite: 'excited',
  shy: 'shy',
  shyness: 'shy',
  love: 'love',
  sad: 'sad',
  blue: 'sad',
  angry: 'angry',
  anger: 'angry',
  mad: 'angry',
  hungry: 'hungry',
  sleepy: 'sleepy',
  tired: 'sleepy',
  normal: 'normal',
  neutral: 'normal',
  calm: 'normal',
  '': ''
}

// 模型偶尔会用中文写情绪（"emotion":"开心"），先按中文兜一层
const EMOTION_CN = {
  开心: 'happy',
  高兴: 'happy',
  快乐: 'happy',
  兴奋: 'excited',
  激动: 'excited',
  害羞: 'shy',
  心动: 'love',
  撒娇: 'love',
  黏人: 'love',
  难过: 'sad',
  伤心: 'sad',
  失落: 'sad',
  生气: 'angry',
  愤怒: 'angry',
  饿了: 'hungry',
  好饿: 'hungry',
  困了: 'sleepy',
  疲惫: 'sleepy',
  平静: 'normal',
  普通: 'normal'
}

function normalizeEmotion(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  const cn = EMOTION_CN[t]
  if (cn) return cn
  const k = t.toLowerCase().replace(/[^a-z]/g, '')
  return k in EMOTION_ALIAS ? EMOTION_ALIAS[k] : ''
}

function normalizeAction(raw) {
  const k = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z-]/g, '')
  if (k in ACTION_ALIAS) return ACTION_ALIAS[k]
  return ''
}

// ——— 容错解析 ———
// 模型不一定老实输出合法 JSON，实测会碰到：单引号、裸值（"reply":好呀）、
// 字符串里带裸换行、被 max_tokens 截断（没有收尾的引号和花括号）、键名大小写、
// 多包一层、JSON 前后带解释。以前只做一次 JSON.parse，失败就把原文当台词，
// 于是气泡里出现 {"reply":…… —— 这里改成分层兜底。

const REPLY_KEYS = ['reply', 'text', 'say', 'content', 'message', 'msg', 'answer']
const EMO_KEYS = ['emotion', 'mood_name', 'moodname', 'feeling', 'emo']
const ACT_KEYS = ['action', 'act', 'cmd', 'do']
const MOOD_KEYS = ['mood', 'moodvalue', 'mood_value', 'mood_delta']

// 去掉 ```json ... ``` 围栏和残留反引号
function stripFences(input) {
  let s = String(input ?? '').replace(/^\uFEFF/, '')
  s = s.replace(/```[a-zA-Z]*\s*([\s\S]*?)```/g, (_, body) => body)
  s = s.replace(/`{3,}/g, '')
  return s.trim()
}

// 找出所有完整的花括号对象（跳过字符串里的花括号与转义）
function objectCandidates(s) {
  const out = []
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== '{') continue
    let depth = 0
    let inStr = false
    let esc = false
    for (let j = i; j < s.length; j++) {
      const c = s[j]
      if (inStr) {
        if (esc) esc = false
        else if (c === '\\') esc = true
        else if (c === '"') inStr = false
        continue
      }
      if (c === '"') inStr = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        out.push(s.slice(i, j + 1))
        break
      }
    }
  }
  return out
}

// 常见畸形 JSON 的修复：单引号、裸值、裸换行、尾逗号
function repairJson(str) {
  let s = str.trim()
  s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, v) => `"${v.replace(/"/g, '\\"')}"`)
  s = s.replace(/"((?:[^"\\]|\\.)*)"/g, (_, v) => `"${v.replace(/\r?\n/g, '\\n')}"`)
  s = s.replace(/([:：]\s*)([A-Za-z\u4e00-\u9fa5][^,}\]]*)/g, (m, p, v) => {
    const val = v.trim()
    if (/^(true|false|null|-?\d+(\.\d+)?)$/.test(val)) return m
    if (/^".*"$/.test(val)) return m
    return `${p}"${val.replace(/"/g, '\\"')}"`
  })
  s = s.replace(/,\s*([}\]])/g, '$1')
  return s
}

function unescapeStr(v) {
  return String(v || '')
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '')
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, '\\')
}

// 大小写无关取字段，并支持往内层找一层（模型有时包成 {"result":{...}}）
function pickKey(obj, keys, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 3) return undefined
  for (const [k, v] of Object.entries(obj)) {
    if (keys.includes(String(k).toLowerCase())) return v
  }
  for (const v of Object.values(obj)) {
    const r = pickKey(v, keys, depth + 1)
    if (r !== undefined) return r
  }
  return undefined
}

// 字段值可能被塞成对象/数组，尽量取出文本
function asText(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  if (Array.isArray(v)) return v.map(asText).find(Boolean) || ''
  if (typeof v === 'object') return asText(pickKey(v, REPLY_KEYS))
  return ''
}

function fromObject(obj, fallbackText = '') {
  const reply = asText(pickKey(obj, REPLY_KEYS)) || fallbackText
  const mood = Number(pickKey(obj, MOOD_KEYS))
  return {
    reply: tidyReply(reply),
    action: normalizeAction(pickKey(obj, ACT_KEYS)),
    emotion: normalizeEmotion(pickKey(obj, EMO_KEYS)),
    mood: Number.isFinite(mood) ? Math.max(-20, Math.min(20, mood)) : 0
  }
}

// 正则兜底：能吃掉未闭合的引号（截断），也能吃单引号和裸值
function looseField(text, keys) {
  const k = `["']?(?:${keys.join('|')})["']?\\s*[:：]\\s*`
  let m = text.match(new RegExp(`${k}"((?:[^"\\\\]|\\\\.)*)"`, 'i'))
  if (m) return unescapeStr(m[1])
  m = text.match(new RegExp(`${k}'([^']*)'`, 'i'))
  if (m) return unescapeStr(m[1])
  m = text.match(new RegExp(`${k}"([\\s\\S]*)$`, 'i'))
  if (m) return unescapeStr(m[1])
  m = text.match(new RegExp(`${k}([^,}\\]\\n]+)`, 'i'))
  if (m) return m[1].trim()
  return ''
}

// 台词收尾：去掉残留的 JSON 壳、压缩空白；若仍是纯 JSON 则返回空（宁可不说话也不糊 JSON）
function tidyReply(input) {
  let t = String(input ?? '').trim()
  if (!t) return ''
  if (/^[{[]/.test(t) && /[:：]/.test(t)) {
    const inner = looseField(t, REPLY_KEYS)
    if (!inner) return ''
    t = inner
  }
  t = t.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '').trim()
  // 只在「整段被引号包起来」时脱壳，避免误删台词本身的引号（他说"你好"）
  if (t.length > 1 && (t[0] === '"' || t[0] === "'") && t[t.length - 1] === t[0]) {
    t = t.slice(1, -1).trim()
  }
  return t.replace(/\s+/g, ' ').trim()
}

const EMPTY_REPLY = { reply: '', action: '', emotion: '', mood: 0 }

/** 从模型输出里取出 { reply, emotion, action, mood }，绝不把 JSON 原文当台词 */
export function parseReply(content) {
  const raw = stripFences(content)
  if (!raw) return { ...EMPTY_REPLY }

  // 1) 严格 JSON：多个候选里取第一个能拿到台词的
  for (const cand of objectCandidates(raw)) {
    try {
      const obj = JSON.parse(cand)
      if (obj && typeof obj === 'object') {
        const r = fromObject(obj)
        if (r.reply) return r
      }
    } catch {
      /* 落到下一层 */
    }
  }

  // 2) 修复畸形 JSON 后重试（单引号 / 裸值 / 裸换行 / 尾逗号）
  for (const cand of objectCandidates(raw)) {
    try {
      const obj = JSON.parse(repairJson(cand))
      if (obj && typeof obj === 'object') {
        const r = fromObject(obj)
        if (r.reply) return r
      }
    } catch {
      /* 落到下一层 */
    }
  }

  // 3) 正则兜底：处理截断、嵌套过深、JSON 结构坏到修不回来的情况
  // 兼容老写法「主人好呀 [动作: play]」——把尾巴当 action，别让它混进台词
  const tag = raw.match(/\[\s*(?:动作|action)\s*[:：]\s*([a-zA-Z-]+)\s*\]/i)
  const plain = tag ? raw.replace(tag[0], '') : raw
  const mood = Number(looseField(plain, MOOD_KEYS))
  return {
    reply: tidyReply(looseField(plain, REPLY_KEYS)) || tidyReply(plain),
    action: normalizeAction(looseField(plain, ACT_KEYS)) || (tag ? normalizeAction(tag[1]) : ''),
    emotion: normalizeEmotion(looseField(plain, EMO_KEYS)),
    mood: Number.isFinite(mood) ? Math.max(-20, Math.min(20, mood)) : 0
  }
}

/** 调用一次 chat/completions，返回 { ok, content, parsed } 或 { ok:false, error } */
export async function chat(payload = {}) {
  const {
    apiKey = '',
    baseUrl = '',
    model = '',
    messages = [],
    temperature = 0.9,
    maxTokens = 400,
    timeoutMs = 45000
  } = payload

  const key = String(apiKey || '').trim()
  if (!key) return { ok: false, error: '还没有填 API Key，先去「系统设置 → AI 助手」里配上' }
  if (!Array.isArray(messages) || !messages.length) return { ok: false, error: '消息为空' }

  // 兼容旧调用：只传了 provider 没传地址时，按老映射兜底
  const legacy = payload.provider ? LEGACY_PROVIDER[payload.provider] : null
  const base = String(baseUrl || legacy?.baseUrl || DEFAULTS.baseUrl)
    .trim()
    .replace(/\/+$/, '')

  // 兼容三种填法：完整 endpoint（…/chat/completions，原样用）、带路径的基址
  // （…/v1、…/openai/v1 → 补 /chat/completions）、只有域名（→ 补 /v1/chat/completions）
  let url = base
  if (!/\/chat\/completions$/.test(base)) {
    if (base.includes('/chatcompletion')) {
      url = base // MiniMax 原生 /text/chatcompletion_v2，不再拼接
    } else {
      const hasPath = base.replace(/^[a-z]+:\/\//i, '').includes('/')
      url = hasPath ? `${base}/chat/completions` : `${base}/v1/chat/completions`
    }
  }

  const body = {
    model: String(model || legacy?.model || DEFAULTS.model).trim(),
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: false
  }

  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`
      },
      body: JSON.stringify(body),
      signal: ctrl.signal
    })

    const text = await res.text()
    let data = null
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }

    if (!res.ok) {
      const msg =
        data?.error?.message ||
        data?.base_resp?.status_msg ||
        (text ? text.slice(0, 240) : '') ||
        '请求失败'
      return { ok: false, error: `HTTP ${res.status} ${msg}` }
    }
    // MiniMax 出错时也可能返回 200，错误放在 base_resp 里
    if (data?.base_resp && Number(data.base_resp.status_code) !== 0) {
      return { ok: false, error: `MiniMax: ${data.base_resp.status_msg || data.base_resp.status_code}` }
    }

    const raw = data?.choices?.[0]?.message?.content ?? data?.reply ?? data?.choices?.[0]?.text ?? ''
    // 少数服务商把 content 返回成对象/数组，先序列化再交给解析器，避免出现 [object Object]
    const content = typeof raw === 'string' ? raw : raw ? JSON.stringify(raw) : ''
    const usage = data?.usage || {}
    return {
      ok: true,
      content,
      parsed: parseReply(content),
      model: body.model,
      usage: { in: usage.prompt_tokens || 0, out: usage.completion_tokens || 0 }
    }
  } catch (e) {
    const cause = e?.cause?.code || e?.cause?.message || ''
    const msg =
      e?.name === 'AbortError'
        ? `请求超时（${Math.round(timeoutMs / 1000)}s）`
        : `${e?.message || String(e)}${cause ? `（${cause}）` : ''}`
    return { ok: false, error: msg }
  } finally {
    clearTimeout(timer)
  }
}

/** 设置页「测试连接」用：发一句最短的话验证 key / 模型 / 网络 */
export async function test(payload = {}) {
  const res = await chat({
    ...payload,
    messages: [{ role: 'user', content: '只回复两个字：你好' }],
    maxTokens: 20,
    timeoutMs: 20000
  })
  if (!res.ok) return res
  return { ok: true, content: res.parsed?.reply || res.content, model: res.model }
}

export { DEFAULTS }
