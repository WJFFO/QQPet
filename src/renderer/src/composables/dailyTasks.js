/**
 * 每日任务 / 在线奖励（原版「每日任务」「在线奖励」两个面板的数据定义）
 * 宠物窗口负责累计进度与发奖，任务页只读展示并派发领取指令，两边共用这里的表。
 */

export const DAILY_TASKS = [
  { id: 'feed', label: '给宝贝喂食 1 次', target: 1, unit: '次', coins: 20, exp: 10 },
  { id: 'wash', label: '给宝贝洗澡 1 次', target: 1, unit: '次', coins: 20, exp: 10 },
  { id: 'workMin', label: '打工累计 10 分钟', target: 10, unit: '分钟', coins: 50, exp: 40 },
  { id: 'study', label: '送宝贝上 1 节课', target: 1, unit: '次', coins: 30, exp: 20 },
  { id: 'game', label: '陪宝贝玩 1 局小游戏', target: 1, unit: '局', coins: 30, exp: 15 }
]

// 在线奖励：按今日累计在线分钟数解锁
export const ONLINE_TIERS = [
  { id: 't10', minutes: 10, coins: 20, exp: 10 },
  { id: 't30', minutes: 30, coins: 50, exp: 30 },
  { id: 't60', minutes: 60, coins: 100, exp: 80 },
  { id: 't120', minutes: 120, coins: 200, exp: 150 }
]

export const DAILY_KEY = 'qqpet.daily'
export const ONLINE_KEY = 'qqpet.online'

/** 今天（本地时区）的 YYYY-MM-DD */
export function today() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** 读取今日任务进度；跨天自动清零 */
export function readDaily() {
  const empty = { date: today(), feed: 0, wash: 0, workMin: 0, study: 0, game: 0, claimed: [] }
  try {
    const raw = JSON.parse(localStorage.getItem(DAILY_KEY) || 'null')
    if (!raw || raw.date !== today()) return empty
    return { ...empty, ...raw, claimed: Array.isArray(raw.claimed) ? raw.claimed : [] }
  } catch (_) {
    return empty
  }
}

export function writeDaily(d) {
  localStorage.setItem(DAILY_KEY, JSON.stringify(d))
}

/** 给某个任务 +n 进度（跨天自动重置后累加） */
export function addDailyProgress(field, n = 1) {
  const d = readDaily()
  d[field] = (Number(d[field]) || 0) + n
  writeDaily(d)
  return d
}

/** 读取今日在线数据 { date, minutes, claimed[] } */
export function readOnline() {
  const empty = { date: today(), minutes: 0, claimed: [] }
  try {
    const raw = JSON.parse(localStorage.getItem(ONLINE_KEY) || 'null')
    if (!raw || raw.date !== today()) return empty
    return { ...empty, ...raw, claimed: Array.isArray(raw.claimed) ? raw.claimed : [] }
  } catch (_) {
    return empty
  }
}

export function writeOnline(o) {
  localStorage.setItem(ONLINE_KEY, JSON.stringify(o))
}
