import { ref, computed } from 'vue'
import {
  addDailyProgress,
  readDaily,
  writeDaily,
  readOnline,
  writeOnline,
  DAILY_TASKS,
  ONLINE_TIERS
} from './dailyTasks'
import { emptyAcc, stepDecay } from './petDecay'
import { readAiConfig, personaText, autoTalkGapMs } from './aiConfig'
import { levelFromTotal, levelBaseExp, expToNext, onlineGrowRate, MAX_LEVEL } from './levels'
import {
  MAX as STAT_MAX,
  SICK_AT,
  clamp as statClamp,
  migrateStat,
  moodBand as moodBandOf,
  hungerBand,
  cleanBand,
  isHungerYellow,
  isCleanYellow
} from './stats'

// 当前性别前缀：GG=公宠 / MM=母宠。首次登录领养时选定并持久化到 qqpet.gender。
// 用可变的模块级变量，领养后才确定，各阶段路径在调用时取当前值。
let GENDER = localStorage.getItem('qqpet.gender') || 'GG'

// 等级 → 阶段（目录前缀）。蛋期 Egg → 5级破壳 Kid → 10级 Adult
const stageFromLevel = (lvl) =>
  lvl >= 10 ? `${GENDER}/Adult` : lvl >= 5 ? `${GENDER}/Kid` : `${GENDER}/Egg`

// 升级所需成长值表统一放在 composables/levels.js（InfoView 也用同一份，避免两边不同步）。
// 跨阶段进化（5 级破壳、10 级成年）直接比较 stageFromLevel 的结果，不再单独维护阈值。

// 状态 → SWF & 文案类别。
// 动画「播放时长」不在此写死，由 FlashPlayer 读 SWF 文件头解析真实时长后 applyRealDuration 覆盖。
// swf=默认(Egg/Kid 平铺目录)文件名；adult=Adult 根目录(带序号)文件名。
const STATES = {
  stand: { swf: 'Stand.swf', bubble: null },
  eat: { swf: 'Eat1.swf', adult: 'Eat1.swf', bubble: 'Eat' },
  clean: { swf: 'Clean.swf', adult: 'Clean1.swf', bubble: 'Clean' },
  sick: { swf: 'Sick.swf', adult: 'Sick1.swf', bubble: 'SmallTalk' },
  cure: { swf: 'Cure.swf', adult: 'Cure1.swf', bubble: null },
  levup: { swf: 'LevUp.swf', adult: 'LevUp.swf', bubble: 'LevUp' },
  appear: { swf: 'Appear.swf', bubble: 'Enter' },
  enter: { swf: 'Enter1.swf', adult: 'Enter1.swf', bubble: null }, // 进场（启动播放）
  exit: { swf: 'Exit1.swf', adult: 'Exit1.swf', bubble: null },    // 离场（退出播放）
  // 原版有死亡/复活动画，这里按需求去掉死亡机制（健康归零只会生病，不会死），
  // 因此不再引用 Die.swf / Revival.swf，避免误触。
  // 仅气泡不切动画：气泡显示时长
  speak: { swf: null, bubble: 'SmallTalk', bubbleMs: 3500 }
}

// Adult 阶段"心情敏感"的素材：位于心情子目录（happy/.../xxx.swf），需拼心情路径
const MOOD_SENSITIVE = { 'Stand.swf': 1, 'Stand1.swf': 1, 'Speak.swf': 1, 'Appear.swf': 1, 'Hide.swf': 1 }

// 文件头解析失败时的安全兜底：设置一个足够长的上限避免永久卡住。
// 正常情况 FlashPlayer 会上报真实时长覆盖它，此值不会提前切走动画。
const SWF_DUR_FALLBACK = 30000

// 随机选取气泡文案：txt 多行，仅取第一行宠物说话，丢弃末尾玩家回复行
async function randomBubble(category) {
  if (!category) return null
  try {
    const files = await window.api.listTxt(category)
    if (!files.length) return null
    const file = files[Math.floor(Math.random() * files.length)]
    const raw = await window.api.readTxt(`${category}/${file}`)
    // 以换行分隔，取第一行作为宠物说话
    const firstLine = raw.split(/\r?\n/).map((l) => l.trim()).find((l) => l.length > 0)
    if (!firstLine) return null
    // [host] 占位符 → 玩家称呼（默认"主人"，后续可接真实昵称）
    return firstLine.replace(/\[host\]/g, '主人')
  } catch {
    return null
  }
}

function createPetMachine() {
  // 【临时】测试用：每次启动清空进度，方便重复体验升级/进化。测完删除本行。
   // localStorage.clear()

  // 成长值是原版决定等级的唯一因素，等级由累计成长值查表得出（原版没有「经验」这个指标）。
  const TOTAL_KEY = 'qqpet.totalExp'
  const LEVELS_V = '2'
  const totalExp = ref(
    (() => {
      const oldLevel = Math.max(1, Number(localStorage.getItem('qqpet.level')) || 1)
      if (localStorage.getItem('qqpet.levelsV') !== LEVELS_V) {
        // 换用原版成长值表：旧表累计值动辄上万（22 级 34770），直接沿用会瞬间满级。
        // 迁移时保留玩家当前等级，把成长值对齐到新表里该等级的起点。
        const guess = levelBaseExp(Math.min(oldLevel, MAX_LEVEL))
        localStorage.setItem(TOTAL_KEY, String(guess))
        localStorage.setItem('qqpet.levelsV', LEVELS_V)
        return guess
      }
      const raw = localStorage.getItem(TOTAL_KEY)
      const n = Number(raw)
      return raw !== null && Number.isFinite(n) && n >= 0 ? n : 0
    })()
  )
  const level = computed(() => levelFromTotal(totalExp.value))
  const stage = ref(stageFromLevel(level.value))

  // 属性：原版是绝对值而不是百分比——饥饿上限 1080、清洁 720、健康 100、心情 1000。
  // 老存档存的是 0~100 百分比，按比例换算一次（否则 80 会变成 7%，一上线就饿死）。
  const STATS_V = '2'
  const legacyStats = localStorage.getItem('qqpet.statsVer') !== STATS_V
  const readStat = (key, max, def) => {
    const raw = localStorage.getItem(key)
    if (raw === null) return def
    return legacyStats ? migrateStat(raw, max) : statClamp(raw, max)
  }
  const hunger = ref(readStat('qqpet.hunger', STAT_MAX.hunger, STAT_MAX.hunger))
  const clean = ref(readStat('qqpet.clean', STAT_MAX.clean, STAT_MAX.clean))
  const health = ref(readStat('qqpet.health', STAT_MAX.health, STAT_MAX.health))
  // 迁移后立刻把换算结果落盘：只写版本标记不写值的话，中途退出会留下
  // 「statsVer=2 + 旧百分比」的脏组合，下次启动就不再迁移，直接按绝对值读成 7%。
  if (legacyStats) {
    localStorage.setItem('qqpet.hunger', String(hunger.value))
    localStorage.setItem('qqpet.clean', String(clean.value))
    localStorage.setItem('qqpet.health', String(health.value))
    localStorage.setItem('qqpet.statsVer', STATS_V)
  }

  // 金币：打工获得、商店消费，localStorage 持久化（商店窗口同 partition 共享此键）。
  // 以 localStorage 为唯一数据源，避免多窗口同时改造成覆盖丢失。
  const coinsStored = localStorage.getItem('qqpet.coins')
  // 初始元宝 150；仅当从未存过键时使用默认值（避免已消耗到 0 时被误还原成 150）
  const coins = ref(coinsStored === null ? 150 : (Number(coinsStored)  || 0))
  // 首次启动时把默认 150 元宝落盘，确保商店/小游戏窗口（直接读 localStorage）读到一致的值
  if (coinsStored === null) localStorage.setItem('qqpet.coins', String(coins.value))


  // 心情值：0~1000（原版上限）。决定成长速度：≥600 每小时 2 点成长值，否则 1 点。
  // 自然衰减 -2/分钟；饥饿或清洁变黄还不管时掉到 -15/分钟以上（原版）。
  const clampMood = (v) => Math.max(0, Math.min(STAT_MAX.mood, Math.floor(Number(v) || 0)))
  const moodVal = ref(clampMood(localStorage.getItem('qqpet.moodval') ?? STAT_MAX.mood))
  // 心情档位由 stats.js 统一维护（兴奋/高兴/平静/郁闷/低落），这里只是取个短名字
  const moodBand = (mv) => moodBandOf(mv)
  // 按心情档位递增点击互动获得的心情值（兴奋只 +5，低落 +70）——原版数值
  function moodClickGain(mv) {
    if (mv >= 900) return 5
    if (mv >= 600) return 10
    if (mv >= 400) return 30
    if (mv >= 200) return 50
    return 70
  }
  // 飘字反馈（原版 float/addMood）：加心情 / 加元宝时在宠物上方飘一下
  const float = ref(null) // { id, kind: 'mood'|'money', text }
  let floatId = 0
  function showFloat(kind, text) {
    float.value = { id: ++floatId, kind, text }
  }

  // 心情增益（0~1000 标尺，原版数值）：喂食/洗澡 +20，玩耍 +20，小游戏 +50。
  // 原版心情自然衰减只有 -2/分钟，这几次互动就够撑十几分钟，配合点击互动维持高心情。
  const MOOD_GAIN = {
    feed: 20,
    clean: 20,
    play: 20,
    game: 50
  }

  function addMood(n) {
    const v = clampMood(moodVal.value + (Number(n) || 0))
    if (v !== moodVal.value) {
      moodVal.value = v
      localStorage.setItem('qqpet.moodval', String(v))
      if (n > 0) showFloat('mood', `+${n}`)
    }
  }

  // ===== 属性衰减 =====
  // 具体速率在 petDecay.js：按真实时间累计（不是 tick 取模），窗口隐藏被降频也不会变慢
  const DECAY_TICK = 1000

  // 健康为 0 也不再死亡（按需求去掉死亡机制），只会进入"生病"状态，喂药/休息可恢复；
  // 启动时若健康已是 0，给 1 点让宠物能站起来，避免卡在倒地画面。
  if (health.value <= 0) {
    health.value = 1
    localStorage.setItem('qqpet.health', '1')
  }

  // 是否已领养宠物（首次登录领养后才为 true）。未领养时不进入自动循环，等待领养。
  const adopted = ref(localStorage.getItem('qqpet.adopted') === '1')
  // 宠物昵称（领养时设定，存储于 qqpet.name）
  const petName = ref(localStorage.getItem('qqpet.name') || '')

  // 生病阈值：健康 ≤ 该值时进入生病态。
  // 生病阈值 SICK_AT 统一在 stats.js（健康 ≤30 进入生病态）。
  // 生病时不播 play 动画（全阶段）；Egg/Kid 生病时 standby 恒用 Sick.swf（不播 Stand）。
  // 注意：健康归零只会一直是生病态，不会死亡（已按需求移除死亡机制）。
  const sick = computed(() => health.value <= SICK_AT)

  // 心情（仅 Adult 生效）：以「心情值」为主决定显形表情目录，仅在健康濒危时用状态兜底。
  // 心情档位：兴奋≥900 / 高兴≥600 → happy；平静≥400 → peaceful；郁闷≥200 → sad；低落<200 → upset。
  // 饥饿/清洁过低不会立刻变脸，而是通过 statTick 让心情值随时间下降，掉到对应档位才切换表情（与设定一致）。
  const mood = ref('peaceful')
  function moodFromStats() {
    if (health.value <= 20) return 'prostrate' // 健康濒危兜底（始终最高优先）
    if (moodVal.value >= 600) return 'happy'   // 兴奋 / 高兴
    if (moodVal.value >= 400) return 'peaceful' // 平静
    if (moodVal.value >= 200) return 'sad'     // 郁闷
    return 'upset'                              // 低落
  }
  function syncMood() {
    const m = moodFromStats()
    if (m !== mood.value) mood.value = m
  }

  // 当前贴边隐藏的边缘（'left'|'right'|null）。
  // 贴边后窗口保持可见可拖离；被拖离边缘后由主进程通知回 Stand（并清空此标记）。
  const dockedEdge = ref(null)

  // 解析某阶段某状态动画的完整相对路径：
  // Adult 的"心情敏感"文件套当前心情子目录；其余动作（Eat/Clean/Sick/Cure/LevUp）用阶段根目录。
  function statePath(stage, file) {
    if (stage.endsWith('/Adult') && MOOD_SENSITIVE[file]) {
      return `assets/Action/${stage}/${mood.value}/${file}`
    }
    return `assets/Action/${stage}/${file}`
  }
  // 当前阶段下某状态动画文件（处理 Egg/Kid 与 Adult 文件名差异 + 心情目录）
  function currentStateSwf(conf) {
    const file = stage.value.endsWith('/Adult') ? (conf.adult || conf.swf) : conf.swf
    return statePath(stage.value, file)
  }

  // 当前播放的 SWF 相对路径（FlashPlayer 的 src），用当前阶段的 Stand 作为初始
  const currentSrc = ref(statePath(stage.value, 'Stand.swf'))
  const playerKey = ref(0) // 改 key 强制重建播放器
  // 气泡
  const bubble = ref({ visible: false, text: '' })

  let backTimer = null // 动作播完回 Stand 的定时器
  let adoptingFirst = false // 刚领养、正在播 First 出生动画；此期间点退出直接退出。被任何播放动作（隐藏/喂食/打工等）打断后清除，退出恢复播 Exit 动画
  let bubbleTimer = null
  let autoTimer = null
  let autoEnabled = false
  let autoResume = false // 用户手动动作播完后是否恢复自动循环
  let awaitingMeta = false // 正在等待 FlashPlayer 上报真实时长（当前动作切了新 SWF）
  let evolving = false // 正在进化中，屏蔽其它经验/动作
  let onSwfDone = null // 当前 SWF 播完后的回调（动作回 Stand 或进化切阶段）

  // —— 动画"播完才切换" --
  // animBusy=true 表示当前正有一段动作动画在播放（非 Stand 空闲），此时收到的新动作不排队、
  // 不等待、直接忽略，避免打断当前动画；当前动画播完后回到空闲，新动作即可正常执行。
  let animBusy = false

  // 持久化等级/成长值/属性
  function persistLevel() {
    localStorage.setItem('qqpet.level', String(level.value))
    localStorage.setItem(TOTAL_KEY, String(totalExp.value))
    localStorage.setItem('qqpet.hunger', String(hunger.value))
    localStorage.setItem('qqpet.clean', String(clean.value))
    localStorage.setItem('qqpet.health', String(health.value))
    localStorage.setItem('qqpet.moodval', String(moodVal.value))
  }

  let evolveTimer = null // 进化兜底定时器：不参与 clearTimers，防止进化回调被后续动作清掉后永久卡死

  function clearEvolveTimer() {
    if (evolveTimer) { clearTimeout(evolveTimer); evolveTimer = null }
  }

  function clearTimers() {
    if (backTimer) { clearTimeout(backTimer); backTimer = null }
    if (bubbleTimer) { clearTimeout(bubbleTimer); bubbleTimer = null }
  }

  // 隐藏气泡
  function hideBubble() {
    bubble.value.visible = false
    bubble.value.text = ''
  }

  // 若此前是用户手动动作且自动循环已被暂停，则在动作播完后恢复自动循环
  function maybeResumeAuto() {
    if (autoResume && !autoEnabled) {
      autoResume = false
      startAuto()
    }
  }

  // 结束当前动作：切回 Stand，或 keepSwf 时仅隐藏气泡
  function finishAction(keepSwf) {
    awaitingMeta = false
    if (!keepSwf) backToStand() // backToStand 内部会清 animBusy
    else {
      hideBubble()
      animBusy = false
      maybeResumeAuto()
    }
  }

  // FlashPlayer 上报 SWF 文件头解析出的真实时长（毫秒）：按真实播放进度触发完成回调。
  // 若解析失败（ms 无效），回退到安全兜底时长，避免永久等待。
  function applyRealDuration(ms) {
    if (!awaitingMeta) return
    awaitingMeta = false
    if (backTimer) clearTimeout(backTimer)
    const target = ms && ms > 0 ? ms : SWF_DUR_FALLBACK
    const done = onSwfDone || (() => finishAction(false))
    backTimer = setTimeout(done, target)
  }

  // 播放一个动作状态：切 SWF + 气泡，到时回 Stand
  async function play(state, opts = {}) {
    if (evolving) return // 进化动画播放中：任何普通动作都不打断它
    adoptingFirst = false // 领养动画被手动动作打断后，退出恢复播放 Exit 动画
    clearTimers()
    const conf = STATES[state]
    if (!conf) { backToStand(); return }
    const { keepSwf, user } = opts // keepSwf=true 不换 SWF（如下只能聊仅出气泡）；user=true 为手动操作

    // 用户手动动作：暂停自动循环，避免自动循环打断；记录待恢复
    if (user && autoEnabled) {
      stopAuto()
      autoResume = true
    }

    // 切 SWF（除非 keepSwf 或该状态无动画）
    if (!keepSwf && conf.swf) {
      syncMood()
      currentSrc.value = currentStateSwf(conf)
      playerKey.value++
      animBusy = true // 进入动作动画播放，期间新动作排队
      awaitingMeta = true // 等待 FlashPlayer 上报文件头解析出的真实时长
      onSwfDone = () => finishAction(false)
      // 安全兜底：仅文件头解析失败时才走到这里；正常会被 applyRealDuration 覆盖
      backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK)
    }

    // 气泡
    const text = opts.text || (await randomBubble(conf.bubble))
    if (text) {
      bubble.value.text = text
      bubble.value.visible = true
      const bubbleMs = conf.bubbleMs || 3000
      bubbleTimer = setTimeout(() => {
        bubble.value.visible = false
      }, bubbleMs)
    }

    // 仅说话、不切动画（keepSwf / speak）：按气泡时长结束本次交互
    if (keepSwf) {
      const ms = conf.bubbleMs || 2500
      backTimer = setTimeout(() => finishAction(true), ms)
    }
  }

  // 立即回到闲置态（用当前阶段的 Stand 动画；Adult 走心情子目录并可随机 Stand/Stand1）
  function backToStand() {
    studying.value = false // 学习动画中断/结束后不保持学习状态
    awaitingMeta = false
    onSwfDone = null
    clearTimers()
    hideBubble()
    syncMood()
    dockedEdge.value = null // 解除贴边隐藏标记
    animBusy = false // 已回到空闲
    const isAdult = stage.value.endsWith('/Adult')
    // Egg/Kid 生病：不播 Stand，standby 恒为 Sick（保持病态画面）
    if (!isAdult && sick.value) {
      currentSrc.value = statePath(stage.value, 'Sick.swf')
      playerKey.value++
      return
    }
    const standFile = isAdult ? (Math.random() < 0.5 ? 'Stand.swf' : 'Stand1.swf') : 'Stand.swf'
    currentSrc.value = statePath(stage.value, standFile)
    playerKey.value++
  }

  // 贴边隐藏中：鼠标移动即可打断，解除贴边回 Stand（不受动画播放门禁限制）
  function undock() {
    if (!dockedEdge.value) return
    stopAuto()
    clearTimers()
    hideBubble()
    backToStand()
    startAuto()
  }

  // 不切动画，仅显示一句气泡一段时间（设置里可关闭气泡）
  function sayUntil(text, ms = 2500) {
    if (localStorage.getItem('qqpet.bubbleOff') === '1') return
    if (bubbleTimer) clearTimeout(bubbleTimer)
    bubble.value.text = text
    bubble.value.visible = true
    bubbleTimer = setTimeout(() => { bubble.value.visible = false }, ms)
  }

  // 查看状态：气泡播报属性（按原版绝对值 + 上限）与心情
  function sayStatus() {
    const m = stage.value.endsWith('/Adult') ? mood.value : ''
    const base = `饱食 ${hunger.value}/${STAT_MAX.hunger} 清洁 ${clean.value}/${STAT_MAX.clean} 心情 ${moodVal.value}/${STAT_MAX.mood} 健康 ${health.value}/${STAT_MAX.health}`
    sayUntil(m ? `${base}（${m}）` : base, 4000)
  }

  // 播放离场 Exit 动画，播完后通知主进程退出应用
  function playExitSwf() {
    stopAuto()
    clearTimers()
    hideBubble()
    currentSrc.value = currentStateSwf(STATES.exit)
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => window.api.appQuit?.()
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 隐藏宠物：播放对应 Hide 动画。
  // - edge=null（原地隐藏，现行为）：播完隐藏窗口。
  // - edge='left'|'right'：先移窗到屏幕对应边缘（height 为拖动贴边时的鼠标高度，无则主进程随机），
  //   播完停留在边缘（可见可拖离），被拖离边缘时主进程会发 'pet-action','stand' 回来回 Stand。
  // Egg/Kid 用 Hide_left1/Hide_right1；Adult 用阶段根目录的 Hide_left/Hide_right。
  function playHide(edge, height) {
    if (evolving) return // 进化动画播放中：不响应隐藏/贴边
    adoptingFirst = false // 领养动画被隐藏打断后，退出恢复播放 Exit 动画
    stopAuto()
    clearTimers()
    hideBubble()
    const isAdult = stage.value.endsWith('/Adult')
    let file
    if (edge === 'left') file = isAdult ? 'Hide_left.swf' : 'Hide_left1.swf'
    else if (edge === 'right') file = isAdult ? 'Hide_right.swf' : 'Hide_right1.swf'
    else file = 'Hide.swf'
    currentSrc.value = statePath(stage.value, file)
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    if (edge) {
      // 贴边：播完停留 docked，等待被拖离后回 Stand
      dockedEdge.value = edge
      onSwfDone = () => { awaitingMeta = false; animBusy = false }
    } else {
      // 原地隐藏：播完真正隐藏（维持现行为）
      onSwfDone = () => { window.api.hidePet?.(); animBusy = false }
    }
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
    if (edge) window.api.moveToEdge?.(edge, height) // 先移窗到屏幕边缘（拖动贴边时与鼠标同高）
  }

  // 原版在健康归零时会播放 Die 动画并进入死亡形态，本作按需求移除死亡机制：
  // 健康只会降到 0 并长期停留在「生病」状态，喂药或休息可恢复，不存在死亡与复活。

  // 播放任意自定义动作 SWF（如 play/ 玩耍、interact/ 交互），可选气泡
  async function playCustom(folder, file, bubbleText, duration = 3000) {
    if (evolving) return // 进化动画播放中：不打断
    clearTimers()
    currentSrc.value = `assets/Action/${stage.value}/${folder}/${file}`
    playerKey.value++
    animBusy = true
    if (bubbleText) {
      bubble.value.text = bubbleText
      bubble.value.visible = true
      bubbleTimer = setTimeout(() => { bubble.value.visible = false }, Math.min(duration, 3000))
    }
    backTimer = setTimeout(() => backToStand(), duration)
  }

  // 当前阶段的 play 动画文件夹路径：Adult 走当前心情子目录，其余用阶段根目录下的 play
  function playFolderPath() {
    return stage.value.endsWith('/Adult')
      ? `assets/Action/${stage.value}/${mood.value}/play`
      : `assets/Action/${stage.value}/play`
  }

  // 随机播放当前阶段（及心情）play 文件夹下的一个 SWF，播完回 Stand。
  // 文件夹为空/缺失时不播放，直接回 Stand，避免自动循环中断。
  async function playRandomPlay() {
    if (evolving) return // 进化动画播放中：不打断
    if (sick.value) { backToStand(); return } // 生病：不播 play 动画
    syncMood()
    const folder = playFolderPath()
    let files = []
    try {
      files = await window.api.listSwf(folder.replace('assets/Action/', ''))
    } catch {
      files = []
    }
    if (!files.length) { backToStand(); return }
    const file = files[Math.floor(Math.random() * files.length)]
    clearTimers()
    hideBubble()
    currentSrc.value = `${folder}/${file}`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => finishAction(false)
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 金币增减（以 localStorage 为基准，兼容商店窗口直接改键）
  function addCoins(n) {
    const cur = Number(localStorage.getItem('qqpet.coins')) || 0
    coins.value = Math.max(0, cur + (Number(n) || 0))
    localStorage.setItem('qqpet.coins', String(coins.value))
    if (n > 0) showFloat('money', `+${n}`)
    window.api?.storageChanged?.() // 广播：商店/小游戏/背包窗口即时刷新
  }

  // —— 背包系统 ——
  // 背包存储于 localStorage 键 qqpet.inventory，结构 { [商品file]: { count, effect, value, name } }。
  // 商店购买 → 入背包；喂食/清洁/治疗动作 → 从背包消耗对应 effect 的物品。
  function inventoryGet() {
    try { return JSON.parse(localStorage.getItem('qqpet.inventory') || '{}') } catch { return {} }
  }
  // 从背包消耗一件指定 effect 的物品；没有则返回 null（消耗成功返回该物品元数据）
  function consumeItem(effect) {
    const inv = inventoryGet()
    const key = Object.keys(inv).find((k) => inv[k] && inv[k].count > 0 && inv[k].effect === effect)
    if (!key) return null
    const item = inv[key]
    item.count--
    if (item.count <= 0) delete inv[key]
    localStorage.setItem('qqpet.inventory', JSON.stringify(inv))
    window.api?.storageChanged?.() // 广播：商店/背包窗口即时刷新
    return { file: key, name: item.name, effect: item.effect, value: item.value }
  }

  // —— 打工系统 ——
  // 打工为「按时长结算」的实时会话：打工中对饥饿/清洁额外消耗（每分钟各 -2），兑换为元宝。
  // 岗位由打工页选择（不同岗位 元宝/经验 单价不同），时长支持 15 分钟 / 1 小时 / 4 小时。
  const WORK_RATE = 10 // 默认 元宝/分钟
  // 打工额外成长（每分钟）。原版成长值只由在线时长决定，打工期间本来就在线，
  // 所以这里只是很小的加成，不能盖过在线成长（原来 50/分钟 = 3000/小时，会几分钟连升好几级）。
  const WORK_EXP_RATE = 3
  const WORK_HINT_INTERVAL = 5 // 打工气泡提示间隔（分钟）
  const WORK_MIN_LEVEL = 5 // 打工等级门槛：5 级（幼年期）起
  const working = ref(false)
  const studying = ref(false)
  const workLeftSec = ref(0)
  let workRate = WORK_RATE
  let workExpRate = WORK_EXP_RATE
  let workStartAt = 0
  let workEndsAt = 0
  let workMinute = 0
  let workAccum = 0
  let workExpAccum = 0
  let workHintAt = 0
  let workOneMinHinted = false
  let studyRewardExp = 30 // 本次课程结算的经验（学习页选课决定）

  // —— 托盘状态推送 ——
  // 组装当前状态（key + 文案）：死亡 > 打工(含剩余时间) > 学习 > 生病 > 休息 > 成长 。
  // key 用于主进程切换 Tray/性别/key 下的显卡图标，text 用于 tooltip。
  // 状态变化时才通过 IPC 推送，避免每帧刷写。
  let lastTraySig = ''
  function trayStatus() {
    if (working.value) {
      const m = Math.floor(workLeftSec.value / 60)
      const s = workLeftSec.value % 60
      return { key: 'work', text: `QQ宠物 - 打工中 剩余 ${m}:${String(s).padStart(2, '0')}` }
    }
    if (studying.value) return { key: 'study', text: 'QQ宠物 - 学习' }
    if (sick.value) return { key: 'ill', text: 'QQ宠物 - 生病' }
    if (isHungerYellow(hunger.value)) return { key: 'hungry', text: 'QQ宠物 - 饿了' }
    if (isCleanYellow(clean.value)) return { key: 'dirty', text: 'QQ宠物 - 很脏' }
    if (dockedEdge.value) return { key: 'pause', text: 'QQ宠物 - 休息' }
    return { key: 'normal', text: 'QQ宠物 - 成长' }
  }
  function pushTrayStatus() {
    if (!window.api?.setTrayStatus) return
    const t = trayStatus()
    const sig = t.key + t.text
    if (sig !== lastTraySig) {
      lastTraySig = sig
      window.api.setTrayStatus(t)
    }
  }

  // 开始打工：job = { id, name, rate, exp }（由打工页选择），minutes 为时长
  function playWork(minutes = 60, job = null) {
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    if (level.value < WORK_MIN_LEVEL) { sayUntil(`要 ${WORK_MIN_LEVEL} 级以后才能打工哦～`, 2500); return }
    if (working.value) { sayUntil('已经在打工啦～', 2000); return }
    workRate = Number(job?.rate) || WORK_RATE
    workExpRate = Number(job?.exp) || WORK_EXP_RATE
    working.value = true
    workStartAt = Date.now()
    workEndsAt = Date.now() + minutes * 60000
    workMinute = 0
    workAccum = 0
    workExpAccum = 0
    workHintAt = WORK_HINT_INTERVAL
    workOneMinHinted = false
    workLeftSec.value = minutes * 60
    // 打工会话落盘：打工页/状态面板据此显示倒计时与岗位（跨窗口共享）
    localStorage.setItem(
      'qqpet.work',
      JSON.stringify({
        id: job?.id || 'default',
        name: job?.name || '打工',
        rate: workRate,
        exp: workExpRate,
        minutes,
        startAt: workStartAt,
        endsAt: workEndsAt
      })
    )
    window.api?.storageChanged?.()
    // 开始打工只弹气泡提示，不切换动画；打工期间自动状态循环照常进行
    sayUntil(`开始${job?.name || '打工'}，${minutes} 分钟后领取 ${minutes * workRate} 元宝、${minutes * workExpRate} 成长值～`, 2600)
  }

  // 提前收工：不结算、清空会话（原版打工中途停止没有收益）
  function stopWork() {
    if (!working.value) return
    working.value = false
    workLeftSec.value = 0
    workAccum = 0
    workExpAccum = 0
    localStorage.removeItem('qqpet.work')
    window.api?.storageChanged?.()
    sayUntil('收工啦，这次没干完就没有工钱哦～', 2600)
    backToStand()
    maybeResumeAuto()
  }

  // 学习：同上，播 play SWF 表现学习，播完加经验并气泡播报
  function playStudy() {
    studyRewardExp = 30
    playActivity('study')
  }

  // 上课程：course = { id, name, cost, exp }
  // 原版学习要选课程并交学费，课程越高级（小学→研究生）学费越贵、加的经验越多。
  function startStudyCourse(course) {
    if (studying.value) { sayUntil('正在上课，别打扰我～', 1800); return }
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    const cost = Number(course?.cost) || 0
    const cur = Number(localStorage.getItem('qqpet.coins')) || 0
    if (cur < cost) { sayUntil('元宝不够交学费啦，先去打工吧～', 2600); return }
    if (cost > 0) addCoins(-cost)
    studyRewardExp = Number(course?.exp) || 30
    localStorage.setItem('qqpet.lastCourse', JSON.stringify({ id: course?.id || '', name: course?.name || '课程' }))
    sayUntil(`开始上「${course?.name || '课程'}」～`, 2200)
    playActivity('study')
  }

  // 打工/学习共用逻辑：播当前阶段(及心情)play 文件夹的一个 SWF。
  // visualOnly=true 时只播开工动画、不结算（打工由打工计时到点结算）。
  // play 文件夹为空/缺失时不播动画，直接走对应结算。
  async function playActivity(kind, visualOnly = false) {
    adoptingFirst = false // 领养动画被打工/学习打断后，退出恢复播放 Exit 动画
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    if (autoEnabled) { stopAuto(); autoResume = true }

    if (!visualOnly && kind === 'study') studying.value = true
    if (!visualOnly) sayUntil(kind === 'work' ? '开始打工赚钱～' : '开始学习啦～', 2000)

    syncMood()
    const folder = playFolderPath()
    let files = []
    try {
      files = await window.api.listSwf(folder.replace('assets/Action/', ''))
    } catch {
      files = []
    }
    const settle = () => {
      if (kind === 'study') studying.value = false
      if (visualOnly) {
        backToStand()
        maybeResumeAuto()
      } else {
        reward()
        backToStand()
        maybeResumeAuto()
      }
    }
    if (files.length) {
      const file = files[Math.floor(Math.random() * files.length)]
      clearTimers()
      hideBubble()
      currentSrc.value = `${folder}/${file}`
      playerKey.value++
      animBusy = true
      awaitingMeta = true
      onSwfDone = settle
      backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
    } else {
      // 无 play 素材：不切动画，直接结算
      clearTimers()
      settle()
    }
  }

  // 学习结算（打工结算由打工计时处理）
  function reward() {
    addGrowth(studyRewardExp)
    const n = Number(localStorage.getItem('qqpet.studyCount')) || 0
    localStorage.setItem('qqpet.studyCount', String(n + 1))
    addDailyProgress('study')
    sayUntil(`学习完成，成长值 +${studyRewardExp}！`, 3000)
  }

  // 点击互动：随机播当前阶段（Adult 走心情）interact 文件夹下的 SWF，播完回 Stand。
  // 无素材/生病时不播，回退到闲聊气泡。
  async function playRandomInteract() {
    if (evolving) return // 进化动画播放中：不打断
    adoptingFirst = false // 领养动画被点击互动打断后，退出恢复播放 Exit 动画
    if (sick.value) { play('speak', { keepSwf: true, user: true }); return }
    if (autoEnabled) { stopAuto(); autoResume = true }
    syncMood()
    const folder = stage.value.endsWith('/Adult')
      ? `assets/Action/${stage.value}/${mood.value}/interact`
      : `assets/Action/${stage.value}/interact`
    let files = []
    try {
      files = await window.api.listSwf(folder.replace('assets/Action/', ''))
    } catch {
      files = []
    }
    if (!files.length) { play('speak', { keepSwf: true, user: true }); return }
    const file = files[Math.floor(Math.random() * files.length)]
    clearTimers()
    hideBubble()
    currentSrc.value = `${folder}/${file}`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => finishAction(false)
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 内部自动循环：随机进入一个状态，作为"占位核心逻辑"（后续可替换为真实 QQ 事件源）
  function startAuto() {
    startStatTick() // 属性衰减始终运行（不受手动动作暂停自动闲聊影响）
    if (autoEnabled) return
    autoEnabled = true
    const loop = async () => {
      if (!autoEnabled) return
      // 正有一段动作动画在播放/排队：自动循环延后再试，绝不打断当前动画
      if (animBusy) {
        autoTimer = setTimeout(loop, 12000 + Math.random() * 14000)
        return
      }
      const n = Math.random()
      if (n < 0.3) {
        await playRandomPlay() // 一半概率随机播 play 动画
      } else {
        play('speak', { keepSwf: true })
      }
      autoTimer = setTimeout(loop, 12000 + Math.random() * 14000)
    }
    // 首播延迟，避免刚启动/刚结束手动动作时立刻插入一个状态
    autoTimer = setTimeout(loop, 6000 + Math.random() * 6000)
  }

  function stopAuto() {
    autoEnabled = false
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null }
  }

  // 属性衰减循环：饥饿/清洁随时间下降；饥饿或清洁过低时健康也会缓慢下降。
  // 健康 ≤15 且当前空闲时播一次 Sick 动画提醒（60s 节流防刷屏）。
  let statTick = null
  let onlineSec = 0 // 本次启动以来的在线秒数（每满 60 秒写一次今日在线分钟数）
  let growSec = 0 // 在线成长计时（秒），满 60 结算一次
  let growAcc = 0 // 在线成长的小数余量：260/小时 = 4.33/分钟，取整会丢，用累加器补
  let lastDecayAt = Date.now() // 上次结算衰减的真实时间（毫秒）
  const decayAcc = emptyAcc() // 未满一个衰减周期的余量
  let lastSickAt = 0 // 以下三个提醒节流也改用真实时间戳
  let lastHungerHintAt = 0
  let lastCleanHintAt = 0
  function startStatTick() {
    if (statTick) return
    statTick = setInterval(() => {
      let dirty = false
      // 在线时长：累加到今日在线分钟数（在线奖励的依据），交给任务页读取
      onlineSec++
      if (onlineSec % 60 === 0) {
        const o = readOnline()
        o.minutes = (Number(o.minutes) || 0) + 1
        writeOnline(o)
        window.api?.storageChanged?.()
      }
      // 在线成长：原版每在线 1 小时 +1 成长值，心情 ≥600 时 +2，打工时 +1（心情被压在中档）。
      // 每分钟结算一次，小数部分留在 growAcc 里，避免取整把速率拉低。
      growSec++
      if (growSec >= 60) {
        growSec = 0
        growAcc += onlineGrowRate(moodVal.value, working.value) / 60
        const whole = Math.floor(growAcc)
        if (whole > 0) {
          growAcc -= whole
          Promise.resolve(addGrowth(whole, { raw: true })).catch(() => {})
        }
      }
      // 属性衰减：用真实经过的毫秒结算（定时器被降频时 dt 会变大，但总量仍然是准的）。
      // 打工时饥饿/清洁按原版的更快速率消耗，倍率在 petDecay 里处理。
      const nowStat = Date.now()
      const elapsed = nowStat - lastDecayAt
      lastDecayAt = nowStat
      const decayed = stepDecay(
        { hunger: hunger.value, clean: clean.value, health: health.value, mood: moodVal.value },
        decayAcc,
        elapsed,
        { working: working.value }
      )
      if (decayed.hunger !== hunger.value) { hunger.value = decayed.hunger; dirty = true }
      if (decayed.clean !== clean.value) { clean.value = decayed.clean; dirty = true }
      if (decayed.health !== health.value) { health.value = decayed.health; dirty = true }
      if (decayed.mood !== moodVal.value) {
        moodVal.value = decayed.mood
        localStorage.setItem('qqpet.moodval', String(decayed.mood))
        syncMood() // 心情跨档位时表情/站立动画跟着换
        dirty = true
      }
      // 健康归零不再触发死亡（已移除死亡机制），只会一直停留在生病状态。

      // 打工计时：累计元宝/成长值，时长到点一次性结算。
      // 饥饿/清洁的额外消耗由 stepDecay 按打工倍率结算，这里不再重复扣。
      const idle = !backTimer && !awaitingMeta && !evolving
      if (working.value) {
        workLeftSec.value = Math.max(0, Math.floor((workEndsAt - Date.now()) / 1000))
        const el = Math.floor((Date.now() - workStartAt) / 60000)
        if (el > workMinute) {
          const delta = el - workMinute
          workMinute = el
          for (let i = 0; i < delta; i++) {
            workAccum += workRate
            workExpAccum += workExpRate
          }
          addDailyProgress('workMin', delta) // 每日任务：打工累计分钟
          dirty = true
        }
        // 打工气泡提示：每 WORK_HINT_INTERVAL 分钟报一次剩余时间，最后 1 分钟单独提醒。
        // 仅在空闲（无动画播放）时弹出，避免打断当前动画。
        if (idle) {
          if (el >= workHintAt && workLeftSec.value > 60) {
            sayUntil(`打工中，还剩 ${Math.ceil(workLeftSec.value / 60)} 分钟～`, 2500)
            workHintAt += WORK_HINT_INTERVAL
          } else if (workLeftSec.value > 0 && workLeftSec.value <= 60 && !workOneMinHinted) {
            workOneMinHinted = true
            sayUntil('马上要下班啦！', 2500)
          }
        }
        if (Date.now() >= workEndsAt) {
          working.value = false
          workLeftSec.value = 0
          const amt = workAccum
          const expAmt = workExpAccum
          workAccum = 0
          workExpAccum = 0
          localStorage.removeItem('qqpet.work')
          addCoins(amt)
          addGrowth(expAmt) // 打工成长值随元宝一并结算，享受心情成长加成
          sayUntil(`打工完成，获得 ${amt} 元宝、成长值 +${expAmt}！`, 3200)
          backToStand()
          maybeResumeAuto()
          dirty = true
        }
      }

      // 空闲时的"提醒主人"动作（仅气泡提示；素材库无专用"饿/痒"SWF）。
      // 优先级：生病 > 饥饿 > 脏；各自节流避免刷屏。
      if (idle) {
        const nowHint = Date.now()
        if (health.value <= SICK_AT && nowHint - lastSickAt >= 40 * 1000) { // 健康低于阈值 → 触发"生病"提醒动画
          lastSickAt = nowHint
          play('sick', { user: false })
          dirty = false
        } else if (isHungerYellow(hunger.value) && nowHint - lastHungerHintAt >= 45 * 1000) { // 饿了 → 提示喂食
          lastHungerHintAt = nowHint
          sayUntil('好饿呀，主人快喂喂我～', 3500)
        } else if (isCleanYellow(clean.value) && nowHint - lastCleanHintAt >= 45 * 1000) { // 脏了 → 提示洗澡（挠痒）
          lastCleanHintAt = nowHint
          sayUntil('脏死了好痒，快帮我洗个澡吧～', 3500)
        }
      }
      if (dirty) persistLevel()
      maybeNotice() // 桌面公告：饥饿/生病/在线奖励可领时提醒（30 分钟节流）
      maybeAutoTalk() // AI 主动搭话（间隔由设置决定，状态告急时提前）
      pushTrayStatus() // 每秒刷新托盘状态文案（含死亡/打工剩余时间）
    }, DECAY_TICK)
  }

  // —— AI 情绪 → 心情值 + 情绪动作 ——
  // delta：对话本身对心情值的影响（0~1000 制）；moodDir：成年期心情素材子目录；
  // gesture：'interact' 小动作 / 'play' 大动作 / '' 只站着（不额外播）。
  const AI_EMOTION = {
    happy: { delta: 80, moodDir: 'happy', gesture: 'interact' },
    excited: { delta: 120, moodDir: 'happy', gesture: 'play' },
    shy: { delta: 50, moodDir: 'happy', gesture: 'interact' },
    love: { delta: 90, moodDir: 'happy', gesture: 'interact' },
    sad: { delta: -90, moodDir: 'sad', gesture: 'interact' },
    angry: { delta: -120, moodDir: 'upset', gesture: 'interact' },
    hungry: { delta: -40, moodDir: 'upset', gesture: 'interact' },
    sleepy: { delta: -30, moodDir: 'peaceful', gesture: '' },
    normal: { delta: 10, moodDir: '', gesture: 'interact' }
  }

  // 气泡只显示前 n 个字，避免长回复糊住宠物（完整内容在聊天窗）
  function clipText(text, n) {
    const t = String(text || '').replace(/\s+/g, ' ').trim()
    return t.length > n ? `${t.slice(0, n)}…` : t
  }

  // 按情绪播一段手势动画：成年期走「心情子目录」，幼年期走 Interact / play
  async function playEmotionGesture(emotion) {
    const cfg = AI_EMOTION[emotion]
    if (!cfg || !cfg.gesture || animBusy) return
    if (stage.value.endsWith('/Egg')) return // 蛋期没有互动素材
    const isAdult = stage.value.endsWith('/Adult')
    const dir = isAdult
      ? `Action/${stage.value}/${cfg.moodDir || mood.value}/${cfg.gesture}`
      : `Action/${stage.value}/${cfg.gesture === 'play' ? 'play' : 'Interact'}`
    let files = []
    try {
      files = await window.api.listFiles(dir, 'swf')
    } catch {
      files = []
    }
    if (!files.length) return
    const pick = files[Math.floor(Math.random() * files.length)]
    clearTimers()
    currentSrc.value = `assets/${dir}/${pick}`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    onSwfDone = () => finishAction(false)
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK)
  }

  // AI 一句话的统一落地：气泡 → 心情值 → 动作（指定动作优先，否则按情绪挑手势）
  function applyAiReply({ text = '', action = '', emotion = '', mood = 0, gesture = true }) {
    const emo = AI_EMOTION[emotion] || null
    const line = clipText(text, 26)
    if (line) sayUntil(line, Math.min(9000, 2400 + line.length * 140))

    const delta = Number(mood) ? Number(mood) * 10 : emo ? emo.delta : 0
    if (delta) {
      addMood(delta)
      syncMood()
    }

    if (action) {
      setTimeout(() => dispatch(action), 900)
      return
    }
    if (gesture && emo && emo.gesture) {
      setTimeout(() => playEmotionGesture(emotion), 900)
    }
  }

  // —— AI 主动搭话 ——
  // 由当前状态驱动：饿/脏/病/心情低时更频繁开口（最短 3 分钟一次），
  // 平时按设置里的间隔（qqpet.ai.autoTalkMin，默认 20 分钟）。
  // 让模型回 JSON（只要 reply + emotion），这样主动说话也能带对应心情动画。
  let lastAutoTalkAt = Date.now() // 启动后先按正常间隔等，不要一开机就开口
  let autoTalking = false

  // 统一走 aiConfig 读取（老 provider 配置会自动迁移成 baseUrl/model）
  function readAiCfg() {
    const cfg = readAiConfig()
    return cfg.apiKey ? cfg : null
  }

  // 当前最需要被关注的状态（决定开口频率与话题）
  function urgentState() {
    if (isHungerYellow(hunger.value)) return 'hungry'
    if (isCleanYellow(clean.value)) return 'dirty'
    if (health.value <= 50) return 'sick'
    if (moodVal.value <= 300) return 'sad'
    return ''
  }

  async function maybeAutoTalk() {
    const cfg = readAiCfg()
    if (!cfg || !cfg.autoTalk || !cfg.apiKey) return
    if (autoTalking || working.value) return

    const urge = urgentState()
    // 间隔 1~180 分钟，状态告急时最多 3 分钟一次
    const gapMs = autoTalkGapMs(cfg.autoTalkMin, !!urge)
    if (Date.now() - lastAutoTalkAt < gapMs) return

    lastAutoTalkAt = Date.now()
    autoTalking = true
    try {
      // 带上 L1 摘要 + L2 档案 + 少量最近原文，否则主动开口每次都像第一次见面
      const ctx = await window.api.memContext?.(8)
      const memParts = []
      if (ctx?.impression) memParts.push(`更早以前：${ctx.impression}`)
      if (ctx?.summary) memParts.push(`最近聊过：\n${ctx.summary}`)
      if (ctx?.facts) memParts.push(`你记着的事：\n${ctx.facts}`)
      const memText = memParts.join('\n')

      const res = await window.api.aiChat({
        apiKey: cfg.apiKey,
        baseUrl: cfg.baseUrl,
        model: cfg.model,
        maxTokens: 120,
        messages: [
          {
            role: 'system',
            content: [
              `你是桌面宠物「${petName.value || '宝贝'}」，主人叫「${localStorage.getItem('qqpet.owner') || localStorage.getItem('qqpet.savedQq') || '主人'}」。`,
              `性格设定：${personaText(cfg.persona)}`,
              memText ? `【你的记忆】\n${memText}\n聊到相关的事可以顺口提一句，显得你记得。` : '',
              '主人这会儿没在跟你说话，你要主动开口，说话要符合上面的性格。',
              '只输出一个 JSON：{"reply":"一句话","emotion":"情绪"}，不要 action 字段，不要代码块和任何解释。',
              'reply 控制在 18 字以内，口语化，可以撒娇、抱怨、炫耀、求关注。',
              'emotion 只能从 happy / excited / shy / sad / angry / hungry / sleepy / normal 里选一个，要和这句话的语气一致。'
            ]
              .filter(Boolean)
              .join('\n')
          },
          ...(ctx?.history || []),
          {
            role: 'user',
            content: `当前：等级 ${level.value}，饱食 ${hunger.value}/${STAT_MAX.hunger}（${hungerBand(hunger.value).label}），清洁 ${clean.value}/${STAT_MAX.clean}（${cleanBand(clean.value).label}），健康 ${health.value}/100，心情 ${moodVal.value}/1000（${moodBand(moodVal.value).label}），元宝 ${coins.value}。${
              urge ? `现在最要紧的是「${urge}」，开口就往这上面说。` : '状态还行，随便说点什么。'
            }`
          }
        ]
      })
      if (res?.ok && res.parsed?.reply) {
        applyAiReply({ text: res.parsed.reply, emotion: res.parsed.emotion, mood: 0, gesture: true })
        // 主动说的话也要进历史，否则聊天窗里看不到宠物自己开口的内容
        window.api.memAppend?.({
          role: 'pet',
          text: res.parsed.reply,
          src: 'auto',
          emotion: res.parsed.emotion || ''
        })
        Promise.resolve(
          window.api.memCompact?.({ apiKey: cfg.apiKey, baseUrl: cfg.baseUrl, model: cfg.model })
        ).catch(() => {})
      } else if (res?.ok && res.content && !/^\s*[{[]/.test(res.content)) {
        // 兜底只在纯文本时用；以 { 开头的视为没解析成功的 JSON，宁可不说话
        sayUntil(clipText(res.content, 26), 4200)
      } else if (!res?.ok) {
        onAutoTalkFail(gapMs, res?.error || '请求失败')
      }
    } catch (e) {
      onAutoTalkFail(gapMs, e?.message || '网络异常')
    }
    autoTalking = false
  }

  // 主动搭话失败：别静默（否则用户只看到“不说话”），一小时提示一次原因；
  // 同时把下次重试提前到 1 分钟后，避免一次网络抖动要等满整个间隔。
  let lastAutoTalkErrAt = 0
  function onAutoTalkFail(gapMs, reason) {
    lastAutoTalkAt = Date.now() - gapMs + 60 * 1000
    if (Date.now() - lastAutoTalkErrAt < 60 * 60 * 1000) return
    lastAutoTalkErrAt = Date.now()
    sayUntil(clipText(`呜…连不上模型（${reason}）`, 34), 5000)
  }

  // —— 桌面提醒（原版 DeskNotice 公告窗）——
  // 与气泡不同，这是一个独立小窗，用于"离开一会儿回来"的场景；30 分钟最多一次，
  // 设置页「桌面提醒」可关。优先级：生病 > 饿了 > 脏了 > 在线奖励可领。
  let lastNoticeAt = 0
  const NOTICE_GAP = 30 * 60 * 1000
  function maybeNotice() {
    if (working.value) return
    if (localStorage.getItem('qqpet.noticeOff') === '1') return
    if (Date.now() - lastNoticeAt < NOTICE_GAP) return
    let text = ''
    if (health.value <= SICK_AT) text = '宝贝好像生病了，快去商店买点药，别让它硬扛着～'
    else if (isHungerYellow(hunger.value)) text = '宝贝肚子饿得咕咕叫了，右键喂点东西吃吧～'
    else if (isCleanYellow(clean.value)) text = '宝贝身上脏脏的，快帮它洗个澡吧～'
    else {
      const o = readOnline()
      const next = ONLINE_TIERS.find((t) => !o.claimed.includes(t.id) && (Number(o.minutes) || 0) >= t.minutes)
      if (next) text = `在线满 ${next.minutes} 分钟的奖励可以领啦，去「任务」页领取吧～`
    }
    if (!text) return
    lastNoticeAt = Date.now()
    window.api.openNotice?.({ text })
  }

  // —— 每日任务 / 在线奖励 ——
  // 任务进度在触发点累加（喂食、洗澡、打工分钟、上课、小游戏），领取时才发奖。
  function claimDaily(id) {
    const task = DAILY_TASKS.find((t) => t.id === id)
    if (!task) return
    const d = readDaily()
    if (d.claimed.includes(id)) { sayUntil('这个奖励今天已经领过啦～', 2400); return }
    if ((Number(d[id]) || 0) < task.target) { sayUntil('任务还没完成哦，再努力一下～', 2400); return }
    d.claimed.push(id)
    writeDaily(d)
    addCoins(task.coins)
    addGrowth(task.exp)
    sayUntil(`任务奖励：${task.coins} 元宝、成长值 +${task.exp}！`, 3200)
  }

  function claimOnline(id) {
    const tier = ONLINE_TIERS.find((t) => t.id === id)
    if (!tier) return
    const o = readOnline()
    if (o.claimed.includes(id)) { sayUntil('这个在线奖励已经领过啦～', 2400); return }
    if ((Number(o.minutes) || 0) < tier.minutes) {
      sayUntil(`再在线 ${tier.minutes - (Number(o.minutes) || 0)} 分钟就能领啦～`, 2600)
      return
    }
    o.claimed.push(id)
    writeOnline(o)
    addCoins(tier.coins)
    addGrowth(tier.exp)
    sayUntil(`在线奖励：${tier.coins} 元宝、成长值 +${tier.exp}！`, 3200)
  }

  let dispatchBusy = false // 防重入锁：防止单次操作被重复触发/并发交错

  // 增加成长值并处理升级/进化。
  // 原版没有「经验」这层概念：等级直接由累计成长值查表得出，加了多少成长值就累加多少，
  // 升级不清零、也不会掉回去。opts.showLevUp 仅升级按钮触发，才额外播 LevUp 动画。
  async function addGrowth(n, opts = {}) {
    if (!n || n <= 0) return
    // 心情加成：兴奋 +30% / 高兴 +10% / 平静 0 / 郁闷 -10% / 低落 -20%（原版档位）。
    // 在线成长的速率本身已按心情分档，再乘一次就重复加成了，所以传 raw 跳过。
    const mul = opts.raw ? 1 : moodBand(moodVal.value).mul
    const gain = Math.round(n * mul)
    // NaN 防护：倍率异常时宁可不加，也别把成长值写成一串 "NaN"
    if (!Number.isFinite(gain) || gain <= 0) return
    const before = levelFromTotal(totalExp.value)
    totalExp.value = Math.max(0, Number(totalExp.value) || 0) + gain
    const after = levelFromTotal(totalExp.value)
    persistLevel()
    if (after > before) {
      // 升级一律播 LevUp 动画（原版升级就有动画），跨阶段则播完切换形态。
      // evolving 期间只累计数值、不重复触发——进化动画播完会按最新等级对齐形态。
      if (evolving) return
      const target = stageFromLevel(after)
      if (target !== stage.value) triggerEvolution()
      else play('levup', { user: true })
    }
  }

  // 进化流程：在当前阶段播升级动画（LevUp），播完切入目标阶段并回 Stand。
  // 注意：破壳动画（Appear）仅用于"刚获取宠物"的出生场景，不用于升级/进化。
  // 完成回调绝不能只依赖 backTimer——任何后续动作都会 clearTimers() 把它清掉，
  // evolving 一旦永久为 true，形态不再切换、成长值也不再累计。
  // 所以另挂一个 clearTimers 清不掉的 evolveTimer 兜底，完成回调本身幂等：
  // FlashPlayer 的真实时长回调与兜底定时器谁先到都只执行一次。
  function triggerEvolution() {
    if (evolving) return
    evolving = true
    stopAuto()
    clearTimers()
    clearEvolveTimer()
    hideBubble()
    currentSrc.value = `assets/Action/${stage.value}/LevUp.swf`
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    const finishEvolution = async () => {
      if (!evolving) return // 幂等：真实时长回调与兜底定时器可能先后触发
      evolving = false
      // 以当前累计成长值反推阶段：进化动画播放期间等级可能又涨了，直接对齐最新形态
      stage.value = stageFromLevel(levelFromTotal(totalExp.value))
      persistLevel()
      backToStand()
      const text = await randomBubble('LevUp')
      if (text) sayUntil(text, 3000)
      maybeResumeAuto()
    }
    onSwfDone = finishEvolution
    backTimer = setTimeout(finishEvolution, SWF_DUR_FALLBACK) // 正常路径会被真实时长覆盖
    evolveTimer = setTimeout(finishEvolution, SWF_DUR_FALLBACK) // clearTimers 清不掉的保险
  }

  // 领养宠物：首次登录选定性别并命名后，播放对应性别蛋期的「领养」First 动画（出生动画），
  // 播完自动回 Stand 并开始自动循环。此后性别/昵称长期持久化。
  function adopt(genderVal, nameVal) {
    GENDER = genderVal === 'MM' ? 'MM' : 'GG'
    // 重置为一只全新的蛋（1 级，成长值归零）
    totalExp.value = 0
    hunger.value = STAT_MAX.hunger
    clean.value = STAT_MAX.clean
    health.value = STAT_MAX.health
    moodVal.value = STAT_MAX.mood
    coins.value = 0
    stage.value = stageFromLevel(1) // <GENDER>/Egg
    petName.value = nameVal || ''
    adopted.value = true
    persistLevel()
    localStorage.setItem('qqpet.gender', GENDER)
    localStorage.setItem('qqpet.name', petName.value)
    localStorage.setItem('qqpet.adopted', '1')
    window.api?.setTrayGender?.(GENDER) // 同步托盘图标性别目录
    window.api?.showPet?.() // 显示宠物窗，领养窗随主进程关闭——两者不同时出现
    stopAuto()
    clearTimers()
    hideBubble()
    currentSrc.value = statePath(stage.value, 'First.swf')
    playerKey.value++
    animBusy = true
    awaitingMeta = true
    adoptingFirst = true // 领养动画播放中
    onSwfDone = () => { adoptingFirst = false; backToStand(); startAuto() }
    backTimer = setTimeout(onSwfDone, SWF_DUR_FALLBACK) // 兜底；正常被真实时长覆盖
  }

  // 实际执行单个动作（此刻已空闲，可直接切换/播放动画）
  function runDispatch(action, height) {
    dispatchBusy = true
    setTimeout(() => { dispatchBusy = false }, 400)

    // 开窗类动作不受死亡门禁 / 播完才切约束：商店/小游戏/背包/宠物档案任何状态都可打开。玩小游戏 +50 心情
    if (action === 'game') { addMood(MOOD_GAIN.game); addDailyProgress('game'); window.api.openGame?.(); return }
    if (action === 'shop') { window.api.openShop?.(); return }
    if (action === 'bag') { window.api.openBag?.(); return }
    if (action === 'info') { window.api.openInfo?.(); return }
    // 打工 / 学习 / 任务 / 好友：打开中心窗口对应页签，由页面选择岗位/课程后再派发会话指令
    if (action === 'work') { window.api.openWork?.(); return }
    if (action === 'study') { window.api.openStudy?.(); return }
    if (action === 'task') { window.api.openTask?.(); return }
    if (action === 'friend') { window.api.openFriend?.(); return }
    if (action === 'chat') { window.api.openChat?.(); return }

    if (action && action.type === 'custom') {
      // 直接播放任意 SWF 路径（右键"选择 SWF 播放…"）——用户操作，暂停自动循环
      if (autoEnabled) stopAuto()
      clearTimers()
      currentSrc.value = action.path
      playerKey.value++
      return
    }
    // 已移除死亡机制：不再有"只有复活/退出可用"的屏蔽分支。
    if (action && action.type === 'adopt') { adopt(action.gender, action.name); return }
    // 打工页 / 学习页派发的会话类指令
    if (action && action.type === 'work-start') { if (!evolving) playWork(action.minutes || 60, action.job); return }
    if (action && action.type === 'work-stop') { stopWork(); return }
    if (action && action.type === 'study-start') { if (!evolving) startStudyCourse(action.course); return }
    // 任务页领取奖励
    if (action && action.type === 'daily-claim') { claimDaily(action.id); return }
    if (action && action.type === 'claim-online') { claimOnline(action.id); return }
    // 背包消耗类动作：喂食/清洁/治疗（支持 'eat' 字符串与 {type:'eat'} 对象两种形式）。
    // 背包里没有对应物品时提示并忽略——不播放动画、不加属性。
    const consumeEffect =
      action === 'eat' || action === 'clean' || action === 'cure' ? action
      : (action && typeof action === 'object' && (action.type === 'eat' || action.type === 'clean' || action.type === 'cure')) ? action.type
      : null
    if (consumeEffect) {
      const item = consumeItem(consumeEffect)
      if (!item) {
        sayUntil(
          consumeEffect === 'eat' ? '背包里没有食物，先去商店买点吃的吧！'
            : consumeEffect === 'clean' ? '背包里没有清洁用品，先去商店买点吧！'
            : '背包里没有药品，先去商店买点吧！', 3000)
        return
      }
      play(consumeEffect, { user: true })
      const v = Number(item.value) || (consumeEffect === 'cure' ? 20 : 100)
      if (consumeEffect === 'eat') { hunger.value = Math.min(STAT_MAX.hunger, hunger.value + v); addMood(MOOD_GAIN.feed); addGrowth(8); addDailyProgress('feed') }
      else if (consumeEffect === 'clean') { clean.value = Math.min(STAT_MAX.clean, clean.value + v); addMood(MOOD_GAIN.clean); addGrowth(5); addDailyProgress('wash') }
      else if (consumeEffect === 'cure') { health.value = Math.min(STAT_MAX.health, health.value + v); addGrowth(6) }
      persistLevel()
      sayUntil(`使用了${item.name}，${consumeEffect === 'eat' ? '饱食' : consumeEffect === 'clean' ? '清洁' : '健康'} +${v}！`, 2600)
      return
    }
    else if (action === 'sick') {  play(action, { user: true }); addGrowth(4) }
    else if (action === 'speak') { play('speak', { keepSwf: true, user: true }); addGrowth(2) }
    else if (action === 'enter') { play('enter', {}) }       // 进场：启动时播 Enter 后回 Stand
    else if (action === 'exit') { if (adoptingFirst) window.api.appQuit?.(); else playExitSwf() } // 刚领养直接退出；平时播 Exit 后退出
    else if (action === 'exit-force') { if (adoptingFirst) window.api.appQuit?.(); else playExitSwf() } // 确认框确认后真正退出
    else if (action === 'hide') { playHide(null) }           // 隐藏：播 Hide 后隐藏
    else if (action === 'hide-left') { playHide('left', height) }    // 隐藏到屏幕左侧
    else if (action === 'hide-right') { playHide('right', height) }  // 隐藏到屏幕右侧
    else if (action === 'stat') {  sayStatus() }
    else if (action === 'levup') { addGrowth(999, { showLevUp: true }) } // 升级按钮：一次加足量成长值（兼作测试入口）
    else if (action === 'work' || action === 'work1h') { playWork(60) } // 打工1小时：每分钟按岗位结算元宝，饥饿/清洁加速消耗
    else if (action === 'work15m') { playWork(3)  }                  // 打工15分钟（短班）
    else if (action === 'study') { playStudy() }                  // 学习：帧动画 + 计时加成长值
    else if (action === 'interact') { playRandomInteract(); addMood(moodClickGain(moodVal.value)) }      // 点击互动：随机播 interact 动画 + 按档位加心情
    else if (action === 'play') { playRandomPlay(); addMood(MOOD_GAIN.play); addGrowth(4) }  // 玩耍：随机播 play 动画，心情 +20
    else if (action === 'stand') { backToStand() }
  }

  // 对外统一动作入口（App 点击/右键/外部逻辑调用）：
  // - 气泡 & 开窗类立即执行；
  // - 其余动作，若当前正有一段动画在播（animBusy）则忽略掉，避免打断当前动画；
  //   动画播完回到空闲后新动作自然可正常执行。
  function dispatch(action, height) {
    if (action && action.type === 'bubble') {
      sayUntil(action.text || '', 3000)
      return
    }
    // AI 回复：气泡（截断到 34 字）→ 心情值 → 动作；动作优先，没有动作就按情绪挑手势
    if (action && action.type === 'ai-say') {
      applyAiReply({
        text: action.text,
        action: action.action,
        emotion: action.emotion,
        mood: action.mood
      })
      return
    }
    // 查看状态：仅气泡播报、不播放动画，无需等待当前动画播完，随时可立即查看
    if (action === 'stat') { runDispatch(action, height); return }
    // 刚领养（First 动画播放中）点退出：不等待动画，直接退出
    if (action === 'exit' && adoptingFirst) { runDispatch(action, height); return }
    // 退出确认：未勾选"记住我的选择"时先弹原版确认框（253×81），确认后再走 exit-force
    if (action === 'exit' && localStorage.getItem('qqpet.skipExitConfirm') !== '1') {
      window.api.openConfirm?.()
      return
    }
    // 确认框里的"退出"：跳过二次确认，立即播离场动画
    if (action === 'exit-force') { runDispatch(action, height); return }
    // 托盘高频指令：隐藏（原地/左/右）与显示宠物优先级最高，立即打断当前动画执行；
    // 退出同样可打断（含正在播放的隐藏动画），避免退出被 animBusy 吞掉
    if (action === 'hide-left' || action === 'hide-right' || action === 'hide' || action === 'enter' || action === 'exit') { runDispatch(action, height); return }
    // 开窗类不排队：随时可打开
    if (action === 'shop' || action === 'game' || action === 'bag' || action === 'info' || action === 'work' || action === 'study' || action === 'task' || action === 'friend' || action === 'chat') { runDispatch(action, height); return }
    // 打工/学习会话指令由打工页、学习页派发，不受当前动画门禁限制（否则点了没反应）
    if (action && (action.type === 'work-start' || action.type === 'work-stop' || action.type === 'study-start')) { runDispatch(action, height); return }
    // 任务奖励领取同样不受动画门禁限制
    if (action && (action.type === 'daily-claim' || action.type === 'claim-online')) { runDispatch(action, height); return }
    // 已移除死亡机制，不再需要"死亡画面下只放行复活/退出"的特殊分支
    if (evolving || dispatchBusy) return
    if (animBusy) return // 动画播放中：直接忽略新动作，不排队也不等待
    runDispatch(action, height)
  }

  // 释放定时器。组件卸载（或热更新重挂）时必须调，否则旧的 1 秒心跳会继续
  // persistLevel，把旧数值写回 localStorage，和新实例交替覆盖。
  function dispose() {
    if (statTick) {
      clearInterval(statTick)
      statTick = null
    }
    stopAuto()
    clearTimers()
    clearEvolveTimer()
    hideBubble()
  }

  return {
    currentSrc,
    playerKey,
    bubble,
    float,
    stage,
    level,
    totalExp,
    expToNext,
    hunger,
    clean,
    health,
    mood,
    moodVal,
    working,
    studying,
    workLeftSec,
    dockedEdge, undock,
    coins,
    adopted,
    petName,
    play,
    backToStand,
    applyRealDuration,
    sayUntil,
    sayStatus,
    playCustom,
    addGrowth,
    addCoins,
    dispatch,
    startAuto,
    stopAuto,
    dispose
  }
}

/**
 * 整进程单例。以前每次调用 usePetMachine() 都会新建一份状态 + 一条 1 秒心跳，
 * App 一旦重挂（dev 热更新、页面重载残留）就会出现两份状态机同时 persistLevel，
 * 互相把对方的旧值写回 localStorage —— 表现就是成长值/属性"没操作也忽高忽低"。
 */
let instance = null

export function usePetMachine() {
  if (!instance) instance = createPetMachine()
  return instance
}

export function disposePetMachine() {
  if (!instance) return
  instance.dispose()
  instance = null
}
