<template>
  <div class="qchk" :class="{ checked: modelValue }" @click="$emit('update:modelValue', !modelValue)">
    <img class="box" :src="src" alt="" draggable="false" />
    <span v-if="label" class="txt">{{ label }}</span>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { asset } from './useSkin'

// 原版勾选框 / 单选框：sysSeting 下的 fangxuankuang（方）/ yuanxuankuang（圆）三态图。
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  label: { type: String, default: '' },
  type: { type: String, default: 'check' } // check | radio
})
defineEmits(['update:modelValue'])

const imgs = ref({ off: '', on: '' })

async function load() {
  const base = props.type === 'radio' ? 'yuanxuankuang' : 'fangxuankuang'
  imgs.value = {
    off: await asset(`assets/sysSeting/${base}00.png`),
    on: await asset(`assets/sysSeting/${base}02.png`)
  }
}
onMounted(load)

const src = computed(() => (props.modelValue ? imgs.value.on : imgs.value.off))
</script>

<style scoped>
.qchk {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  user-select: none;
}
.box {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.txt {
  font-size: 12px;
  color: #6b4a1e;
}
</style>
