<template>
  <img v-if="frames.length" class="frame-anim" :src="frames[idx % frames.length]" alt="" draggable="false" />
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'

// 原版序列帧动画（active/work、active/study 下的 00–03 四帧 PNG），循环播放。
const props = defineProps({
  frames: { type: Array, default: () => [] },
  interval: { type: Number, default: 320 },
  playing: { type: Boolean, default: true }
})

const idx = ref(0)
let timer = null

function start() {
  stop()
  if (!props.playing || props.frames.length < 2) return
  timer = setInterval(() => {
    idx.value = (idx.value + 1) % props.frames.length
  }, props.interval)
}
function stop() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

onMounted(start)
onUnmounted(stop)
watch(() => [props.frames, props.playing, props.interval], start, { deep: true })
</script>

<style scoped>
.frame-anim {
  width: 100%;
  height: 100%;
  object-fit: contain;
}
</style>
