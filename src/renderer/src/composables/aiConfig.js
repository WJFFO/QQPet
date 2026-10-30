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
  return {
    baseUrl,
    model,
    apiKey: String(raw.apiKey || ''),
    persona: String(raw.persona || ''),
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
 * 主动搭话间隔（毫秒）。范围 1~180 分钟，之前下限写死 3，
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
    text: '中二病小企鹅。自称“本座”“吾”，把吃饭睡觉说成修炼与结界，认真地把日常当冒险，语气夸张但内心很软。'
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
