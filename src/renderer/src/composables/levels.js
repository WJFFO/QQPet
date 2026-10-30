/**
 * 等级与成长值（渲染层共享）—— 原版 QQ 宠物官方成长值表
 *
 * 原版「成长值是决定等级的唯一因素」，没有「经验」这个指标：
 * 等级 = 累计成长值落在表里的哪一档。表里的数字是「到达该等级所需的累计成长值」。
 *   1 级 1、2 级 3、3 级 6、4 级 11、5 级 18、10 级 106、15 级 325、
 *   20 级 737、22 级 970、30 级 2393、40 级 5575
 * 成长速度用原版后期的公示值：基础 200 点/小时，心情好再加成——
 *   兴奋 900~1000 → 260 点/小时（+30%）
 *   高兴 600~899  → 220 点/小时（+10%）
 *   低落/郁闷/平静 → 200 点/小时（无加成）
 * 注意这里的 260/220 已经含心情加成，所以在线结算时不再乘一次倍率。
 */

/** index = 等级 - 1，值 = 到达该等级所需的累计成长值（原版官方表） */
export const CUM_EXP = [
  1, 3, 6, 11, 18, 28, 42, 59, 80, 106, 137, 174, 217, 267, 325, 390, 463, 545, 636, 737, 848, 970,
  1104, 1249, 1406, 1576, 1759, 1956, 2167, 2393, 2635, 2892, 3165, 3455, 3762, 4087, 4430, 4792,
  5174, 5575
]

/** 等级上限（原版共 100 级，官方成长值表只给到 40 级，后面按 +200 递增） */
export const MAX_LEVEL = CUM_EXP.length

/** 到达该等级的累计成长值；超过上限按上限算 */
export function levelBaseExp(level) {
  const lv = Math.max(1, Math.min(Math.round(Number(level) || 1), MAX_LEVEL))
  return CUM_EXP[lv - 1]
}

/** 由累计成长值反查等级（原版唯一升级依据） */
export function levelFromTotal(total) {
  const t = Math.max(0, Number(total) || 0)
  let lv = 1
  for (let i = 0; i < CUM_EXP.length; i++) {
    if (t >= CUM_EXP[i]) lv = i + 1
    else break
  }
  return lv
}

/** 升到下一级还差多少成长值；已满级返回 0 */
export function expToNext(total) {
  const lv = levelFromTotal(total)
  if (lv >= MAX_LEVEL) return 0
  return Math.max(0, CUM_EXP[lv] - Math.max(0, Number(total) || 0))
}

/** 当前等级内的进度 0~1（用于进度条） */
export function levelProgress(total) {
  const t = Math.max(0, Number(total) || 0)
  const lv = levelFromTotal(t)
  if (lv >= MAX_LEVEL) return 1
  const base = CUM_EXP[lv - 1]
  const next = CUM_EXP[lv]
  const span = next - base
  if (span <= 0) return 1
  return Math.max(0, Math.min(1, (t - base) / span))
}

/**
 * 在线成长速度（成长值/小时）——原版心情三档。
 * 打工时心情会被压在中档（原版打工心情上限 600），按 220 点/小时结算。
 */
export function onlineGrowRate(moodVal, working = false) {
  const m = Number(moodVal) || 0
  const eff = working ? Math.min(m, 600) : m
  if (eff >= 900) return 260
  if (eff >= 600) return 220
  return 200
}
