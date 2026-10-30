<template>
  <div ref="track" class="qslider" :style="{ width: `${width}px` }" @pointerdown="onDown">
    <img class="bg" :src="bg" alt="" draggable="false" />
    <img
      class="handle"
      :src="dragging ? imgs.hover : imgs.normal"
      alt=""
      draggable="false"
      :style="{ left: `${pos}px` }"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { asset } from './useSkin'

// 原版音量滑条：yinxiaotiao.png 作轨道，tuodonganniu00/01 作手柄（按住态用 01）
const props = defineProps({
  modelValue: { type: Number, default: 100 }, // 0–100
  width: { type: Number, default: 172 }
})
const emit = defineEmits(['update:modelValue'])

const track = ref(null)
const bg = ref('')
const imgs = ref({ normal: '', hover: '' })
const dragging = ref(false)

const HANDLE_W = 10
const pos = computed(() => {
  const inner = props.width - HANDLE_W
  return Math.round((Math.max(0, Math.min(100, props.modelValue)) / 100) * inner)
})

async function load() {
  bg.value = await asset('assets/sysSeting/yinxiaotiao.png')
  imgs.value = {
    normal: await asset('assets/sysSeting/tuodonganniu00.png'),
    hover: await asset('assets/sysSeting/tuodonganniu01.png')
  }
}
onMounted(() => {
  load()
  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
})
onUnmounted(() => {
  window.removeEventListener('pointermove', onMove)
  window.removeEventListener('pointerup', onUp)
})

function setByClientX(clientX) {
  const el = track.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  const ratio = (clientX - rect.left - HANDLE_W / 2) / (rect.width - HANDLE_W)
  emit('update:modelValue', Math.round(Math.max(0, Math.min(1, ratio)) * 100))
}

function onDown(e) {
  dragging.value = true
  setByClientX(e.clientX)
}
function onMove(e) {
  if (dragging.value) setByClientX(e.clientX)
}
function onUp() {
  dragging.value = false
}
</script>

<style scoped>
.qslider {
  position: relative;
  height: 15px;
  cursor: pointer;
}
.bg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 15px;
  object-fit: fill;
}
.handle {
  position: absolute;
  top: 0;
  width: 10px;
  height: 15px;
}
</style>
