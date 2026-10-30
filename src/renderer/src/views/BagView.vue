<template>
  <div class="bag">
    <div class="top">
      <div class="qq-tabs">
        <div
          v-for="c in cats"
          :key="c.key"
          class="qq-tab"
          :class="{ active: activeCat === c.key }"
          @click="activeCat = c.key"
        >
          {{ c.label }}
        </div>
      </div>
      <span class="hint">{{ tip || '双击物品即可使用' }}</span>
    </div>

    <div v-if="list.length" class="grid qq-panel qq-scroll">
      <div
        v-for="it in shown"
        :key="it.file"
        class="qq-cell cell"
        :title="`${it.name}（${it.count}）— 双击使用`"
        @dblclick="use(it)"
      >
        <img v-if="it.src" class="icon" :src="it.src" alt="" draggable="false" />
        <div class="name">{{ it.name }}</div>
        <div class="eff">{{ effectText(it) }}</div>
        <span class="count">×{{ it.count }}</span>
      </div>
      <div v-if="!shown.length" class="qq-empty">这个分类里还没有东西～</div>
    </div>
    <div v-else class="qq-empty">背包空空的，去商店买点吧～</div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const cats = [
  { key: 'all', label: '全部' },
  { key: 'eat', label: '食品' },
  { key: 'clean', label: '日用品' },
  { key: 'cure', label: '药品' }
]
const activeCat = ref('all')

const list = ref([])
const tip = ref('')
let tipTimer = null

const shown = computed(() =>
  activeCat.value === 'all' ? list.value : list.value.filter((it) => it.effect === activeCat.value)
)

const effectText = (it) =>
  it.effect === 'eat' ? `饱食 +${it.value}` : it.effect === 'clean' ? `清洁 +${it.value}` : `健康 +${it.value}`

// 图标：食品 → img_res/food，清洁与药品 → img_res/medicine
async function load() {
  try {
    const inv = JSON.parse(localStorage.getItem('qqpet.inventory') || '{}')
    const entries = Object.entries(inv).filter(([, it]) => it && it.count > 0)
    list.value = await Promise.all(
      entries.map(async ([file, it]) => {
        const folder = it.effect === 'eat' ? 'food' : 'medicine'
        let src = ''
        try {
          src = await window.api.readImage(`assets/img_res/${folder}/${file}`)
        } catch (_) {
          src = ''
        }
        return { file, count: it.count, name: it.name, effect: it.effect, value: it.value, src }
      })
    )
  } catch (_) {
    list.value = []
  }
}

// 使用物品：交给宠物窗口执行（它会从背包扣除并播放对应动画）
function use(it) {
  window.api.sendControlAction(it.effect)
  tip.value = `让宝贝用掉了 ${it.name}`
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    tip.value = ''
    refreshSync()
  }, 1200)
}

let offStorage = null
let lastInv = ''
async function refreshSync() {
  const raw = localStorage.getItem('qqpet.inventory') || '{}'
  if (raw !== lastInv) {
    lastInv = raw
    await load()
  }
}

onMounted(async () => {
  await refreshSync()
  offStorage = window.api.onStorageChanged?.(refreshSync)
})
onUnmounted(() => {
  if (offStorage) offStorage()
  if (tipTimer) clearTimeout(tipTimer)
})
</script>

<style scoped>
.bag {
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
.hint {
  margin-left: auto;
  padding-right: 6px;
  font-size: 12px;
  color: #5b7ba3;
}
.grid {
  flex: 1;
  min-height: 0;
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  grid-auto-rows: 96px;
  gap: 6px;
  padding: 6px;
  align-content: start;
}
.cell {
  padding: 4px 2px;
}
.cell .icon {
  width: 42px;
  height: 42px;
  object-fit: contain;
}
.cell .name {
  margin-top: 2px;
  font-size: 12px;
  color: #22405f;
  max-width: 100%;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.cell .eff {
  font-size: 11px;
  color: #5b7ba3;
}
.count {
  position: absolute;
  right: 3px;
  bottom: 2px;
  padding: 0 3px;
  border-radius: 6px;
  background: rgba(85, 112, 155, 0.82);
  color: #fff;
  font-size: 10px;
}
</style>
