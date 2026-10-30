<template>
  <div class="hp">
    <!-- 原版帮助窗：左段(134，含标题栏) + 中段平铺 + 右段(34)，整体 350×197 -->
    <div class="bg-row">
      <img v-if="left" class="p-left" :src="left" alt="" draggable="false" />
      <div class="p-mid" :style="{ backgroundImage: mid ? `url(${mid})` : 'none' }"></div>
      <img v-if="right" class="p-right" :src="right" alt="" draggable="false" />
    </div>

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
      @click="closeSelf"
    />

    <!-- 内容区：原版 banner + 玩法说明 -->
    <div class="content">
      <img v-if="pic" class="banner" :src="pic" alt="" draggable="false" />
      <div class="lines">
        <div class="ln"><b>喂养</b>：饱食上限 1080、清洁 720，每分钟各掉 2 点，打工时掉得更快。</div>
        <div class="ln"><b>成长</b>：在线每小时 +1 成长值，心情 600 以上 +2。5 级破壳约 9 小时、10 级成年、40 级满级。</div>
        <div class="ln"><b>赚钱</b>：5 级后可打工，按时长结算元宝；上课有奖学金。成长值靠在线时长慢慢攒。</div>
        <div class="ln"><b>心情</b>：0~1000，每分钟 -2，饿了或脏了掉得更快；600 以上成长速度翻倍。</div>
        <div class="ln"><b>健康</b>：饱食、清洁或心情变差时下降，都恢复后慢慢回升；生病不会死亡。</div>
      </div>
      <img
        class="ok"
        :src="okImgs[okState]"
        alt="确定"
        draggable="false"
        @mouseenter="okState = 1"
        @mouseleave="okState = 0"
        @mousedown="okState = 2"
        @mouseup="okState = 1"
        @click="closeSelf"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { asset } from '../ui/useSkin'

const left = ref('')
const mid = ref('')
const right = ref('')
const pic = ref('')
const closeImgs = ref(['', '', ''])
const okImgs = ref(['', '', ''])
const closeState = ref(0)
const okState = ref(0)

function closeSelf() {
  window.api.closeSelf()
}

onMounted(async () => {
  left.value = await asset('assets/help/bg-left2.bmp')
  mid.value = await asset('assets/help/bg-mid.bmp')
  right.value = await asset('assets/help/bg-right2.bmp')
  pic.value = await asset('assets/help/pic.bmp')
  closeImgs.value = await Promise.all([0, 1, 2].map((i) => asset(`assets/help/guanbi0${i}.png`)))
  okImgs.value = await Promise.all([0, 1, 2].map((i) => asset(`assets/help/anniu0${i}.png`)))
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
.hp {
  position: relative;
  width: 350px;
  height: 230px;
  overflow: hidden;
}

/* 三段背景拼成整窗 */
.bg-row {
  position: absolute;
  inset: 0;
  display: flex;
}
.p-left {
  width: 134px;
  height: 100%;
  flex: none;
}
.p-mid {
  flex: 1;
  min-width: 0;
  background-repeat: repeat-x;
  background-size: auto 100%;
}
.p-right {
  width: 34px;
  height: 100%;
  flex: none;
}

.drag {
  position: absolute;
  left: 0;
  top: 0;
  right: 0;
  height: 24px;
  -webkit-app-region: drag;
}
.close {
  position: absolute;
  right: 8px;
  top: 6px;
  width: 26px;
  height: 15px;
  cursor: pointer;
  -webkit-app-region: no-drag;
}

/* 内容区：压在背景的内嵌浅米色区域上 */
.content {
  position: absolute;
  left: 14px;
  top: 26px;
  width: 322px;
  height: 194px;
  display: flex;
  flex-direction: column;
  align-items: center;
  box-sizing: border-box;
}
.banner {
  width: 300px;
  height: 44px;
  object-fit: cover;
  border-radius: 3px;
  box-shadow: 0 1px 3px rgba(120, 90, 40, 0.25);
}
.lines {
  flex: 1;
  min-height: 0;
  width: 100%;
  margin-top: 4px;
  padding: 0 4px;
  box-sizing: border-box;
  overflow-y: auto;
}
.lines::-webkit-scrollbar {
  width: 8px;
}
.lines::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #e6cf9f, #c9a96c);
  border-radius: 4px;
}
.ln {
  font-size: 11px;
  line-height: 1.75;
  color: #6b4a1e;
  white-space: normal;
}
.ln b {
  color: #8e580a;
}
.ok {
  width: 74px;
  height: 35px;
  cursor: pointer;
  margin-top: 2px;
}
</style>
