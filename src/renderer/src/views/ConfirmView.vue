<template>
  <div class="cf" :style="{ backgroundImage: `url(${bg})` }">
    <div class="drag"></div>
    <img v-if="txt" class="txt" :src="txt" alt="确定要退出QQ宠物吗？" draggable="false" />

    <!-- 退出 / 再玩一会：原版 Button_exit 74×20 三态图 + 叠加文字 -->
    <div class="btn exit" @mouseenter="exitState = 1" @mouseleave="exitState = 0" @click="doExit">
      <img :src="exitImgs[exitState]" alt="" draggable="false" />
      <span>退出</span>
    </div>
    <div class="btn cancel" @mouseenter="cancelState = 1" @mouseleave="cancelState = 0" @click="closeSelf">
      <img :src="cancelImgs[cancelState]" alt="" draggable="false" />
      <span>再玩一会</span>
    </div>

    <!-- 记住我的选择 -->
    <div class="chk" @click="remember = !remember">
      <img :src="remember ? checkOn : checkOff" alt="" draggable="false" />
      <span>记住我的选择，以后不再提醒</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { asset } from '../ui/useSkin'

const bg = ref('')
const txt = ref('')
const exitImgs = ref(['', '', ''])
const cancelImgs = ref(['', '', ''])
const checkOff = ref('')
const checkOn = ref('')
const exitState = ref(0)
const cancelState = ref(0)
const remember = ref(false)

function closeSelf() {
  window.api.closeSelf()
}

// 确认退出：把 exit-force 交给宠物窗口（它播完 Exit 动画再真正退出）
function doExit() {
  if (remember.value) localStorage.setItem('qqpet.skipExitConfirm', '1')
  window.api.sendControlAction('exit-force')
  window.api.closeSelf()
}

onMounted(async () => {
  bg.value = await asset('assets/iconList/OnlineQuitPrompt/exitbg.png')
  txt.value = await asset('assets/iconList/OnlineQuitPrompt/picTxt.png')
  exitImgs.value = await Promise.all(
    [0, 1, 2].map((i) => asset(`assets/iconList/OnlineQuitPrompt/Button_exit_0${i}.png`))
  )
  cancelImgs.value = exitImgs.value
  checkOff.value = await asset('assets/sysSeting/fangxuankuang00.png')
  checkOn.value = await asset('assets/sysSeting/fangxuankuang02.png')
  // Esc = 再玩一会（不退出）
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSelf()
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
/* 253×81，与原版 ExitDlg / OnlineQuitPrompt 一致 */
.cf {
  position: relative;
  width: 253px;
  height: 81px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  box-sizing: border-box;
}
.drag {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 24px;
  -webkit-app-region: drag;
}
.txt {
  position: absolute;
  left: 20px;
  top: 9px;
  width: 226px;
  height: 14px;
}

.btn {
  position: absolute;
  top: 30px;
  width: 74px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}
.btn img {
  position: absolute;
  inset: 0;
  width: 74px;
  height: 20px;
}
.btn span {
  position: relative;
  font-size: 12px;
  color: #6b4a1e;
}
.btn.exit {
  left: 35px;
}
.btn.cancel {
  left: 145px;
}

.chk {
  position: absolute;
  left: 34px;
  top: 55px;
  display: flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}
.chk img {
  width: 14px;
  height: 14px;
}
.chk span {
  font-size: 11px;
  color: #8a6c42;
}
</style>
