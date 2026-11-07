<template>
  <div class="al" :style="{ backgroundImage: `url(${bg})` }">
    <div class="drag"></div>
    <img
      class="close"
      :src="closeImgs[closeState]"
      alt="关闭"
      draggable="false"
      @mouseenter="closeState = 1"
      @mouseleave="closeState = 0"
      @mousedown="closeState = 2"
      @mouseup="closeState = 1"
      @click="answer(false)"
    />

    <img v-if="icon" class="icon" :src="icon" alt="" draggable="false" />
    <div class="text">{{ text }}</div>

    <div class="btns">
      <img
        class="btn"
        :src="okImgs[okState]"
        alt="确定"
        draggable="false"
        @mouseenter="okState = 1"
        @mouseleave="okState = 0"
        @mousedown="okState = 2"
        @mouseup="okState = 1"
        @click="answer(true)"
      />
      <img
        v-if="mode === 'confirm'"
        class="btn"
        :src="cancelImgs[cancelState]"
        alt="取消"
        draggable="false"
        @mouseenter="cancelState = 1"
        @mouseleave="cancelState = 0"
        @mousedown="cancelState = 2"
        @mouseup="cancelState = 1"
        @click="answer(false)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { asset } from '../ui/useSkin'

// 原版通用提示框（tip/alert，290×187）：背景自带「提示」标题，左下提示图标 + 文案 + 按钮。
// 参数通过 URL query 传入：text / mode(alert|confirm) / id（回传给发起窗口的请求号）
const params = new URLSearchParams(location.search)
const text = ref(params.get('text') || '')
const mode = ref(params.get('mode') === 'confirm' ? 'confirm' : 'alert')
const reqId = params.get('id') || ''

const bg = ref('')
const icon = ref('')
const closeImgs = ref(['', '', ''])
const okImgs = ref(['', '', ''])
const cancelImgs = ref(['', '', ''])
const closeState = ref(0)
const okState = ref(0)
const cancelState = ref(0)

function answer(ok) {
  window.api.alertResult?.({ id: reqId, ok })
  window.api.closeSelf()
}

onMounted(async () => {
  bg.value = await asset('assets/tip/alert/bg.png')
  icon.value = await asset('assets/tip/alert/icon.png')
  closeImgs.value = await Promise.all([0, 1, 2].map((i) => asset(`assets/tip/alert/btnclose_0${i}.png`)))
  okImgs.value = await Promise.all([0, 1, 2].map((i) => asset(`assets/tip/alert/btnok_0${i}.png`)))
  cancelImgs.value = await Promise.all([0, 1, 2].map((i) => asset(`assets/tip/alert/btncancel_0${i}.png`)))

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') answer(false)
    if (e.key === 'Enter') answer(true)
  })
})
</script>

<style>
html,
body,
#app {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: transparent !important;
  -webkit-user-select: none;
  user-select: none;
  font-family: '宋体', SimSun, 'Microsoft YaHei', sans-serif;
  font-size: 12px;
  color: #6b4a1e;
}
</style>

<style scoped>
.al {
  position: relative;
  width: 290px;
  height: 187px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  box-sizing: border-box;
}
.drag {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  height: 26px;
  -webkit-app-region: drag;
}
.close {
  position: absolute;
  right: 8px;
  top: 6px;
  width: 26px;
  height: 16px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

.icon {
  position: absolute;
  left: 18px;
  top: 42px;
  width: 47px;
  height: 44px;
}

.text {
  position: absolute;
  left: 74px;
  top: 34px;
  width: 196px;
  height: 76px;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.7;
  color: #6b4a1e;
  word-break: break-all;
  white-space: pre-line;
}
.text::-webkit-scrollbar {
  width: 8px;
}
.text::-webkit-scrollbar-thumb {
  background: #d9c49a;
  border-radius: 4px;
}

.btns {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 14px;
  display: flex;
  justify-content: center;
  gap: 16px;
}
.btn {
  width: 82px;
  height: 39px;
  cursor: pointer;
}
</style>
