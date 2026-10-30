<template>
  <div class="work">
    <!-- 打工中：场景动画 + 倒计时（原版打工是进场景，不是只挂个计时器） -->
    <div v-if="working" class="scene qq-panel">
      <div class="scene-stage">
        <div class="stage-art">
          <img v-if="jobIcon" class="job-art" :src="jobIcon" alt="" draggable="false" />
          <!-- 原版 28×28 的打工序列帧：放大了会糊，只做"忙碌中"小动画角标 -->
          <div class="busy"><FrameAnim :frames="sceneFrames" :interval="340" /></div>
        </div>
        <div class="scene-tag">{{ work.name }}</div>
      </div>

      <div class="scene-side">
        <div class="sc-row">
          <span class="k">岗位</span><span class="v">{{ work.name }}</span>
        </div>
        <div class="sc-row">
          <span class="k">时长</span><span class="v">{{ work.minutes }} 分钟</span>
        </div>
        <div class="sc-row">
          <span class="k">剩余</span><span class="v time">{{ leftText }}</span>
        </div>
        <div class="sc-row">
          <span class="k">已赚</span><span class="v gold">{{ earnedCoins }} 元宝</span>
        </div>
        <QProgress :value="progress" color="blue" />
        <div class="sc-tip">打工期间饱食度、清洁度掉得更快，记得回家喂饭洗澡～</div>
        <button class="qq-btn" @click="stopWork">{{ stopLabel }}</button>
      </div>
    </div>

    <!-- 岗位选择 -->
    <div v-else class="pick">
      <div class="list qq-panel qq-scroll">
        <div
          v-for="j in jobs"
          :key="j.id"
          class="qq-cell job"
          :class="{ active: selected && selected.id === j.id, locked: level < j.minLevel }"
          @click="selected = j"
        >
          <img v-if="j.src" class="jicon" :src="j.src" alt="" draggable="false" />
          <div class="jname">{{ j.name }}</div>
          <div class="jrate">{{ j.rate }} 元宝/分</div>
          <span v-if="level < j.minLevel" class="jlock">Lv.{{ j.minLevel }}</span>
        </div>
      </div>

      <div class="detail qq-panel">
        <div class="dname">{{ selected ? selected.name : '选择一个岗位' }}</div>
        <div class="drow" v-if="selected">
          <span class="qq-weak">工资</span> <b class="gold">{{ selected.rate }}</b> 元宝/分钟
        </div>
        <div class="drow" v-if="selected">
          <span class="qq-weak">门槛</span> Lv.{{ selected.minLevel }}
        </div>

        <div class="dlabel">工作时长</div>
        <div class="durs">
          <div
            v-for="d in durations"
            :key="d.min"
            class="dur"
            :class="{ on: minutes === d.min }"
            @click="minutes = d.min"
          >
            {{ d.label }}
          </div>
        </div>

        <div class="dsum" v-if="selected">
          预计 <b class="gold">{{ selected.rate * minutes }}</b> 元宝
        </div>

        <button
          class="qq-btn primary go"
          :disabled="!canStart"
          @click="start"
        >{{ startHint }}</button>
        <div class="dwallet"><span class="qq-weak">我的元宝</span> <b class="gold">{{ coins }}</b></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import QProgress from '../ui/QProgress.vue'
import FrameAnim from '../ui/FrameAnim.vue'
import { asset } from '../ui/useSkin'

// 岗位等级门槛由各岗位的 minLevel 决定（与宠物状态机的最小入职等级 5 级一致）

// 原版打工岗位（图标取自 img_res/work，按时长结算元宝）。
// 原版打工不发成长值（成长值只由在线时长决定），产出就是元宝。
const JOBS = [
  { id: 'bj', name: '保洁员', icon: 'bj.png', rate: 4, minLevel: 5 },
  { id: 'bz', name: '保姆', icon: 'bz.png', rate: 4, minLevel: 5 },
  { id: 'yd', name: '邮递员', icon: 'yd.png', rate: 5, minLevel: 5 },
  { id: 'spg', name: '食品工', icon: 'spg.png', rate: 5, minLevel: 6 },
  { id: 'cqz', name: '擦车工', icon: 'cqz.png', rate: 6, minLevel: 6 },
  { id: 'cww', name: '宠物美容师', icon: 'cww.png', rate: 6, minLevel: 7 },
  { id: 'ba', name: '保安', icon: 'ba.png', rate: 7, minLevel: 7 },
  { id: 'sys', name: '饲养员', icon: 'sys.png', rate: 7, minLevel: 8 },
  { id: 'jg', name: '技工', icon: 'jg.png', rate: 8, minLevel: 8 },
  { id: 'jzs', name: '建筑工', icon: 'jzs.png', rate: 8, minLevel: 9 },
  { id: 'jz', name: '家政', icon: 'jz.png', rate: 9, minLevel: 9 },
  { id: 'jc', name: '警察', icon: 'jc.png', rate: 9, minLevel: 10 },
  { id: 'jl', name: '教练', icon: 'jl.png', rate: 10, minLevel: 11 },
  { id: 'ls', name: '老师', icon: 'ls.png', rate: 10, minLevel: 12 },
  { id: 'wrm', name: '网管', icon: 'wrm.png', rate: 10, minLevel: 13 },
  { id: 'mhj', name: '漫画家', icon: 'mhj.png', rate: 11, minLevel: 14 },
  { id: 'gs', name: '歌手', icon: 'gs.png', rate: 11, minLevel: 15 },
  { id: 'mj', name: '模特', icon: 'mj.png', rate: 11, minLevel: 16 },
  { id: 'yy', name: '演员', icon: 'yy.png', rate: 12, minLevel: 18 },
  { id: 'wdj', name: '舞蹈家', icon: 'wdj.png', rate: 12, minLevel: 20 },
  { id: 'zhj', name: '指挥家', icon: 'zhj.png', rate: 12, minLevel: 22 }
]

const durations = [
  { min: 15, label: '15 分钟' },
  { min: 30, label: '30 分钟' },
  { min: 60, label: '1 小时' },
  { min: 240, label: '4 小时' }
]

const jobs = ref([])
const selected = ref(null)
const minutes = ref(60)
const level = ref(Number(localStorage.getItem('qqpet.level')) || 1)
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)

// 打工会话：由宠物窗口写入 qqpet.work，本页只读取并渲染（跨窗口单一数据源）
const work = ref(null)
const now = ref(Date.now())
const sceneFrames = ref([])

const working = computed(() => !!(work.value && work.value.endsAt > now.value))
// 当前岗位的大图标（场景主视觉）
const jobIcon = computed(() => {
  const id = work.value?.id
  if (!id) return ''
  return jobs.value.find((j) => j.id === id)?.src || ''
})
const leftText = computed(() => {
  if (!work.value) return '—'
  const s = Math.max(0, Math.floor((work.value.endsAt - now.value) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return `${h > 0 ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
})
const progress = computed(() => {
  if (!work.value) return 0
  const total = (work.value.endsAt - work.value.startAt) / 1000
  const left = Math.max(0, (work.value.endsAt - now.value) / 1000)
  return total > 0 ? Math.min(100, ((total - left) / total) * 100) : 0
})
const earnedCoins = computed(() => {
  if (!work.value) return 0
  const mins = Math.min(work.value.minutes, Math.floor((now.value - work.value.startAt) / 60000))
  return Math.max(0, mins * work.value.rate)
})
const canStart = computed(() => !!selected.value && level.value >= selected.value.minLevel && !working.value)
// 中途收工也结算：把能拿多少写在按钮上，避免用户以为“停了就白干”
const stopLabel = computed(() =>
  earnedCoins.value > 0 ? `收工，拿走 ${earnedCoins.value} 元宝` : '收工（还没干满一分钟）'
)
const startHint = computed(() => {
  if (!selected.value) return '请选择岗位'
  if (level.value < selected.value.minLevel) return `需要 Lv.${selected.value.minLevel}`
  return '开始打工'
})

function start() {
  if (!canStart.value) return
  // 只传必要字段（图标 dataURL 不跨进程传，避免大 payload）
  const { id, name, rate } = selected.value
  window.api.sendControlAction({ type: 'work-start', job: { id, name, rate }, minutes: minutes.value })
}

function stopWork() {
  window.api.sendControlAction({ type: 'work-stop' })
}

function readWork() {
  try {
    const raw = localStorage.getItem('qqpet.work')
    const w = raw ? JSON.parse(raw) : null
    work.value = w && w.endsAt > Date.now() ? w : null
  } catch {
    work.value = null
  }
}

function refresh() {
  level.value = Number(localStorage.getItem('qqpet.level')) || 1
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
  readWork()
}

let timer = null
let offStorage = null
onMounted(async () => {
  const out = await Promise.all(
    JOBS.map(async (j) => ({ ...j, src: await asset(`assets/img_res/work/${j.icon}`) }))
  )
  jobs.value = out
  selected.value = out.find((j) => j.level >= j.minLevel) || out[0]
  sceneFrames.value = await Promise.all(
    [0, 1, 2, 3].map((i) => asset(`assets/active/work/dagong0${i}.png`))
  )
  refresh()
  offStorage = window.api.onStorageChanged?.(refresh)
  timer = setInterval(() => {
    now.value = Date.now()
    refresh()
  }, 1000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (offStorage) offStorage()
})
</script>

<style scoped>
.work {
  width: 100%;
  height: 100%;
}

/* 岗位选择 */
.pick {
  display: flex;
  gap: 6px;
  height: 100%;
}
.list {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-auto-rows: 104px;
  gap: 6px;
  padding: 6px;
  align-content: start;
}
.job {
  padding: 4px 2px;
}
.job .jicon {
  width: 46px;
  height: 46px;
  object-fit: contain;
  border-radius: 50%;
}
.jname {
  margin-top: 2px;
  font-size: 12px;
  color: #22405f;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.jrate {
  font-size: 11px;
  color: #c07000;
}
.job.locked {
  opacity: 0.55;
}
.jlock {
  position: absolute;
  left: 3px;
  bottom: 3px;
  padding: 0 3px;
  border-radius: 6px;
  background: rgba(200, 64, 43, 0.85);
  color: #fff;
  font-size: 10px;
}

/* 详情 */
.detail {
  flex: none;
  width: 208px;
  display: flex;
  flex-direction: column;
  padding: 10px;
  box-sizing: border-box;
}
.dname {
  font-size: 14px;
  font-weight: bold;
  color: #1b3d67;
  text-align: center;
  padding-bottom: 6px;
  border-bottom: 1px dashed #d5e5f2;
}
.drow {
  display: flex;
  gap: 6px;
  align-items: baseline;
  padding: 4px 2px;
  color: #22405f;
}
.dlabel {
  margin-top: 8px;
  padding-top: 6px;
  border-top: 1px dashed #d5e5f2;
  color: #35577f;
}
.durs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 4px;
  margin-top: 4px;
}
.dur {
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #b9d3e8;
  border-radius: 3px;
  background: linear-gradient(180deg, #ffffff, #eef7fe);
  color: #35577f;
  cursor: pointer;
}
.dur.on {
  border-color: #f0a24a;
  background: linear-gradient(180deg, #fff6e2, #ffe4b2);
  color: #8e580a;
  font-weight: bold;
}
.dsum {
  margin-top: 8px;
  font-size: 12px;
  color: #22405f;
}
.go {
  margin-top: 10px;
  height: 26px;
}
.dwallet {
  margin-top: auto;
  padding-top: 6px;
  border-top: 1px dashed #d5e5f2;
  text-align: center;
}

/* 打工中场景 */
.scene {
  display: flex;
  gap: 10px;
  height: 100%;
  padding: 10px;
  box-sizing: border-box;
}
.scene-stage {
  position: relative;
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #c9dced;
  border-radius: 4px;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0) 62%, rgba(190, 220, 242, 0.55) 62%),
    radial-gradient(ellipse at 50% 55%, #ffffff 0%, #e8f5ff 70%, #d5ebfb 100%);
}
.stage-art {
  position: relative;
  width: 152px;
  height: 152px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.job-art {
  width: 112px;
  height: 112px;
  object-fit: contain;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(35, 64, 110, 0.22), inset 0 0 0 1px rgba(255, 255, 255, 0.9);
  image-rendering: -webkit-optimize-contrast;
}
.busy {
  position: absolute;
  right: -4px;
  top: -2px;
  width: 44px;
  height: 44px;
  padding: 2px;
  box-sizing: border-box;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 1px 3px rgba(35, 64, 110, 0.25), inset 0 0 0 1px #cfe3f4;
}
.scene-tag {
  position: absolute;
  left: 50%;
  bottom: 8px;
  transform: translateX(-50%);
  padding: 1px 10px;
  border-radius: 9px;
  background: rgba(85, 112, 155, 0.82);
  color: #fff;
  font-size: 12px;
}
.scene-side {
  flex: none;
  width: 250px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.sc-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  font-size: 12px;
}
.sc-row .k {
  width: 34px;
  color: #6b88a8;
}
.sc-row .v {
  color: #22405f;
}
.sc-row .time {
  font-family: Consolas, monospace;
  font-size: 14px;
  color: #1b3d67;
  font-weight: bold;
}
.sc-tip {
  margin-top: 4px;
  padding: 6px;
  border: 1px dashed #d5e5f2;
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.6;
  color: #5b7ba3;
}
.scene-side .qq-btn {
  margin-top: auto;
  height: 24px;
  max-width: 130px;
  align-self: center;
}
</style>
