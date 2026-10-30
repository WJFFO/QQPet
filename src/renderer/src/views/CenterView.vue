<template>
  <QFrame title="QQ宠物" @close="close">
    <template #extra>
      <span class="coin-inline"><b>元宝</b> {{ coins }}</span>
    </template>

    <!-- 左侧竖排导航：原版商店/档案的分类栏样式，图标取自 control/icons -->
    <div class="nav">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="qq-side-item"
        :class="{ active: activeTab === t.key }"
        @click="activeTab = t.key"
      >
        <img v-if="icons[t.icon]" class="nav-ico" :src="icons[t.icon]" alt="" draggable="false" />
        <span class="nav-txt">{{ t.label }}</span>
      </div>
      <div class="nav-foot">
        <span class="qq-weak">Lv.</span>{{ level }}
      </div>
    </div>

    <!-- 内容区：v-show 切换，组件实例保留（小游戏播放/商店选中状态不丢） -->
    <div class="body">
      <InfoView v-show="activeTab === 'info'" @close="close" />
      <ShopView v-show="activeTab === 'shop'" />
      <BagView v-show="activeTab === 'bag'" />
      <GameView v-show="activeTab === 'game'" />
      <WorkView v-show="activeTab === 'work'" />
      <StudyView v-show="activeTab === 'study'" />
      <TaskView v-show="activeTab === 'task'" />
      <FriendView v-show="activeTab === 'friend'" />
    </div>
  </QFrame>
</template>

<script setup>
import { ref, reactive, onMounted, onUnmounted } from 'vue'
import QFrame from '../ui/QFrame.vue'
import { asset } from '../ui/useSkin'
import InfoView from './InfoView.vue'
import ShopView from './ShopView.vue'
import BagView from './BagView.vue'
import GameView from './GameView.vue'
import WorkView from './WorkView.vue'
import StudyView from './StudyView.vue'
import TaskView from './TaskView.vue'
import FriendView from './FriendView.vue'

// 初始标签由主进程加载 URL 的 ?tab= 决定（open-shop/open-game/open-info/open-work/open-study）
const tabs = [
  { key: 'info', label: '档案', icon: 'chongwu' },
  { key: 'shop', label: '商店', icon: 'jlyy' },
  { key: 'bag', label: '背包', icon: 'richang' },
  { key: 'game', label: '小游戏', icon: 'qqgamehall' },
  { key: 'work', label: '打工', icon: 'dagong' },
  { key: 'study', label: '学习', icon: 'xuexi' },
  { key: 'task', label: '任务', icon: 'renwu' },
  { key: 'friend', label: '好友', icon: 'haoyou' }
]
const queryTab = new URLSearchParams(location.search).get('tab') || 'info'
const activeTab = ref(tabs.some((t) => t.key === queryTab) ? queryTab : 'info')

// 导航图标（control/icons 下的原版功能图标）
const icons = reactive({})
async function loadIcons() {
  const keys = [...new Set(tabs.map((t) => t.icon))]
  await Promise.all(
    keys.map(async (k) => {
      icons[k] = await asset(`assets/control/icons/${k}.png`)
    })
  )
}

// 顶栏元宝 + 等级：与宠物窗口同 partition，直接读 localStorage，靠 storage-changed 广播刷新
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)
const level = ref(Number(localStorage.getItem('qqpet.level')) || 1)
let offStorage = null
let offTab = null
function refresh() {
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
  level.value = Number(localStorage.getItem('qqpet.level')) || 1
}

function close() {
  window.api.closeSelf()
}

onMounted(() => {
  refresh()
  loadIcons()
  offStorage = window.api.onStorageChanged?.(refresh)
  // 窗口已存在时，从右键菜单再次点「商店/打工/…」由主进程通知切页，而不是重建窗口
  offTab = window.api.onCenterTab?.((tab) => {
    if (tabs.some((t) => t.key === tab)) activeTab.value = tab
  })
})
onUnmounted(() => {
  if (offStorage) offStorage()
  if (offTab) offTab()
})
</script>

<style scoped>
.coin-inline {
  font-size: 11px;
  color: #23406e;
}
.coin-inline b {
  margin-right: 2px;
  color: #8e580a;
}

/* 左侧导航栏 */
.nav {
  flex: none;
  width: 96px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 4px;
  box-sizing: border-box;
  border-right: 1px solid #d3e5f4;
  background: linear-gradient(180deg, #f6fcff 0%, #e7f4fd 100%);
}
.nav .qq-side-item {
  height: 27px;
  font-size: 12px;
  padding: 0 6px;
  gap: 6px;
}
.nav-ico {
  flex: none;
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.nav-txt {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
}
.nav-foot {
  margin-top: auto;
  padding: 4px 8px;
  font-size: 11px;
  color: #7a94b0;
  border-top: 1px dashed #cfe0ee;
}

.body {
  position: relative;
  flex: 1;
  min-width: 0;
  padding: 6px;
  box-sizing: border-box;
}
.body > * {
  width: 100%;
  height: 100%;
}
</style>
