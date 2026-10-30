/**
 * 宠物属性规则 —— 全部取自原版 QQ 宠物（经典版）的公开数值
 *
 * 饥饿值 1080、清洁值 720：来自原版换算式「60 元宝食物 +240 点，占上限 240/1080」，
 *   以及「20 元宝日用品 +180 点，占 180/720」。
 * 衰减（原版百科「成长消耗」）：成长/学习/打工/休息状态下饥饿 -2/分钟、清洁 -2/分钟；
 *   打工时消耗更快，饥饿 -4/分钟、清洁 -3/分钟。
 * 心情值 0~1000，-2/分钟；饥饿或清洁变黄且不处理时掉得很快（-15/分钟以上）。
 * 健康值 0~100：饥饿、清洁、心情任一为黄色警告时 -2/分钟，全部恢复正常后 +1/分钟；
 *   疲劳 ≥300 再额外 -2/分钟（原版：打工/学习攒疲劳，累了掉健康）。
 * 疲劳值 0~600：打工 +4/分钟、学习 +1/分钟、空闲恢复 16/分钟（原版数值）。
 * 生病：原版是概率性的（健康越底越容易病，累了更容易病），这里用 sickChance 实现，
 *   健康 ≤30 作为必病的硬兜底。
 * 状态文案沿用原版档位：吃得很饱 / 不饿 / 有点饿 / 很饿，干干净净 / 好痒啊 / 蓬头垢面。
 */

export const MAX = {
  hunger: 1080,
  clean: 720,
  mood: 1000,
  health: 100,
  fatigue: 600
}

/**
 * 一份日用品 +180 清洁（原版换算「20 元宝日用品 +180 点，占 180/720」）。
 * 一次只洗四分之一，洗干净要 2~3 次。结算时固定用这个值，
 * 不看背包里旧物品存下的 value（老的香皂存档是 144/274）。
 */
export const CLEAN_PER_ITEM = 180

/** 每分钟自然衰减（原版速率） */
export const RATE = {
  hunger: 2,
  clean: 2,
  mood: 2,
  moodBad: 15,
  healthBad: 2,
  healthGood: 1,
  /** 生病且没吃药时健康继续恶化（原版是不治会死，这里只掉到 1 不会死） */
  healthSick: 1,
  /** 疲劳：打工 +4/分钟、学习 +1/分钟、空闲恢复 16/分钟（原版数值） */
  fatigueWork: 4,
  fatigueStudy: 1,
  fatigueRest: 16
}

/** 疲劳阈值：到这个值以后每分钟额外掉 2 点健康（原版） */
export const FATIGUE_BAD = 300

/** 打工时饥饿/清洁的加速倍率（原版：饥饿 4/分钟、清洁 3/分钟） */
export const WORK_MULT = {
  hunger: 2,
  clean: 1.5
}

/** 变黄阈值：低于该比例进入黄色警告（原版：饥饿 24%、清洁 48%），心情按绝对值 600 */
export const YELLOW = {
  hunger: 0.24,
  clean: 0.48,
  mood: 600
}

/** 生病阈值：健康低于该值必定生病（概率生病的兜底线，也是 UI 的硬线） */
export const SICK_AT = 30

/**
 * 每分钟随机生病的概率。
 *
 * 原版是概率生病，不是到了某个数就一定病（老玩家资料里「健康值同样低下时，
 * 武力值高的宠物生病几率低」也说明是掷骰）。这里用健康做唯一变量，疲劳做倍率：
 *   - 健康 ≥70：不会随机生病，正常养着很安全
 *   - 健康 70→30 线性升高：约 0.075%/分钟 → 3%/分钟
 *   - 疲劳 ≥300 概率 ×2，≥200 概率 ×1.4（累了更容易病）
 * 健康 ≤30 的必病由 SICK_AT 兜底，不走这个概率。
 */
export function sickChance(health, fatigue = 0) {
  const h = Number(health) || 0
  if (h >= 70) return 0
  const base = Math.min(1, (70 - h) / 40) * 0.03
  const f = Number(fatigue) || 0
  const mul = f >= FATIGUE_BAD ? 2 : f >= 200 ? 1.4 : 1
  return Math.min(1, base * mul)
}

/** 疲劳档位（0~600）。原版只规定了 300 这个掉健康的线，档位文案是我们补的 */
export function fatigueBand(v) {
  const f = Number(v) || 0
  if (f >= FATIGUE_BAD) return { key: 'exhausted', label: '累坏了' }
  if (f >= 200) return { key: 'tired', label: '有点累' }
  if (f >= 100) return { key: 'normal', label: '还行' }
  return { key: 'fresh', label: '精神很好' }
}

export function clamp(v, max) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(max, n))
}

/** 当前值占上限的比例 0~1 */
export function ratio(v, max) {
  return max > 0 ? clamp(v, max) / max : 0
}

/**
 * 老存档迁移：早期版本把饥饿/清洁存成 0~100 的百分比，
 * 换成原版绝对值（1080 / 720）时必须按比例换算，否则 80 会变成 7%。
 */
export function migrateStat(value, max) {
  const n = Number(value)
  if (!Number.isFinite(n)) return max
  return n <= 100 ? Math.round((n / 100) * max) : clamp(n, max)
}

/** 饥饿档位（原版：上限 ×0.36 吃得很饱、×0.24 不饿、×0.12 有点饿） */
export function hungerBand(v) {
  const p = ratio(v, MAX.hunger)
  if (p >= 0.36) return { key: 'full', label: '吃得很饱' }
  if (p >= 0.24) return { key: 'ok', label: '不饿' }
  if (p >= 0.12) return { key: 'hungry', label: '有点饿' }
  return { key: 'starving', label: '很饿' }
}

/** 清洁档位（原版：上限 ×0.72 干干净净、×0.48 好痒啊、×0.24 蓬头垢面） */
export function cleanBand(v) {
  const p = ratio(v, MAX.clean)
  if (p >= 0.72) return { key: 'clean', label: '干干净净' }
  if (p >= 0.48) return { key: 'ok', label: '还算干净' }
  if (p >= 0.24) return { key: 'itchy', label: '好痒啊' }
  return { key: 'dirty', label: '蓬头垢面' }
}

/** 心情档位（原版：900+ 兴奋、600+ 高兴、400+ 平静、200+ 郁闷、其余低落） */
export function moodBand(v) {
  const m = Number(v) || 0
  if (m >= 900) return { key: 'excited', label: '兴奋', mul: 1.3 }
  if (m >= 600) return { key: 'happy', label: '高兴', mul: 1.1 }
  if (m >= 400) return { key: 'calm', label: '平静', mul: 1 }
  if (m >= 200) return { key: 'down', label: '郁闷', mul: 0.9 }
  return { key: 'sad', label: '低落', mul: 0.8 }
}

/** 饥饿或清洁是否处于黄色警告（原版：变黄就会掉心情、掉健康） */
export function isHungerYellow(v) {
  return ratio(v, MAX.hunger) < YELLOW.hunger
}
export function isCleanYellow(v) {
  return ratio(v, MAX.clean) < YELLOW.clean
}
export function isMoodYellow(v) {
  return (Number(v) || 0) < YELLOW.mood
}

/** 任一属性黄色 → 健康下降、心情快速下降 */
export function anyYellow(s) {
  return isHungerYellow(s.hunger) || isCleanYellow(s.clean) || isMoodYellow(s.mood)
}
