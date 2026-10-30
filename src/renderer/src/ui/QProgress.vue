<template>
  <div class="qbar" :style="{ height: `${height}px` }">
    <div class="qbar-fill" :style="fillStyle"></div>
    <span v-if="text" class="qbar-text">{{ text }}</span>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { barSlices } from './useSkin'

// 原版三段式进度条：左帽/中段平铺/右帽全部使用 stateInfo 下的原图切片，
// 高度固定 14px（切片原生高度），颜色按原版语义取（饱食绿 / 清洁蓝 / 心情黄 / 健康红）。
const props = defineProps({
  value: { type: Number, default: 0 }, // 0–100
  color: { type: String, default: 'green' },
  height: { type: Number, default: 14 },
  text: { type: String, default: '' }
})

const slices = ref({ l: '', m: '', r: '' })

async function load() {
  slices.value = await barSlices(props.color)
}
onMounted(load)
watch(() => props.color, load)

const pct = computed(() => Math.max(0, Math.min(100, Number(props.value) || 0)))

const fillStyle = computed(() => {
  const { l, m, r } = slices.value
  if (!l) {
    // 素材缺失时的同色系兜底
    const fallback = { green: '#a9ea07', blue: '#22d6fb', yellow: '#fed95a', red: '#e11a00', orange: '#ffbd3d', deepblue: '#3a7fd0' }
    return {
      width: `${pct.value}%`,
      background: fallback[props.color] || fallback.green,
      borderRadius: '3px'
    }
  }
  return {
    width: `${pct.value}%`,
    backgroundImage: `url(${l}), url(${m}), url(${r})`,
    backgroundRepeat: 'no-repeat, repeat-x, no-repeat',
    backgroundPosition: 'left center, left center, right center'
  }
})
</script>

<style scoped>
.qbar {
  position: relative;
  width: 100%;
  box-sizing: border-box;
  border: 1px solid #9db9d4;
  border-radius: 3px;
  background: #eef6fc;
  box-shadow: inset 0 1px 2px rgba(85, 112, 155, 0.25);
  overflow: hidden;
}
.qbar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  min-width: 4px;
  transition: width 0.35s ease;
}
.qbar-text {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  color: #23406e;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.9);
  pointer-events: none;
}
</style>
