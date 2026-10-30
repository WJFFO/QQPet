/**
 * 宠物属性衰减（纯函数，方便单测）—— 按原版 QQ 宠物的每分钟速率
 *
 * 速率（原版百科「成长消耗」+ 状态说明）：
 *   - 饥饿 2 点/分钟、清洁 2 点/分钟；打工时饥饿 4、清洁 3（每小时多花 10 元宝）
 *   - 心情 2 点/分钟；饥饿或清洁变黄还不管，掉到 15 点/分钟以上
 *   - 健康：饥饿/清洁/心情任一黄色时 -2 点/分钟，全部恢复正常后 +1 点/分钟
 *   - 疲劳：打工 +4/分钟、学习 +1/分钟、空闲恢复 16/分钟；≥300 再额外扣 2 点健康/分钟
 *   - 生病：每分钟掷一次骰，健康越底概率越高（sickChance）；病了不吃药会持续恶化
 *
 * 实现要点：
 * 1) 按「真实经过的毫秒」累计，不按 tick 次数——窗口隐藏时 Chromium 会把定时器降频。
 * 2) 用加权毫秒累加器（打工时权重更大），周期不必整除 tick。
 * 3) 单次补算上限 60 秒，合盖休眠回来不会一口气掉一大截。
 * 4) 见底就清空累加器，避免「刚补满又立刻掉一点」。
 */

import {
  FATIGUE_BAD,
  MAX,
  RATE,
  WORK_MULT,
  isHungerYellow,
  isCleanYellow,
  isMoodYellow,
  sickChance,
  clamp
} from './stats'

export const DECAY = {
  tickMs: 1000,
  maxCatchUpMs: 60 * 1000
}

export function emptyAcc() {
  return { hunger: 0, clean: 0, health: 0, mood: 0, healthUp: 0, fatigue: 0, sickRoll: 0 }
}

/**
 * 推进一次衰减。
 * @param {{hunger:number, clean:number, health:number, mood:number, fatigue?:number, sick?:boolean}} state 当前值（不修改）
 * @param {object} acc 累加器（原地修改）
 * @param {number} elapsedMs 距上次的真实毫秒数
 * @param {{working?:boolean, studying?:boolean, rng?:() => number}} opts
 *   working/studying 决定疲劳涨还是恢复；rng 可注入固定随机数，便于测试
 * @returns 新属性（绝对值，已按上限裁剪）+ gotSick（本次是否刚生病）
 */
export function stepDecay(state, acc, elapsedMs, opts = {}) {
  const dt = Math.max(0, Math.min(Number(elapsedMs) || 0, DECAY.maxCatchUpMs))
  const sick = !!state.sick
  const next = {
    hunger: clamp(state.hunger, MAX.hunger),
    clean: clamp(state.clean, MAX.clean),
    health: clamp(state.health, MAX.health),
    mood: clamp(state.mood, MAX.mood),
    fatigue: clamp(state.fatigue, MAX.fatigue),
    // 回传生病标记：调用方要能把新状态直接喂给下一次结算
    sick
  }
  const MIN = 60 * 1000
  if (dt <= 0) return { ...next, gotSick: false }

  const working = !!opts.working
  const studying = !!opts.studying
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random

  // 饥饿 / 清洁：打工时权重更高，等价于更快的每分钟消耗
  acc.hunger += dt * (working ? WORK_MULT.hunger : 1)
  acc.clean += dt * (working ? WORK_MULT.clean : 1)
  while (acc.hunger >= MIN && next.hunger > 0) {
    acc.hunger -= MIN
    next.hunger = Math.max(0, next.hunger - RATE.hunger)
  }
  while (acc.clean >= MIN && next.clean > 0) {
    acc.clean -= MIN
    next.clean = Math.max(0, next.clean - RATE.clean)
  }

  // 心情：只看饥饿/清洁是否变黄（心情自己低不算，否则会自我加速到底）
  const dirtyBad = isHungerYellow(next.hunger) || isCleanYellow(next.clean)
  acc.mood += dt
  while (acc.mood >= MIN && next.mood > 0) {
    acc.mood -= MIN
    next.mood = Math.max(0, next.mood - (dirtyBad ? RATE.moodBad : RATE.mood))
  }

  // 疲劳：打工涨 4/分、学习涨 1/分、闲着恢复 16/分。
  // 逐分钟结算，不足一分钟的余量留在 acc.fatigue 里，恢复和累积共用同一个累加器。
  const fatRate = working ? RATE.fatigueWork : studying ? RATE.fatigueStudy : -RATE.fatigueRest
  acc.fatigue += dt
  while (acc.fatigue >= MIN) {
    acc.fatigue -= MIN
    const v = next.fatigue + fatRate
    next.fatigue = clamp(v, MAX.fatigue)
  }
  // 已经见底/封顶就不再攒时间，避免「刚恢复完又多攒一分钟」
  if (next.fatigue <= 0 && fatRate < 0) acc.fatigue = 0
  if (next.fatigue >= MAX.fatigue && fatRate > 0) acc.fatigue = 0

  // 健康：任一黄色（含心情低）掉 2/分钟；疲劳超标再额外掉 2/分钟；
  // 生病且没吃药时改成持续恶化（-1/分钟），喂药才会好。
  const tiredBad = next.fatigue >= FATIGUE_BAD
  const bad = dirtyBad || isMoodYellow(next.mood)
  if (sick) {
    acc.healthUp = 0
    acc.health += dt
    while (acc.health >= MIN && next.health > 0) {
      acc.health -= MIN
      next.health = Math.max(0, next.health - RATE.healthSick)
    }
  } else if (bad || tiredBad) {
    acc.healthUp = 0
    acc.health += dt
    const perMin = (bad ? RATE.healthBad : 0) + (tiredBad ? RATE.healthBad : 0)
    while (acc.health >= MIN && next.health > 0) {
      acc.health -= MIN
      next.health = Math.max(0, next.health - perMin)
    }
  } else {
    acc.health = 0
    acc.healthUp += dt
    while (acc.healthUp >= MIN && next.health < MAX.health) {
      acc.healthUp -= MIN
      next.health = Math.min(MAX.health, next.health + RATE.healthGood)
    }
  }

  // 随机生病：每分钟掷一次。已经病了就不再掷，等喂药。
  let gotSick = false
  acc.sickRoll += dt
  while (acc.sickRoll >= MIN) {
    acc.sickRoll -= MIN
    if (!sick && !gotSick && next.health > 0) {
      const p = sickChance(next.health, next.fatigue)
      if (p > 0 && rng() < p) gotSick = true
    }
  }

  // 见底/封顶后不再攒时间
  if (next.hunger <= 0) acc.hunger = 0
  if (next.clean <= 0) acc.clean = 0
  if (next.mood <= 0) acc.mood = 0
  if (next.health <= 0) acc.health = 0
  if (next.health >= MAX.health) acc.healthUp = 0

  return { ...next, gotSick }
}
