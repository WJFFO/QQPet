<template>
  <div class="game">
    <!-- 游戏列表：按素材目录分组（经典 / 疯狂宠物 / 冒险岛） -->
    <div v-if="!playing" class="list qq-panel qq-scroll">
      <template v-for="g in groups" :key="g.key">
        <div v-if="g.items.length" class="ghead">
          <span class="gdot"></span>{{ g.label }}
          <span class="gcount">{{ g.items.length }} 款</span>
        </div>
        <div v-if="g.items.length" class="grid">
          <div v-for="it in g.items" :key="it.path" class="qq-cell card" @click="startGame(it)">
            <span class="ico">▶</span>
            <span class="gname" :title="it.name">{{ it.name }}</span>
          </div>
        </div>
      </template>
      <div v-if="!groups.some((g) => g.items.length)" class="qq-empty">没有找到小游戏素材～</div>
    </div>

    <!-- 播放页：Flash 游戏需要鼠标交互，不设拦截层 -->
    <div v-else class="play">
      <div class="play-bar">
        <button class="qq-btn" @click="goBack">← 返回</button>
        <span class="play-name">{{ playingName }}</span>
        <span class="play-hint">每玩 15 秒得 10 元宝，单局上限 {{ GAME_MAX }} 次</span>
        <span class="play-earn" v-if="gameEarned">已得 {{ gameEarned * 10 }} 元宝</span>
      </div>
      <div class="flash-wrap">
        <!-- 原版加载动画：进入游戏先播 GameLoading.swf，再切到游戏本体 -->
        <FlashPlayer v-if="!loading" :key="playerKey" :src="currentSrc" />
        <div v-else class="loading">
          <div class="loading-anim">
            <FlashPlayer src="assets/loading/GameLoading.swf" />
          </div>
          <span class="loading-txt">正在进入游戏…</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import FlashPlayer from '../components/FlashPlayer.vue'

// 分组对应 resources/assets 下的目录；path 是相对 assets 的完整路径
const GROUPS = [
  { key: 'classic', label: '经典小游戏', dir: 'game' },
  { key: 'hpxyx', label: '疯狂宠物', dir: 'game/hpxyx' },
  { key: 'mxd', label: '冒险岛', dir: 'game/mxd' }
]
const groups = ref(GROUPS.map((g) => ({ ...g, items: [] })))
const playing = ref('')
const playingName = ref('')
const currentSrc = ref('')
const playerKey = ref(0)

const GAME_MAX = 15 // 单局最多结算次数
const loading = ref(false) // 是否正在播加载动画
let loadTimer = null
let gameTimer = null
const gameEarned = ref(0)

let offStorage = null
function addCoins(n) {
  const cur = Number(localStorage.getItem('qqpet.coins')) || 0
  localStorage.setItem('qqpet.coins', String(Math.max(0, cur + n)))
  window.api.storageChanged?.()
}

// 开始游戏：先播 1.2s 原版加载动画，再切到游戏本体并按游玩时长累计元宝
function startGame(item) {
  stopReward()
  if (loadTimer) clearTimeout(loadTimer)
  playing.value = item.path
  playingName.value = item.name
  loading.value = true
  currentSrc.value = 'assets/' + item.path
  playerKey.value++
  gameEarned.value = 0
  loadTimer = setTimeout(() => {
    loading.value = false
  }, 1200)
  gameTimer = setInterval(() => {
    if (gameEarned.value < GAME_MAX) {
      gameEarned.value++
      addCoins(10)
      // 玩小游戏也让宝贝开心（与原版一致：玩耍增加心情）
      if (gameEarned.value === 1) window.api.sendControlAction('game')
    } else {
      stopReward()
    }
  }, 15000)
}

function stopReward() {
  if (gameTimer) {
    clearInterval(gameTimer)
    gameTimer = null
  }
}

function settleReward() {
  if (gameEarned.value > 0) {
    window.api.sendPetBubble(`小游戏结束，一共赚了 ${gameEarned.value * 10} 元宝！`)
    gameEarned.value = 0
  }
}

function goBack() {
  stopReward()
  settleReward()
  if (loadTimer) clearTimeout(loadTimer)
  loading.value = false
  playing.value = ''
  playingName.value = ''
}

// 按分组列 swf：组内按文件名自然排序（1起航 → 8宝藏）
onMounted(async () => {
  try {
    const loaded = await Promise.all(
      GROUPS.map(async (g) => {
        const files = await window.api.listFiles(g.dir, 'swf')
        return files.map((f) => ({
          path: `${g.dir}/${f}`,
          name: f.replace(/\.swf$/i, '')
        }))
      })
    )
    groups.value = GROUPS.map((g, i) => ({ ...g, items: loaded[i] }))
  } catch {
    groups.value = GROUPS.map((g) => ({ ...g, items: [] }))
  }
  offStorage = window.api.onStorageChanged?.(() => {})
})
onUnmounted(() => {
  settleReward()
  stopReward()
  if (loadTimer) clearTimeout(loadTimer)
  if (offStorage) offStorage()
})
</script>

<style scoped>
.game {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
}
.list {
  flex: 1;
  min-height: 0;
  padding: 6px 8px 10px;
  box-sizing: border-box;
}
.ghead {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 6px 0 4px;
  padding-bottom: 3px;
  border-bottom: 1px dashed #cfe0ee;
  font-size: 12px;
  font-weight: bold;
  color: #1b3d67;
}
.gdot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: linear-gradient(180deg, #7ebbe7, #3d78b5);
}
.gcount {
  margin-left: auto;
  font-size: 10px;
  font-weight: normal;
  color: #8aa4bf;
}
.grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  grid-auto-rows: 54px;
  gap: 7px;
  align-content: start;
}
.card {
  flex-direction: row;
  gap: 8px;
  padding: 0 10px;
  justify-content: flex-start;
}
.ico {
  flex: none;
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: linear-gradient(180deg, #a7d8f6, #5d9ed6);
  color: #fff;
  font-size: 10px;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.7);
}
.gname {
  font-size: 12px;
  color: #22405f;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.play {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.play-bar {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 4px;
  border-bottom: 1px solid #d3e5f4;
}
.play-name {
  font-size: 13px;
  font-weight: bold;
  color: #1b3d67;
}
.play-hint {
  margin-left: auto;
  font-size: 11px;
  color: #5b7ba3;
}
.play-earn {
  font-size: 12px;
  color: #c07000;
}
.flash-wrap {
  flex: 1;
  min-height: 0;
  background: #000;
  border: 1px solid var(--qq-border);
  border-radius: 3px;
  overflow: hidden;
}

/* 加载层：原版 GameLoading.swf 居中 + 文案 */
.loading {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: radial-gradient(ellipse at 50% 45%, #ffffff 0%, #eaf6ff 70%, #d5ebfb 100%);
}
.loading-anim {
  width: 120px;
  height: 120px;
}
.loading-txt {
  font-size: 12px;
  color: #2b4a72;
}
</style>
