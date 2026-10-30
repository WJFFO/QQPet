<template>
  <div class="ps" :style="{ backgroundImage: `url(${bg})` }">
    <!-- 原版窗口：顶部 33px 为拖动区，右上角为红色关闭钮（对应 AdoptDlg.xml） -->
    <div class="drag"></div>
    <img
      class="close"
      :src="closeState === 2 ? imgs.close_02 : closeState === 1 ? imgs.close_01 : imgs.close_00"
      alt="关闭"
      draggable="false"
      @mouseenter="closeState = 1"
      @mouseleave="closeState = 0"
      @mousedown="closeState = 2"
      @mouseup="closeState = 1"
      @click="cancel"
    />

    <!-- 性别：两个蛋期形象预览 -->
    <div class="cards">
      <div class="card" :class="{ on: gender === 'GG' }" @click="gender = 'GG'">
        <div class="pv"><FlashPlayer src="assets/Action/GG/Egg/Stand.swf" /></div>
        <div class="lbl">QGG</div>
      </div>
      <div class="card" :class="{ on: gender === 'MM' }" @click="gender = 'MM'">
        <div class="pv"><FlashPlayer src="assets/Action/MM/Egg/Stand.swf" /></div>
        <div class="lbl">QMM</div>
      </div>
    </div>

    <!-- 命名 -->
    <div class="name-row">
      <span class="k">名字</span>
      <input
        v-model="name"
        class="qq-input nm"
        maxlength="10"
        placeholder="给宝贝起个名字"
        @keydown.enter="adopt"
      />
    </div>

    <!-- 领养 -->
    <button class="qq-btn primary go" :disabled="!name.trim()" @click="adopt">领养</button>
    <div v-if="err" class="err">{{ err }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import FlashPlayer from '../components/FlashPlayer.vue'
import { asset } from '../ui/useSkin'

const bg = ref('')
const imgs = reactive({ close_00: '', close_01: '', close_02: '' })
const closeState = ref(0)
const gender = ref('GG')
const name = ref('')
const err = ref('')

async function load() {
  bg.value = await asset('assets/login/UI/adoptbg.png')
  imgs.close_00 = await asset('assets/login/UI/Button_close_00.png')
  imgs.close_01 = await asset('assets/login/UI/Button_close_01.png')
  imgs.close_02 = await asset('assets/login/UI/Button_close_02.png')
}
onMounted(load)

function adopt() {
  if (!name.value.trim()) {
    err.value = '先给宝贝起个名字吧'
    return
  }
  try {
    localStorage.setItem('qqpet.gender', gender.value)
    localStorage.setItem('qqpet.name', name.value.trim())
    localStorage.setItem('qqpet.adopted', '1')
  } catch (_) {
    /* ignore */
  }
  window.api.adoptPet({ gender: gender.value, name: name.value.trim() })
}

function cancel() {
  window.api.closeSelf()
}
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
  color: #2b4a72;
}
</style>

<style scoped>
/* 340×213，与原版 AdoptDlg 尺寸一致 */
.ps {
  position: relative;
  width: 340px;
  height: 213px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  box-sizing: border-box;
}
.drag {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 33px;
  -webkit-app-region: drag;
}
.close {
  position: absolute;
  right: 6px;
  top: 5px;
  width: 13px;
  height: 15px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

/* 性别卡：占用横幅下方的空白区 */
.cards {
  position: absolute;
  left: 10px;
  right: 10px;
  top: 42px;
  display: flex;
  justify-content: center;
  gap: 14px;
}
.card {
  width: 92px;
  height: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  border: 1px solid #c3d9ec;
  border-radius: 5px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.9);
  cursor: pointer;
}
.card:hover {
  border-color: #8fc0e6;
  background: rgba(255, 255, 255, 0.92);
}
.card.on {
  border-color: #f0a24a;
  background: #fffaf0;
  box-shadow: 0 0 0 2px rgba(255, 178, 80, 0.5), inset 0 0 0 1px #fff;
}
.pv {
  width: 66px;
  height: 62px;
  margin-top: 2px;
}
.lbl {
  margin-top: 1px;
  font-size: 12px;
  font-weight: bold;
  color: #23406e;
}

/* 命名 + 领养 */
.name-row {
  position: absolute;
  left: 34px;
  top: 136px;
  display: flex;
  align-items: center;
  gap: 6px;
}
.k {
  color: #35577f;
}
.nm {
  width: 150px;
  -webkit-user-select: text;
  user-select: text;
}
.go {
  position: absolute;
  left: 50%;
  top: 164px;
  transform: translateX(-50%);
  min-width: 96px;
  height: 24px;
  font-size: 13px;
}
.err {
  position: absolute;
  left: 0;
  right: 0;
  top: 192px;
  text-align: center;
  font-size: 11px;
  color: #c8402b;
}
</style>
