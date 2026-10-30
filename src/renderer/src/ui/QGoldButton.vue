<template>
  <button
    class="gold-btn"
    :class="{ disabled }"
    :style="{ backgroundImage: img[state] ? `url(${img[state]})` : undefined }"
    :disabled="disabled"
    @mouseenter="state = 'o'"
    @mouseleave="state = 'n'"
    @mousedown="state = 'd'"
    @mouseup="state = 'o'"
    @click="$emit('click')"
  >
    <slot />
  </button>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { asset } from './useSkin'

// 原版金色按钮三态（tip/vip 下的 2/4/6：常态 / 悬停 / 按下）
// 素材是 53×23 的圆角金条，这里按容器尺寸拉伸铺满，文字叠在中间
defineProps({ disabled: { type: Boolean, default: false } })
defineEmits(['click'])

const img = ref({ n: '', o: '', d: '' })
const state = ref('n')

onMounted(async () => {
  const list = await Promise.all([
    asset('assets/tip/vip/2.svg'),
    asset('assets/tip/vip/4.svg'),
    asset('assets/tip/vip/6.svg')
  ])
  img.value = { n: list[0], o: list[1], d: list[2] }
})
</script>

<style scoped>
.gold-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 62px;
  height: 24px;
  padding: 0 10px;
  border: none;
  background-color: transparent;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  color: #6b3a05;
  font-family: inherit;
  font-size: 12px;
  cursor: pointer;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.6);
}
.gold-btn.disabled,
.gold-btn:disabled {
  filter: grayscale(0.7) opacity(0.6);
  cursor: default;
}
</style>
