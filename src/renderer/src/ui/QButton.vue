<template>
  <button
    class="qbtn"
    :disabled="disabled"
    @mouseenter="state = 'over'"
    @mouseleave="state = 'up'"
    @mousedown="state = 'down'"
    @mouseup="state = 'over'"
    @click="$emit('click')"
  >
    <img v-if="src" :src="src" :alt="typeLabels[type] || ''" draggable="false" />
    <span v-else class="fallback">{{ typeLabels[type] }}</span>
  </button>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import { asset } from './useSkin'

// 原版按钮：直接使用 stateInfo 下的三态图（正常/悬停/按下），文字已画在图上。
//   kaiqi 开启 / tingzhi 停止 / guanbi 关闭 / shuaxin 刷新
const props = defineProps({
  type: { type: String, default: 'guanbi' }, // kaiqi | tingzhi | guanbi | shuaxin
  disabled: { type: Boolean, default: false }
})
defineEmits(['click'])

const typeLabels = { kaiqi: '开启', tingzhi: '停止', guanbi: '关闭', shuaxin: '刷新' }
const state = ref('up')
const imgs = ref({})
const src = ref('')

async function load() {
  const t = props.type
  const map = {
    up: `assets/stateInfo/${t}_up.png`,
    over: `assets/stateInfo/${t}_over.png`,
    down: `assets/stateInfo/${t}_down.png`
  }
  const out = {}
  for (const [k, rel] of Object.entries(map)) out[k] = await asset(rel)
  imgs.value = out
  src.value = out.up
}
onMounted(load)
watch(() => props.type, load)
watch(state, (s) => {
  src.value = imgs.value[s] || imgs.value.up
})
</script>

<style scoped>
.qbtn {
  padding: 0;
  border: none;
  background: none;
  line-height: 0;
  cursor: pointer;
}
.qbtn img {
  display: block;
}
.qbtn:disabled {
  cursor: not-allowed;
  filter: grayscale(0.6);
  opacity: 0.7;
}
.fallback {
  display: inline-block;
  padding: 3px 12px;
  border: 1px solid #7ba2cd;
  border-radius: 4px;
  background: linear-gradient(180deg, #fdfeff, #dcecf9);
  font-family: inherit;
  font-size: 12px;
  color: #23406e;
  line-height: 1.2;
}
</style>
