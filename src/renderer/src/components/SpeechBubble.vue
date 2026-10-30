<template>
  <div class="speech-bubble" :class="{ visible: visible && text }">
    <div ref="el" class="bubble">{{ shown }}</div>
    <div class="tail"></div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted, nextTick } from 'vue'

const props = defineProps({
  text: { type: String, default: '' },
  visible: { type: Boolean, default: false }
})

const el = ref(null)
const shown = ref('')

// 气泡固定两行高。-webkit-line-clamp 在当前 Chromium 里算出来的 display 是 flow-root，
// 省略号不生效、只按高度硬裁，会露出半截下一行的字；所以这里自己量高度裁字。
// 做法：先把全文放进去，超出两行就逐字回退并补「…」，直到刚好装下。
let fitSeq = 0 // 并发保护：text 和 visible 同时变化会触发两次 fit，不加锁会互相裁剪

async function fit() {
  const seq = ++fitSeq
  const full = String(props.text || '')
  shown.value = full
  if (!full) return
  await nextTick()
  if (seq !== fitSeq) return
  const box = el.value
  if (!box) return
  // clientHeight / scrollHeight 都含上下 padding，直接比即可
  if (box.scrollHeight <= box.clientHeight + 1) return

  let s = full
  let guard = 0
  while (s.length > 1 && guard++ < 80) {
    s = s.slice(0, -1)
    // 已经是省略号就别再叠加
    shown.value = /…$/.test(s) ? s : `${s}…`
    await nextTick()
    if (seq !== fitSeq) return // 有更新的一次 fit 在跑，让位
    if (box.scrollHeight <= box.clientHeight + 1) break
  }
}

watch(
  () => [props.text, props.visible],
  () => {
    if (props.visible) fit()
  }
)
onMounted(() => {
  if (props.visible) fit()
})
</script>

<style scoped>
.speech-bubble {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 3px;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.18s ease;
  z-index: 5;
}
.speech-bubble.visible {
  opacity: 1;
}
.bubble {
  display: inline-block;
  max-width: 92%;
  background: #fff9e8;
  color: #5a3a00;
  border: 2px solid #e0a63a;
  border-radius: 12px;
  padding: 5px 8px;
  font-size: 11px;
  line-height: 15px; /* 整数行高：两行 30px，裁切不会切在行中间 */
  /* 全局是 border-box：30px 文字 + 上下 padding 10 + 边框 4 = 44px，正好两行 */
  max-height: 44px;
  overflow: hidden;
  text-align: center;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.25);
  word-break: break-word;
}
.tail {
  width: 0;
  height: 0;
  border-left: 8px solid transparent;
  border-right: 8px solid transparent;
  border-top: 10px solid #e0a63a;
  margin-top: -1px;
}
</style>
