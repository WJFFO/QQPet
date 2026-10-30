/**
 * AI 配置与宠物人设（渲染层共享）
 *
 * 配置不再区分服务商：只认「接口地址 + API Key + 模型名称」，任何 OpenAI 兼容
 * 的 /chat/completions 服务都能接（DeepSeek / MiniMax / 通义 / Kimi / OpenRouter / 本地 Ollama…）。
 * 存 localStorage.qqpet.ai：
 *   { baseUrl, apiKey, model, persona, autoTalk, autoTalkMin }
 */

export const AI_DEFAULT_BASE = 'https://api.deepseek.com/v1'
export const AI_DEFAULT_MODEL = 'deepseek-chat'

// 老版本按 provider 存的配置：读不到 baseUrl 时按它迁移，避免升级后突然不通
const LEGACY = {
  deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  minimax: { baseUrl: 'https://api.minimax.io/v1', model: 'MiniMax-M2.5' }
}

// 老版本预设的人设文案里写着「自称本座/吾」，模型会照着演，读到就悄悄换成新版
const LEGACY_PERSONA = {
  '中二病小企鹅。自称“本座”“吾”，把吃饭睡觉说成修炼与结界，认真地把日常当冒险，语气夸张但内心很软。':
    '中二病小企鹅。把吃饭睡觉说成修炼与结界，认真地把日常当冒险，语气夸张、爱用「封印」「觉醒」这类词，但内心很软。'
}

export function readAiConfig() {
  let raw = {}
  try {
    raw = JSON.parse(localStorage.getItem('qqpet.ai') || '{}') || {}
  } catch {
    raw = {}
  }
  const legacy = raw.provider ? LEGACY[raw.provider] : null
  const baseUrl = String(raw.baseUrl || '').trim() || legacy?.baseUrl || AI_DEFAULT_BASE
  const model = String(raw.model || '').trim() || legacy?.model || AI_DEFAULT_MODEL
  const min = Number(raw.autoTalkMin)
  const personaRaw = String(raw.persona || '')
  return {
    baseUrl,
    model,
    apiKey: String(raw.apiKey || ''),
    persona: LEGACY_PERSONA[personaRaw] || personaRaw,
    autoTalk: !!raw.autoTalk,
    autoTalkMin: Math.min(180, Math.max(1, Number.isFinite(min) && min ? min : 20))
  }
}

export function saveAiConfig(cfg) {
  localStorage.setItem(
    'qqpet.ai',
    JSON.stringify({
      baseUrl: String(cfg.baseUrl || '').trim(),
      model: String(cfg.model || '').trim(),
      apiKey: String(cfg.apiKey || ''),
      persona: String(cfg.persona || ''),
      autoTalk: !!cfg.autoTalk,
      autoTalkMin: Math.min(180, Math.max(1, Number(cfg.autoTalkMin) || 20))
    })
  )
}

/**
 * 主动搭话间隔（毫秒）。范围 1~180 分钟
 * 用户填 1 会被静默夹成 3，看起来像“设置没生效”。
 * 状态告急（饿/脏/病/心情低）时最多 3 分钟就开口一次。
 */
export function autoTalkGapMs(min, urgent) {
  const gapMin = Math.min(180, Math.max(1, Number(min) || 20))
  return (urgent ? Math.min(gapMin, 3) : gapMin) * 60 * 1000
}

/**
 * 预设人设。text 直接写进系统提示词的「性格」位置，
 * 所以写成第三人称的性格描述，而不是给用户看的标签。
 */
export const PERSONA_PRESETS = [
  {
    key: 'cute',
    label: '俏皮黏人',
    text: '俏皮、黏人、爱撒娇的小企鹅。说话带语气词（呀、啦、嘛），喜欢被摸头，动不动就想要抱抱，偶尔会故意耍小性子讨关注。'
  },
  {
    key: 'tsundere',
    label: '傲娇嘴硬',
    text: '傲娇的小企鹅。嘴上嫌弃主人、说反话（“才、才不是想你呢”），其实很在意对方；被夸会嘴硬但心情变好，关心人的时候会用别扭的说法。'
  },
  {
    key: 'genki',
    label: '元气活力',
    text: '元气满满的运动型小企鹅。说话快、爱用感叹号，精力过剩，总想拉着主人一起玩、一起出门，遇到什么都觉得新鲜。'
  },
  {
    key: 'gentle',
    label: '温柔治愈',
    text: '温柔体贴的小企鹅。语速慢、用词软，会察觉主人的情绪，累了会轻声安慰、提醒休息；很少抱怨，饿了困了也只是小声说。'
  },
  {
    key: 'nerd',
    label: '学霸助教',
    text: '一本正经的学霸小企鹅。喜欢讲冷知识、提醒主人学习打卡，会把日常小事解释成原理，偶尔冒出公式和术语，但说人话、不枯燥。'
  },
  {
    key: 'snark',
    label: '毒舌吐槽',
    text: '嘴毒心软的吐槽型小企鹅。喜欢调侃主人的作息和拖延，句子短、反应快、带点网络梗，但不会真的伤人，吐槽完总会补一句关心。'
  },
  {
    key: 'chunibyo',
    label: '中二幻想',
    text: '中二病小企鹅。把吃饭睡觉说成修炼与结界，认真地把日常当冒险，语气夸张、爱用「封印」「觉醒」这类词，但内心很软。'
  }
]

export const PERSONA_CUSTOM = { key: 'custom', label: '自定义', text: '' }

// 默认人设 = 第一个预设
export const PERSONA_DEFAULT = PERSONA_PRESETS[0].text

/** 当前人设文本命中的预设（否则算自定义） */
export function matchPersona(text) {
  const t = String(text || '').trim()
  if (!t) return PERSONA_PRESETS[0]
  return PERSONA_PRESETS.find((p) => p.text === t) || PERSONA_CUSTOM
}

/** 给系统提示词用的人设描述（空则回落到默认） */
export function personaText(text) {
  const t = String(text || '').trim()
  return t || PERSONA_DEFAULT
}

/**
 * 自称归一化：历史消息里若出现「本座/吾辈/老夫」这类自称，模型会当成范例照抄，
 * 换了人设也改不掉。喂给模型前统一换成「我」——界面上的聊天记录保持原样，
 * 洗的只是上下文。称呼统一了，性格怎么换都不会冒出「本座」。
 */
export function normalizeSelfRef(text) {
  return String(text || '').replace(/本座|本尊|吾辈|老夫|朕|寡人/g, '我')
}

/** 通用的自称规则，所有性格都适用 */
export const SELF_REF_RULE =
  '称呼规则：不管什么性格，说自己的时候一律用「我」，称呼主人用「你」。禁止使用本座、本尊、吾、吾辈、老夫、朕这类自称；历史消息里如果出现过，那是过去的错，不要跟着学。'

/**
 * 改名同步：宠物名、主人称呼改过之后，聊天历史和记忆摘要里仍然留着旧名字，
 * 模型照着旧名字叫，看起来就像改名没生效。这里把喂给模型的文本里的旧名字
 * 换成新的——界面上的记录保持原样，洗的只是上下文（和 normalizeSelfRef 一个思路）。
 */
const NAME_PREV_MAX = 6

/** 改名时调用：把旧名字记进名单，供 normalizeNames 之后替换 */
export function rememberPrevName(prevKey, oldName) {
  const old = String(oldName || '').trim()
  if (old.length < 2) return // 单字旧名做全局替换会误伤正常文字
  let list = []
  try {
    const raw = JSON.parse(localStorage.getItem(prevKey) || '[]')
    if (Array.isArray(raw)) list = raw
  } catch {
    list = []
  }
  if (list.includes(old)) return
  list.push(old)
  try {
    localStorage.setItem(prevKey, JSON.stringify(list.slice(-NAME_PREV_MAX)))
  } catch {
    /* 配额满时忽略：不影响改名本身 */
  }
}

/** 把文本里出现过的旧名字换回现在的名字 */
export function normalizeNames(text) {
  let s = String(text || '')
  const pairs = [
    [localStorage.getItem('qqpet.name'), 'qqpet.namePrev'],
    [localStorage.getItem('qqpet.owner'), 'qqpet.ownerPrev']
  ]
  for (const [curRaw, prevKey] of pairs) {
    const cur = String(curRaw || '').trim()
    if (!cur) continue
    let prev = []
    try {
      const raw = JSON.parse(localStorage.getItem(prevKey) || '[]')
      if (Array.isArray(raw)) prev = raw
    } catch {
      continue
    }
    for (const p of prev) {
      const old = String(p || '').trim()
      // 长度 < 2 的旧名跳过：一个字的替换会把正常句子改坏
      if (old.length >= 2 && old !== cur) s = s.split(old).join(cur)
    }
  }
  return s
}

/**
 * 最近发生的照顾动作（喂食 / 洗澡 / 治病 / 玩耍）。
 *
 * 这些动作发生在宠物窗口，聊天窗只能读到 localStorage 里的数值——
 * 「饱食 100」模型是看得到的，但它不知道「这是主人刚喂的」，
 * 而历史里上一句往往还留着「我好饿」，于是喂完照样喊饿。
 * 所以把动作本身也记下来，随系统提示词一起交给模型。
 */
const ACT_KEY = 'qqpet.ai.acts'
const ACT_MAX = 8
const ACT_FRESH_MS = 30 * 60 * 1000 // 只把半小时内发生的算「刚才」

const ACT_TEXT = {
  // 只陈述「喂过」，不判断吃没吃饱：一份小零食 +130、上限 1080，
  // 吃完照样可能是「很饿」，断言吃饱会和状态打架
  eat: (d) => `主人刚喂我吃了${d}`,
  // 一次洗澡按原版只洗一部分（+180 / 上限 720），所以这里只说「洗了」，
  // 不再断言「一点都不痒」——有没有洗干净由当前清洁档位决定
  clean: (d) => `主人刚用${d}给我洗了澡`,
  cure: (d) => `主人刚给我吃了${d}，病已经好了`,
  play: () => '主人刚陪我玩了一会儿',
  interact: () => '主人刚摸了摸我、逗了我一下',
  work: () => '主人刚安排我去打工了',
  study: () => '主人刚安排我去上课了',
  sleep: () => '我刚睡了一觉'
}

/**
 * 记一条照顾动作。kind 见 ACT_TEXT，detail 一般是物品名。
 * minGapMs > 0 时，同类动作在这个间隔内只记一次——点击互动、玩耍这类
 * 高频操作如果不节流，会把喂食/治病这些关键记录挤出队列。
 */
export function recordAct(kind, detail, minGapMs = 0) {
  if (!ACT_TEXT[kind]) return
  let list = []
  try {
    const raw = JSON.parse(localStorage.getItem(ACT_KEY) || '[]')
    if (Array.isArray(raw)) list = raw
  } catch {
    list = []
  }
  if (minGapMs > 0) {
    const last = [...list].reverse().find((a) => a && a.kind === kind)
    if (last && Date.now() - Number(last.at || 0) < minGapMs) return
  }
  list.push({ kind, detail: String(detail || ''), at: Date.now() })
  try {
    localStorage.setItem(ACT_KEY, JSON.stringify(list.slice(-ACT_MAX)))
  } catch {
    /* 配额满时忽略：动作记录只是锦上添花，不能影响主流程 */
  }
}

/** 把最近的动作拼成人话，给系统提示词用。maxAge 可覆盖默认的半小时窗口。 */
export function recentActsText(maxAge = ACT_FRESH_MS) {
  let list = []
  try {
    const raw = JSON.parse(localStorage.getItem(ACT_KEY) || '[]')
    if (Array.isArray(raw)) list = raw
  } catch {
    return ''
  }
  const now = Date.now()
  const fresh = list.filter((a) => a && ACT_TEXT[a.kind] && now - Number(a.at || 0) <= maxAge)
  if (!fresh.length) return ''
  // 同一件事只提一次（喂了三顿不必说三遍），倒序遍历保持「最近的在前」
  const seen = new Set()
  const rows = []
  for (const a of [...fresh].reverse()) {
    const text = ACT_TEXT[a.kind](a.detail || '东西')
    if (seen.has(text)) continue
    seen.add(text)
    rows.push({ kind: a.kind, text })
  }
  // 吃/洗/治会改变状态、最容易和对话冲突，优先保留；玩耍、点击这类排后面，
  // 免得点几下宠物就把「刚喂过」挤出上下文
  const weight = (k) => (k === 'eat' || k === 'clean' || k === 'cure' ? 0 : 1)
  rows.sort((a, b) => weight(a.kind) - weight(b.kind))
  return rows.slice(0, 4).map((r) => r.text).join('\n')
}
