<template>
  <div class="study">
    <!-- 学段页签：原版学习分小学 / 中学 / 大学 / 研究生 -->
    <div class="top">
      <div class="qq-tabs">
        <div
          v-for="s in stages"
          :key="s.key"
          class="qq-tab"
          :class="{ active: stage === s.key, locked: level < s.minLevel }"
          @click="stage = s.key"
        >
          {{ s.label }}
        </div>
      </div>
      <span class="hint">{{ tip || '选择课程送宝贝去上课' }}</span>
    </div>

    <div class="main">
      <!-- 科目网格 -->
      <div class="grid qq-panel qq-scroll">
        <div
          v-for="c in courses"
          :key="c.id"
          class="qq-cell course"
          :class="{ active: selected && selected.id === c.id }"
          @click="selected = c"
        >
          <img v-if="c.src" class="cicon" :src="c.src" alt="" draggable="false" />
          <div class="cname">{{ c.label }}</div>
          <div class="ccost">{{ c.cost }} 元宝</div>
        </div>
      </div>

      <!-- 详情 -->
      <div class="detail qq-panel">
        <div class="dname">{{ selected ? selected.name : '选择一门课' }}</div>
        <div class="drow" v-if="selected">
          <span class="qq-weak">学费</span> <b class="gold">{{ selected.cost }}</b> 元宝
        </div>
        <div class="drow" v-if="selected">
          <span class="qq-weak">奖学金</span> +{{ selected.scholar }} 元宝
        </div>
        <div class="drow" v-if="selected">
          <span class="qq-weak">门槛</span> Lv.{{ selected.minLevel }}
        </div>
        <div class="dtip">
          上课消耗学费，上完课宝贝拿到奖学金（元宝）；成长值靠在线时长慢慢攒。
        </div>
        <div class="dstat">
          <span class="qq-weak">已上课</span> {{ studyCount }} 次
        </div>
        <button class="qq-btn primary go" :disabled="!canStudy || busy" @click="study">
          {{ busy ? '上课中…' : canStudyText }}
        </button>
        <div class="dwallet"><span class="qq-weak">我的元宝</span> <b class="gold">{{ coins }}</b></div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { asset } from '../ui/useSkin'

// 原版课程的四个学段，各自 9 门科目（图标取自 img_res/study）
const stages = [
  // 原版完成课程发奖学金（元宝），不发成长值——成长值只由在线时长决定
  { key: 'xx', label: '小学', minLevel: 1, cost: 10, scholar: 20 },
  { key: 'zx', label: '中学', minLevel: 5, cost: 25, scholar: 50 },
  { key: 'dx', label: '大学', minLevel: 10, cost: 50, scholar: 100 },
  { key: 'yjs', label: '研究生', minLevel: 20, cost: 90, scholar: 150 }
]
const subjects = [
  { key: 'chinese', label: '语文' },
  { key: 'mathematics', label: '数学' },
  { key: 'art', label: '美术' },
  { key: 'music', label: '音乐' },
  { key: 'pe', label: '体育' },
  { key: 'labouring', label: '劳动' },
  { key: 'manner', label: '品德' },
  { key: 'politics', label: '政治' },
  { key: 'wushu', label: '武术' }
]

const stage = ref('xx')
const courses = ref([])
const selected = ref(null)
const level = ref(Number(localStorage.getItem('qqpet.level')) || 1)
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)
const studyCount = ref(Number(localStorage.getItem('qqpet.studyCount')) || 0)
const busy = ref(false)
const tip = ref('')

function buildCourses() {
  const s = stages.find((x) => x.key === stage.value)
  return subjects.map((sub) => ({
    id: `${s.key}-${sub.key}`,
    label: sub.label,
    name: `${s.label}${sub.label}`,
    file: `${s.key}-${sub.key}.png`,
    cost: s.cost,
    scholar: s.scholar,
    minLevel: s.minLevel
  }))
}

async function loadCourses() {
  const list = buildCourses()
  const withIcon = await Promise.all(
    list.map(async (c) => ({ ...c, src: await asset(`assets/img_res/study/${c.file}`) }))
  )
  courses.value = withIcon
  // 默认选中当前可上的第一门
  selected.value = withIcon[0] || null
}
watch(stage, loadCourses)

const canStudy = computed(() => !!selected.value && level.value >= selected.value.minLevel && coins.value >= selected.value.cost)
const canStudyText = computed(() => {
  if (!selected.value) return '请选择课程'
  if (level.value < selected.value.minLevel) return `需要 Lv.${selected.value.minLevel}`
  if (coins.value < selected.value.cost) return '元宝不足'
  return '送它去上课'
})

function study() {
  if (!canStudy.value || busy.value) return
  const { id, name, cost, exp } = selected.value
  window.api.sendControlAction({ type: 'study-start', course: { id, name, cost, exp } })
  busy.value = true
  tip.value = `宝贝正在上${selected.value.name}…`
  setTimeout(() => {
    busy.value = false
    tip.value = ''
    refresh()
  }, 6000)
}

function refresh() {
  level.value = Number(localStorage.getItem('qqpet.level')) || 1
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
  studyCount.value = Number(localStorage.getItem('qqpet.studyCount')) || 0
}

let timer = null
let offStorage = null
onMounted(async () => {
  await loadCourses()
  refresh()
  offStorage = window.api.onStorageChanged?.(refresh)
  timer = setInterval(refresh, 2000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
  if (offStorage) offStorage()
})
</script>

<style scoped>
.study {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.top {
  flex: none;
  display: flex;
  align-items: center;
  height: 28px;
  border-bottom: 1px solid #d3e5f4;
}
.qq-tab.locked {
  color: #6d8aa8;
  background: linear-gradient(180deg, #e7eef5 0%, #d5e2ee 100%);
}
.hint {
  margin-left: auto;
  padding-right: 6px;
  font-size: 12px;
  color: #5b7ba3;
}
.main {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 6px;
  padding-top: 6px;
  box-sizing: border-box;
}
.grid {
  flex: 1;
  min-width: 0;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 96px;
  gap: 6px;
  padding: 6px;
  align-content: start;
}
.course {
  padding: 4px 2px;
}
.cicon {
  width: 46px;
  height: 46px;
  object-fit: contain;
}
.cname {
  margin-top: 2px;
  font-size: 12px;
  color: #22405f;
}
.ccost {
  font-size: 11px;
  color: #c07000;
}
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
.dtip {
  margin-top: 6px;
  padding: 6px;
  border: 1px dashed #d5e5f2;
  border-radius: 3px;
  font-size: 11px;
  line-height: 1.6;
  color: #5b7ba3;
}
.dstat {
  margin-top: 6px;
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
</style>
