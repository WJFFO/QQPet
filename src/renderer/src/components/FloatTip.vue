<template>
  <transition name="float">
    <div v-if="show" :key="data.id" class="float-tip" :class="data.kind">
      <img v-if="icon" class="ico" :src="icon" alt="" draggable="false" />
      <span class="txt">{{ data.text }}</span>
    </div>
  </transition>
</template>

<script setup>
import { ref, watch, onUnmounted } from 'vue'
import { asset } from '../ui/useSkin'

// 原版飘字提示（float/addMood 系列图标）：加心情 / 加元宝时在宠物上方飘一下
const props = defineProps({
  data: { type: Object, default: null } // { id, kind: 'mood'|'money', text }
})

const icon = ref('')
const show = ref(false)
let timer = null
const cache = {}

async function pickIcon(kind) {
  if (cache[kind]) return cache[kind]
  let url = ''
  if (kind === 'mood') {
    // 心情飘字：随机取 addMood 下的一张心情图标
    url = await asset(`assets/float/addMood/${Math.floor(Math.random() * 8)}.svg`)
  } else {
    url = await asset('assets/float/addMood/0.svg')
  }
  cache[kind] = url
  return url
}

watch(
  () => props.data,
  async (d) => {
    if (!d) return
    if (timer) clearTimeout(timer)
    icon.value = await pickIcon(d.kind)
    show.value = false
    // 下一帧再显示，保证 key 变化时动画重新播放
    requestAnimationFrame(() => {
      show.value = true
    })
    timer = setTimeout(() => {
      show.value = false
    }, 1800)
  }
)

onUnmounted(() => {
  if (timer) clearTimeout(timer)
})
</script>

<style scoped>
.float-tip {
  position: absolute;
  left: 50%;
  bottom: 62px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px 1px 2px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 1px 3px rgba(35, 64, 110, 0.25);
  pointer-events: none;
  z-index: 10000;
  white-space: nowrap;
}
.ico {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.txt {
  font-size: 11px;
  font-weight: bold;
  color: #c07000;
}
.float-tip.mood .txt {
  color: #d0488a;
}

.float-enter-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.float-leave-active {
  transition: opacity 0.4s ease, transform 0.6s ease;
}
.float-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(6px);
}
.float-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-16px);
}
</style>
