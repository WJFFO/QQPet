<template>
  <div class="nt">
    <!-- 原版公告窗：蓝色玻璃面板 + 「公告」标题图（iconList/DeskNotice/title.png） -->
    <div class="head">
      <img v-if="titleImg" class="head-title" :src="titleImg" alt="公告" draggable="false" />
      <span v-else class="head-txt">公告</span>
      <span class="spacer"></span>
      <span class="x" @click="close">×</span>
    </div>

    <div class="body">
      <img v-if="icon" class="nt-icon" :src="icon" alt="" draggable="false" />
      <div class="msg">{{ text }}</div>
    </div>

    <div class="foot">
      <QGoldButton @click="close">知道啦</QGoldButton>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import QGoldButton from '../ui/QGoldButton.vue'
import { asset } from '../ui/useSkin'

// 桌面提醒（公告）窗口：宠物饿了/脏了/生病、在线奖励可领时由宠物窗口弹出
const text = ref(new URLSearchParams(location.search).get('text') || '宝贝想你了，快回来看看～')
const titleImg = ref('')
const icon = ref('')

function close() {
  window.api.closeSelf()
}

onMounted(async () => {
  titleImg.value = await asset('assets/iconList/DeskNotice/title.png')
  icon.value = await asset('assets/iconList/DeskNotice/icon.png')
})
</script>

<style scoped>
.nt {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  border: 1px solid #55709b;
  border-radius: 6px;
  background: linear-gradient(180deg, #e9faff 0%, #f4fcff 55%, #ffffff 100%);
  box-shadow: 0 6px 18px rgba(35, 64, 110, 0.35), inset 0 0 0 1px rgba(255, 255, 255, 0.9);
  overflow: hidden;
}
.head {
  flex: none;
  height: 20px;
  display: flex;
  align-items: center;
  padding: 0 5px 0 8px;
  background: linear-gradient(180deg, #7ebbe7 0%, #6698c7 100%);
  border-bottom: 1px solid #55709b;
  -webkit-app-region: drag;
}
.head-title {
  height: 12px;
  object-fit: contain;
}
.head-txt {
  color: #fff;
  font-size: 11px;
  letter-spacing: 2px;
  text-shadow: 0 1px 1px rgba(35, 64, 110, 0.5);
}
.spacer {
  flex: 1;
}
.x {
  width: 13px;
  height: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 2px;
  background: linear-gradient(180deg, #ff8a95, #e02b4a);
  color: #fff;
  font-size: 10px;
  line-height: 1;
  cursor: pointer;
  -webkit-app-region: no-drag;
}
.body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px 4px;
}
.nt-icon {
  flex: none;
  width: 32px;
  height: 32px;
  object-fit: contain;
}
.msg {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 1.7;
  color: #22405f;
}
.foot {
  flex: none;
  display: flex;
  justify-content: center;
  padding: 0 0 8px;
}
</style>
