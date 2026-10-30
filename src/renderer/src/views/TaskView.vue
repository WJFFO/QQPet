<template>
  <div class="task">
    <!-- 每日任务：原版 task_titile.png 标题条 + DailyTask 图标 -->
    <div class="panel qq-panel">
      <div class="ph">
        <img v-if="taskTitle" class="ph-img" :src="taskTitle" alt="每日任务" draggable="false" />
        <img v-if="taskIcon" class="ph-icon" :src="taskIcon" alt="" draggable="false" />
        <span class="ph-note">每天 0 点重置</span>
      </div>
      <div class="rows qq-scroll">
        <div v-for="t in tasks" :key="t.id" class="row" :class="{ done: isDone(t) }">
          <div class="r-main">
            <div class="r-label">{{ t.label }}</div>
            <div class="r-bar">
              <QProgress :value="pct(t)" color="green" :height="14" />
            </div>
          </div>
          <div class="r-prog">{{ Math.min(prog(t), t.target) }}/{{ t.target }}{{ t.unit }}</div>
          <button
            class="qq-btn mini"
            :disabled="!isDone(t) || isClaimed(t.id)"
            @click="claimTask(t)"
          >
            {{ isClaimed(t.id) ? '已领取' : isDone(t) ? `领 ${t.coins}` : '进行中' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 在线奖励：原版 online_title.png + Online 图标 -->
    <div class="panel qq-panel">
      <div class="ph">
        <img v-if="onlineTitle" class="ph-img" :src="onlineTitle" alt="在线奖励" draggable="false" />
        <img v-if="onlineIcon" class="ph-icon" :src="onlineIcon" alt="" draggable="false" />
        <span class="ph-note">在线 {{ onlineMinutes }} 分钟</span>
      </div>
      <div class="rows qq-scroll">
        <div v-for="t in tiers" :key="t.id" class="row" :class="{ done: isOnlineDone(t) }">
          <div class="r-main">
            <div class="r-label">满 {{ t.minutes }} 分钟</div>
            <div class="r-bar">
              <QProgress :value="onlinePct(t)" color="blue" :height="14" />
            </div>
          </div>
          <div class="r-reward">{{ t.coins }} 元宝 · 成长 +{{ t.exp }}</div>
          <button
            class="qq-btn mini"
            :disabled="!isOnlineDone(t) || isOnlineClaimed(t.id)"
            @click="claimOnline(t)"
          >
            {{ isOnlineClaimed(t.id) ? '已领取' : isOnlineDone(t) ? '领取' : '未达成' }}
          </button>
        </div>
        <div class="tip">
          在线时长从启动宠物开始累计，喂食洗澡打工上课都会同步计入每日任务进度。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import QProgress from '../ui/QProgress.vue'
import { asset } from '../ui/useSkin'
import { DAILY_TASKS, ONLINE_TIERS, readDaily, readOnline } from '../composables/dailyTasks'

const tasks = DAILY_TASKS
const tiers = ONLINE_TIERS

const taskTitle = ref('')
const taskIcon = ref('')
const onlineTitle = ref('')
const onlineIcon = ref('')

const daily = ref(readDaily())
const online = ref(readOnline())

function prog(t) {
  return Number(daily.value[t.id]) || 0
}
function pct(t) {
  return Math.min(100, Math.round((prog(t) / t.target) * 100))
}
function isDone(t) {
  return prog(t) >= t.target
}
function isClaimed(id) {
  return daily.value.claimed.includes(id)
}

const onlineMinutes = ref(0)
function syncOnline() {
  online.value = readOnline()
  onlineMinutes.value = Number(online.value.minutes) || 0
}
function isOnlineDone(t) {
  return onlineMinutes.value >= t.minutes
}
function onlinePct(t) {
  return Math.min(100, Math.round((onlineMinutes.value / t.minutes) * 100))
}
function isOnlineClaimed(id) {
  return online.value.claimed.includes(id)
}

function claimTask(t) {
  window.api.sendControlAction({ type: 'daily-claim', id: t.id })
  setTimeout(refresh, 400)
}
function claimOnline(t) {
  window.api.sendControlAction({ type: 'claim-online', id: t.id })
  setTimeout(refresh, 400)
}

function refresh() {
  daily.value = readDaily()
  syncOnline()
}

let timer = null
let offStorage = null
onMounted(async () => {
  taskTitle.value = await asset('assets/iconList/pic/task_titile.png')
  taskIcon.value = await asset('assets/iconList/DailyTask/icon.png')
  onlineTitle.value = await asset('assets/iconList/pic/online_title.png')
  onlineIcon.value = await asset('assets/iconList/Online/icon.png')
  refresh()
  offStorage = window.api.onStorageChanged?.(refresh)
  timer = setInterval(refresh, 3000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (offStorage) offStorage()
})
</script>

<style scoped>
.task {
  display: flex;
  gap: 8px;
  width: 100%;
  height: 100%;
}
.panel {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.ph {
  position: relative;
  flex: none;
  height: 30px;
  display: flex;
  align-items: center;
  padding: 0 6px;
  border-bottom: 1px solid #d3e5f4;
  background: linear-gradient(180deg, #f5fcff 0%, #e2f1fc 100%);
}
.ph-img {
  height: 22px;
  max-width: calc(100% - 8px);
  object-fit: contain;
}
.ph-icon {
  width: 20px;
  height: 20px;
  margin-left: 4px;
  object-fit: contain;
}
.ph-note {
  position: absolute;
  right: 6px;
  bottom: 2px;
  font-size: 10px;
  color: #6b88a8;
  white-space: nowrap;
  text-shadow: 0 1px 0 #fff;
}

.rows {
  flex: 1;
  min-height: 0;
  padding: 6px;
  box-sizing: border-box;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 46px;
  padding: 0 2px;
  border-bottom: 1px dashed #e0ecf6;
}
.row:last-child {
  border-bottom: none;
}
.row.done .r-label {
  color: #1b6b3a;
}
.r-main {
  flex: 1;
  min-width: 0;
}
.r-label {
  font-size: 12px;
  color: #22405f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.r-bar {
  margin-top: 4px;
}
.r-prog {
  flex: none;
  width: 62px;
  text-align: right;
  font-size: 11px;
  color: #5b7ba3;
}
/* 奖励文案按内容宽度排，不再固定 104px —— 固定宽度下「元宝 · 成长 +10」会差 2px 被切掉 */
.r-reward {
  flex: none;
  white-space: nowrap;
  text-align: right;
  font-size: 11px;
  color: #c07000;
}
.qq-btn.mini {
  flex: none;
  height: 20px;
  padding: 0 8px;
  font-size: 11px;
}
.tip {
  margin-top: 10px;
  padding: 6px;
  border: 1px dashed #d5e5f2;
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.7;
  color: #5b7ba3;
}
</style>
