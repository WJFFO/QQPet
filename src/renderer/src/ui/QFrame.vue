<template>
  <div class="qq-frame">
    <div class="qq-titlebar">
      <span class="qq-title">{{ title }}</span>
      <slot name="extra"></slot>
      <div class="qq-close" @click="$emit('close')">×</div>
    </div>
    <div class="qq-body">
      <slot></slot>
    </div>
  </div>
</template>

<script setup>
// 原版窗口外壳：浅蓝玻璃底板 + 26px 蓝渐变标题栏 + 红色圆角关闭按钮。
// 标题栏区域 -webkit-app-region: drag，可直接拖动整个窗口。
defineProps({ title: { type: String, default: 'QQ宠物' } })
defineEmits(['close'])
</script>

<style scoped>
.qq-body {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}
</style>
