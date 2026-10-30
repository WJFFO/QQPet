<template>
  <div class="info qq-scroll">
    <!-- 原版「宠物档案」标题图 -->
    <div class="head">
      <img v-if="titleImg" class="head-img" :src="titleImg" alt="宠物档案" draggable="false" />
      <span v-else class="head-text">宠物档案</span>
    </div>

    <!-- 档案卡：左侧形象 + 右侧基本信息 -->
    <div class="card qq-panel">
      <div class="portrait">
        <img v-if="stageSrc" :src="stageSrc" alt="" draggable="false" />
        <img v-if="badge" class="badge" :src="badge" alt="" draggable="false" />
      </div>

      <div class="fields">
        <div class="row">
          <span class="k">昵称</span>
          <template v-if="editing !== 'name'">
            <span class="v name">{{ petName || '未命名' }}</span>
            <button class="edit" title="修改昵称" @click="startEdit('name')">改</button>
          </template>
          <input
            v-else
            ref="inputEl"
            v-model="draft"
            class="v inp"
            maxlength="12"
            @keydown.enter.prevent="saveEdit"
            @keydown.esc.prevent="cancelEdit"
            @blur="saveEdit"
          />
        </div>
        <div class="row">
          <span class="k">等级</span>
          <span class="v"><b class="lv">Lv.{{ level }}</b> <span class="title-tag">{{ stageName }}</span></span>
        </div>
        <div class="row">
          <span class="k">性别</span>
          <span class="v">{{ gender === 'MM' ? 'QMM（女）' : 'QGG（男）' }}</span>
        </div>
        <div class="row">
          <span class="k">状态</span>
          <span class="v" :class="{ warn: isSick || isHungry }">{{ stateText }}</span>
        </div>
        <div class="row">
          <span class="k">主人</span>
          <template v-if="editing !== 'owner'">
            <span class="v">{{ owner }}</span>
            <button class="edit" title="修改主人称呼" @click="startEdit('owner')">改</button>
          </template>
          <input
            v-else
            ref="inputEl"
            v-model="draft"
            class="v inp"
            maxlength="12"
            @keydown.enter.prevent="saveEdit"
            @keydown.esc.prevent="cancelEdit"
            @blur="saveEdit"
          />
        </div>
      </div>
    </div>

    <!-- 原版小档案的 5 条状态：成长 / 饥饿 / 清洁 / 心情 / 健康。
         数值都是原版上限下的绝对值（饥饿 1080、清洁 720、心情 1000、健康 100），
         条长表示占上限的比例，悬停可看具体数值与档位文案（与原版一致）。 -->
    <div class="line" :title="`成长值 ${totalExp}（本级进度 ${expPct}%，距下一级还差 ${expNeed} 点）`">
      <span class="lbl">成长值</span>
      <QProgress :value="expPct" color="yellow" class="line-bar" />
      <span class="val growth">{{ totalExp }}</span>
    </div>

    <div class="line" :title="`饥饿 ${hunger} / ${STAT_MAX.hunger}（${hungerBand(hunger).label}）`">
      <span class="lbl">饱食度</span>
      <QProgress :value="pctOf(hunger, STAT_MAX.hunger)" color="green" class="line-bar" />
      <span class="val">{{ hunger }}</span>
    </div>
    <div class="line" :title="`清洁 ${clean} / ${STAT_MAX.clean}（${cleanBand(clean).label}）`">
      <span class="lbl">清洁度</span>
      <QProgress :value="pctOf(clean, STAT_MAX.clean)" color="blue" class="line-bar" />
      <span class="val">{{ clean }}</span>
    </div>
    <div class="line" :title="`心情 ${moodVal} / ${STAT_MAX.mood}（${moodBand(moodVal).label}）`">
      <span class="lbl">心情值</span>
      <QProgress :value="pctOf(moodVal, STAT_MAX.mood)" color="yellow" class="line-bar" />
      <span class="val">{{ moodVal }}</span>
    </div>
    <div class="line" :title="`健康 ${health} / ${STAT_MAX.health}`">
      <span class="lbl">健康度</span>
      <QProgress :value="pctOf(health, STAT_MAX.health)" color="red" class="line-bar" />
      <span class="val">{{ health }}</span>
    </div>
    <div class="line" :title="`疲劳 ${fatigue} / ${STAT_MAX.fatigue}（${fatigueBand(fatigue).label}，打工/上课会累积，闲着自动恢复）`">
      <span class="lbl">疲劳值</span>
      <QProgress :value="pctOf(fatigue, STAT_MAX.fatigue)" color="orange" class="line-bar" />
      <span class="val">{{ fatigue }}</span>
    </div>

    <!-- 底部：元宝 / 在线 / 操作 -->
    <div class="foot">
      <span class="foot-item"><span class="qq-weak">元宝</span> <b class="gold">{{ coins }}</b></span>
      <span class="foot-item"><span class="qq-weak">在线</span> {{ onlineText }}</span>
      <span class="foot-item"><span class="qq-weak">心情</span> {{ moodName }}</span>
      <span class="spacer"></span>
      <button class="qq-btn" @click="refreshAll">刷新</button>
      <button class="qq-btn" @click="$emit('close')">关闭</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import QProgress from '../ui/QProgress.vue'
import { asset } from '../ui/useSkin'
import { levelFromTotal, expToNext, levelProgress } from '../composables/levels'
import {
  MAX as STAT_MAX,
  ratio,
  hungerBand,
  cleanBand,
  moodBand,
  fatigueBand,
  isHungerYellow,
  isCleanYellow,
  SICK_AT
} from '../composables/stats'
import { rememberPrevName } from '../composables/aiConfig'

defineEmits(['close'])

const gender = ref(localStorage.getItem('qqpet.gender') || 'GG')
const petName = ref(localStorage.getItem('qqpet.name') || '')
const owner = ref(readOwner())
// 原版没有「经验」：等级由累计成长值查表得出
const totalExp = ref(Number(localStorage.getItem('qqpet.totalExp')) || 0)
const level = computed(() => levelFromTotal(totalExp.value))
const hunger = ref(STAT_MAX.hunger)
const clean = ref(STAT_MAX.clean)
const health = ref(STAT_MAX.health)
const fatigue = ref(0)
const moodVal = ref(STAT_MAX.mood)
const sickFlag = ref(localStorage.getItem('qqpet.sick') === '1')
const coins = ref(0)

/** 当前值占上限的百分比（QProgress 收 0~100） */
const pctOf = (v, max) => Math.round(ratio(v, max) * 100)

// 主人称呼：优先 qqpet.owner（可修改），否则回退到登录时填的 QQ 号
function readOwner() {
  return localStorage.getItem('qqpet.owner') || localStorage.getItem('qqpet.savedQq') || '主人'
}

// —— 昵称 / 主人称呼 就地编辑 ——
// 编辑态 '' | 'name' | 'owner'；保存写入 localStorage 并广播，宠物窗口与右键菜单即时同步
const editing = ref('')
const draft = ref('')
const inputEl = ref(null)

function startEdit(which) {
  editing.value = which
  draft.value = which === 'name' ? petName.value : owner.value
  nextTick(() => {
    inputEl.value?.focus()
    inputEl.value?.select()
  })
}

function cancelEdit() {
  editing.value = ''
}

function saveEdit() {
  if (!editing.value) return
  const which = editing.value
  const val = draft.value.trim().slice(0, 12)
  editing.value = '' // 先退出编辑态：enter 与 blur 会连着触发，避免重复保存
  if (!val) return
  if (which === 'name') {
    if (val === petName.value) return
    // 旧名字要留个记录：聊天历史里全是旧称呼，不做迁移模型会一直叫旧名
    rememberPrevName('qqpet.namePrev', petName.value)
    petName.value = val
    localStorage.setItem('qqpet.name', val)
    window.api.sendPetBubble?.(`以后就叫我「${val}」啦～`)
  } else {
    if (val === owner.value) return
    rememberPrevName('qqpet.ownerPrev', owner.value)
    owner.value = val
    localStorage.setItem('qqpet.owner', val)
  }
  window.api.storageChanged?.()
}

const titleImg = ref('')
const badge = ref('')
const stageSrc = ref('')

// 阶段：1-4 蛋期 / 5-9 幼年期 / 10+ 成年期
const band = computed(() => (level.value >= 10 ? 3 : level.value >= 5 ? 2 : 1))
const stageName = computed(() => (level.value >= 10 ? '成年期' : level.value >= 5 ? '幼年期' : '蛋期'))
const stageKey = computed(() => `${gender.value}${band.value}`)

const expNeed = computed(() => expToNext(totalExp.value))
const expPct = computed(() => Math.round(levelProgress(totalExp.value) * 100))

const isSick = computed(() => sickFlag.value || health.value <= SICK_AT)
const isHungry = computed(() => isHungerYellow(hunger.value) || isCleanYellow(clean.value))
const stateText = computed(() =>
  isSick.value ? '生病了，需要用药' : isHungry.value ? '又饿又脏，快照顾我～' : '活蹦乱跳'
)
const moodName = computed(() =>
  moodVal.value >= 900 ? '兴奋' : moodVal.value >= 600 ? '高兴' : moodVal.value >= 400 ? '平静' : moodVal.value >= 200 ? '郁闷' : '低落'
)

// 在线时长：本次会话打开档案页起计时（与原版"今日在线"近似）
const onlineSec = ref(Number(sessionStorage.getItem('qqpet.onlineSec')) || 0)
const onlineText = computed(() => {
  const m = Math.floor(onlineSec.value / 60)
  return m >= 60 ? `${Math.floor(m / 60)} 小时 ${m % 60} 分` : `${m} 分钟`
})

async function loadImages() {
  titleImg.value = await asset('assets/stateInfo/00.png')
  badge.value = await asset('assets/info/64.svg')
}
async function loadStage() {
  stageSrc.value = await asset(`assets/info/${stageKey.value}.svg`)
}
watch(stageKey, loadStage)

function refreshAll() {
  const readStat = (key, def) => {
    const raw = localStorage.getItem(key)
    return raw === null ? def : Number(raw) || 0
  }
  gender.value = localStorage.getItem('qqpet.gender') || 'GG'
  petName.value = localStorage.getItem('qqpet.name') || ''
  owner.value = readOwner()
  // level 由 totalExp 查表得出（computed），这里只刷新成长值
  totalExp.value = Number(localStorage.getItem('qqpet.totalExp')) || 0
  hunger.value = readStat('qqpet.hunger', STAT_MAX.hunger)
  clean.value = readStat('qqpet.clean', STAT_MAX.clean)
  health.value = readStat('qqpet.health', STAT_MAX.health)
  fatigue.value = readStat('qqpet.fatigue', 0)
  sickFlag.value = localStorage.getItem('qqpet.sick') === '1'
  moodVal.value = readStat('qqpet.moodval', STAT_MAX.mood)
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
}

let timer = null
let offStorage = null
onMounted(async () => {
  refreshAll()
  await Promise.all([loadImages(), loadStage()])
  offStorage = window.api.onStorageChanged?.(refreshAll)
  // 属性每秒被宠物窗口持久化，档案页 1s 轮询保持同步
  timer = setInterval(() => {
    refreshAll()
    onlineSec.value++
    sessionStorage.setItem('qqpet.onlineSec', String(onlineSec.value))
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (offStorage) offStorage()
})
</script>

<style scoped>
.info {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 2px 6px 4px;
}

/* 标题 */
.head {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 26px;
}
.head-img {
  height: 22px;
  image-rendering: auto;
}
.head-text {
  font-size: 14px;
  font-weight: bold;
  color: #23406e;
  letter-spacing: 2px;
}

/* 档案卡：竖向拉伸填满剩余空间，避免下方大片留白 */
.card {
  flex: 1 1 auto;
  max-height: 268px;
  min-height: 148px;
  display: flex;
  gap: 12px;
  padding: 10px;
  margin-bottom: 6px;
}
.portrait {
  position: relative;
  flex: none;
  width: 150px;
  height: 150px;
  align-self: center;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #c9dced;
  border-radius: 4px;
  background: radial-gradient(ellipse at 50% 40%, #ffffff 0%, #eaf6ff 75%, #d8ecfb 100%);
}
.portrait img {
  max-width: 112px;
  max-height: 128px;
  object-fit: contain;
}
.badge {
  position: absolute;
  right: 2px;
  top: 2px;
  width: 49px;
  height: 18px;
}

.fields {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: space-evenly;
  gap: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 22px;
  padding: 0 8px;
  border-bottom: 1px dashed #d5e5f2;
}
.row:last-child {
  border-bottom: none;
}
.k {
  flex: none;
  width: 34px;
  color: #6b88a8;
}
.v {
  flex: 1;
  min-width: 0;
  color: #22405f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.v.name {
  font-weight: bold;
  color: #1b3d67;
}

/* 就地编辑：右侧小“改”按钮 + 行内输入框 */
.edit {
  flex: none;
  height: 17px;
  padding: 0 5px;
  border: 1px solid #b9d3e8;
  border-radius: 3px;
  background: linear-gradient(180deg, #ffffff, #e8f3fb);
  color: #3a6d9c;
  font-family: inherit;
  font-size: 11px;
  line-height: 15px;
  cursor: pointer;
}
.edit:hover {
  border-color: #7fa9cc;
  background: linear-gradient(180deg, #fdfeff, #d8ecfa);
  color: #1d5288;
}
.inp {
  height: 18px;
  padding: 0 4px;
  border: 1px solid #7fa9cc;
  border-radius: 3px;
  background: #fff;
  color: #12324f;
  font-family: inherit;
  font-size: 12px;
  outline: none;
  box-shadow: inset 0 1px 2px rgba(35, 64, 110, 0.12);
}
.lv {
  color: #c07000;
  font-size: 13px;
}
.title-tag {
  margin-left: 6px;
  padding: 0 6px;
  border-radius: 7px;
  background: linear-gradient(180deg, #fff2c9, #ffe08a);
  border: 1px solid #e8bd5a;
  font-size: 11px;
  color: #8e580a;
}
.warn {
  color: #c8402b;
}

/* 属性行 */
.line {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 4px;
}
.lbl {
  flex: none;
  width: 44px;
  color: #35577f;
}
.line-bar {
  flex: 1;
  min-width: 0;
}
/* 成长值数字：累计值用金色强调；右边的进度条仍是「本级进度」。
   选择器带上 .val，否则会被 .val 的颜色盖掉 */
.val.growth {
  font-size: 15px;
  font-weight: bold;
  color: #b8862f;
  letter-spacing: 0.5px;
}
.val {
  flex: none;
  width: 76px;
  text-align: right;
  white-space: nowrap;
  color: #5b7ba3;
}

/* 底部 */
.foot {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  padding: 8px 4px 2px;
  border-top: 1px solid #dbe9f5;
}
.foot-item {
  color: #22405f;
}
.foot-item b {
  color: #b86a00;
}
.spacer {
  flex: 1;
}
</style>
