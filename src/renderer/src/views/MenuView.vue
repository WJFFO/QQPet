<template>
  <div class="menu-root" @contextmenu.prevent>
    <div class="panel">
      <!-- 顶部标题条：原版菜单的蓝色渐变胶囊头，标题显示昵称与等级 -->
      <div class="head">
        <span class="head-text">{{ nick }}</span>
        <span class="head-lv">Lv.{{ lvl }}</span>
        <span class="head-close" @click="closeSelf">×</span>
      </div>

      <div class="items">
        <template v-for="(it, i) in items" :key="it.action || `sep-${i}`">
          <div v-if="it.sep" class="sep"></div>
          <div
            v-else-if="it.group"
            class="group"
          >{{ it.group }}</div>
          <div
            v-else
            class="item"
            :class="{ on: isChecked(it), alert: it.alert }"
            @click="onClick(it)"
          >
            <img v-if="iconMap[it.icon]" class="ico" :src="iconMap[it.icon]" alt="" draggable="false" />
            <span v-else class="dot"></span>
            <span class="label">{{ it.label }}</span>
            <span v-if="it.check" class="check" :class="{ on: isChecked(it) }">✓</span>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { asset } from '../ui/useSkin'
import { SICK_AT } from '../composables/stats'

// 原版 QQ 宠物右键菜单：浅蓝玻璃圆角面板 + 蓝色渐变标题条 + 分组菜单项，
// 悬停为蓝色高亮（色值取自 Menu/ditu04.bmp）；左侧功能图标取自 control/icons。
// 标题显示当前昵称与等级（档案页改名后重开菜单即同步）。
const nick = ref(localStorage.getItem('qqpet.name') || 'QQ宠物')
const lvl = ref(Number(localStorage.getItem('qqpet.level')) || 1)
// 生病时把「喂药」顶到最前面并标出来，免得像以前那样只能翻背包找药。
// 生病有两个来源：概率生病留下的标记，以及健康掉到硬线以下。
const health = ref(Number(localStorage.getItem('qqpet.health') ?? 100))
const sickFlag = ref(localStorage.getItem('qqpet.sick') === '1')
const sick = computed(() => sickFlag.value || health.value <= SICK_AT)

const items = computed(() => [
  ...(sick.value ? [{ action: 'cure', label: '喂药（生病了）', icon: 'zhibing', alert: true }] : []),
  { action: 'eat', label: '喂食', icon: 'weishi' },
  { action: 'cure', label: '喂药', icon: 'zhibing', hideWhenSick: true },
  { action: 'clean', label: '洗澡', icon: 'qingjie' },
  { action: 'play', label: '玩耍', icon: 'wanshua' },
  { action: 'work', label: '打工', icon: 'dagong' },
  { action: 'study', label: '学习', icon: 'xuexi' },
  { sep: true },
  { action: 'info', label: '宠物档案', icon: 'chongwu' },
  { action: 'task', label: '每日任务', icon: 'renwu' },
  { action: 'friend', label: '好友', icon: 'haoyou' },
  { action: 'chat', label: '和宝贝聊天', icon: 'gonggao' },
  { action: 'shop', label: '商店', icon: 'jlyy' },
  { action: 'bag', label: '背包', icon: 'richang' },
  { action: 'game', label: '小游戏', icon: 'qqgamehall' },
  { sep: true },
  { action: 'toggle-always-on-top', label: '宠物置顶', check: true },
  { action: 'toggle-mouse-through', label: '鼠标穿透', check: true },
  { sep: true },
  { action: 'settings', label: '系统设置' },
  { action: 'help', label: '帮助' },
  { action: 'hide', label: '隐藏宠物' },
  { action: 'exit', label: '退出' }
]
  // 生病时上面已有醒目的「喂药（生病了）」，这条普通的就不重复了
  .filter((it) => !(it.hideWhenSick && sick.value)))

// 图标异步加载（dataURL），失败则退化回圆点
const iconMap = reactive({})
onMounted(async () => {
  const keys = [...new Set(items.value.filter((it) => it.icon).map((it) => it.icon))]
  await Promise.all(
    keys.map(async (k) => {
      iconMap[k] = await asset(`assets/control/icons/${k}.png`)
    })
  )
})

const prefs = reactive({ alwaysOnTop: false, mouseThrough: false })
window.api.getWindowPrefs().then((p) => {
  prefs.alwaysOnTop = !!p.alwaysOnTop
  prefs.mouseThrough = !!p.mouseThrough
})
window.api.onWindowPrefsChanged((p) => {
  prefs.alwaysOnTop = !!p.alwaysOnTop
  prefs.mouseThrough = !!p.mouseThrough
})

function isChecked(it) {
  if (it.action === 'toggle-always-on-top') return prefs.alwaysOnTop
  if (it.action === 'toggle-mouse-through') return prefs.mouseThrough
  return false
}

function onClick(it) {
  if (!it.action) return
  window.api.contextMenuAction(it.action)
}

function closeSelf() {
  window.api.closeSelf()
}

// 失焦自动关闭由主进程 blur 处理；这里额外监听 Esc
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSelf()
})
</script>

<style>
html,
body,
#app {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  background: transparent !important;
  overflow: hidden !important;
  -webkit-user-select: none;
  user-select: none;
  font-family: '宋体', SimSun, 'Microsoft YaHei', sans-serif;
  font-size: 12px;
}
</style>

<style scoped>
.menu-root {
  width: 100%;
  height: 100%;
  padding: 4px;
  box-sizing: border-box;
}

/* 面板：与原版一致的白蓝玻璃 + 深蓝描边 + 外投影 */
.panel {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid #55709b;
  border-radius: 6px;
  background: linear-gradient(180deg, #e9faff 0%, #f4fcff 55%, #ffffff 100%);
  box-shadow: 0 4px 14px rgba(35, 64, 110, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.9);
  overflow: hidden;
}

/* 标题条 */
.head {
  flex: none;
  height: 20px;
  display: flex;
  align-items: center;
  padding: 0 5px 0 8px;
  background: linear-gradient(180deg, #7ebbe7 0%, #6698c7 100%);
  border-bottom: 1px solid #55709b;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.6);
}
.head-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  color: #fff;
  font-size: 11px;
  letter-spacing: 1px;
  text-shadow: 0 1px 1px rgba(35, 64, 110, 0.5);
}
.head-lv {
  flex: none;
  margin-right: 6px;
  color: #eaf6ff;
  font-size: 10px;
  text-shadow: 0 1px 1px rgba(35, 64, 110, 0.55);
}
.head-close {
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  background: linear-gradient(180deg, #ff8a95, #e02b4a);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
}

/* 菜单项 */
.items {
  flex: 1;
  min-height: 0;
  padding: 4px 3px;
  box-sizing: border-box;
  /* 万一再加菜单项，宁可滚动也不要裁掉最后几行 */
  overflow-y: auto;
}
.item {
  position: relative;
  display: flex;
  align-items: center;
  height: 22px;
  padding: 0 6px;
  border-radius: 3px;
  color: #22405f;
  cursor: pointer;
  white-space: nowrap;
}
.item:hover {
  background: linear-gradient(180deg, #cfe9fb 0%, #a9d3f0 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.8);
  color: #12324f;
}
.item:active {
  background: linear-gradient(180deg, #a8d5f2 0%, #86bfe6 100%);
}
/* 生病时的「喂药」：红底加粗，一眼能看到 */
.item.alert {
  color: #b3271e;
  font-weight: bold;
  background: linear-gradient(180deg, #ffe9e6 0%, #ffd9d3 100%);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9);
}
.item.alert:hover {
  background: linear-gradient(180deg, #ffd9d3 0%, #ffbfb4 100%);
  color: #8f1a13;
}
.dot {
  width: 3px;
  height: 3px;
  margin-right: 7px;
  border-radius: 50%;
  background: #8fabc9;
  flex: none;
}
.ico {
  flex: none;
  width: 15px;
  height: 15px;
  margin-right: 5px;
  object-fit: contain;
}
.item:hover .dot {
  background: #3d78b5;
}
.label {
  flex: 1;
}
.check {
  margin-left: 8px;
  color: transparent;
  font-size: 11px;
}
.check.on {
  color: #2f7bbf;
  font-weight: bold;
}
.item:hover .check.on {
  color: #14568f;
}

.sep {
  height: 1px;
  margin: 4px 6px;
  background: linear-gradient(90deg, rgba(85, 112, 155, 0), rgba(85, 112, 155, 0.55), rgba(85, 112, 155, 0));
}
.group {
  padding: 2px 6px 2px 10px;
  font-size: 11px;
  color: #8aa4bf;
}
</style>
