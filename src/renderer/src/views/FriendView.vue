<template>
  <div class="friend">
    <div class="top">
      <span class="ttl">好友的宝贝</span>
      <span class="qq-weak">串门或送礼都能加亲密度，也会让宝贝开心</span>
      <button class="qq-btn" @click="refresh">刷新</button>
    </div>

    <div class="grid qq-panel qq-scroll">
      <div v-for="f in friends" :key="f.id" class="card">
        <div class="avatar" :style="{ backgroundImage: f.petSrc ? `url(${f.petSrc})` : 'none' }"></div>
        <div class="info">
          <div class="name">
            {{ f.pet }}
            <span class="sex" :class="f.gender === 'MM' ? 'f' : 'm'">{{ f.gender === 'MM' ? '♀' : '♂' }}</span>
            <span class="lv">Lv.{{ f.level }}</span>
          </div>
          <div class="owner">
            <img v-if="f.stateSrc" class="st-ico" :src="f.stateSrc" alt="" draggable="false" />
            <span class="st" :class="f.state"></span>{{ f.stateText }} · {{ f.owner }}
          </div>
          <!-- 亲密度：原版心形条（tip/heart）作底，粉色填充表示进度 -->
          <div class="intimacy">
            <div class="hpill">
              <img v-if="heart" class="hbg" :src="heart" alt="" draggable="false" />
              <div class="hfill" :style="{ width: Math.max(0, f.intimacy - 3) + '%' }"></div>
            </div>
            <span class="num">{{ f.intimacy }}</span>
          </div>
        </div>
        <div class="acts">
          <button class="qq-btn mini" :disabled="f.state === 'off'" @click="visit(f)">串门</button>
          <button class="qq-btn mini gift" :disabled="f.state === 'off'" @click="openGift(f)">送礼</button>
        </div>
      </div>
    </div>

    <!-- 送礼弹窗：面板底图用 tip/gift/2（319×142），按钮用 tip/vip 金色三态 -->
    <div v-if="giftFor" class="mask" @click.self="closeGift">
      <div class="gift-dlg" :style="giftBg ? { backgroundImage: `url(${giftBg})` } : {}">
        <button class="gx" :style="closeIco ? { backgroundImage: `url(${closeIco})` } : {}" @click="closeGift"></button>
        <div class="gd-title">送礼物给「{{ giftFor.pet }}」</div>

        <div v-if="bagItems.length" class="gd-list">
          <div
            v-for="g in bagItems"
            :key="g.file"
            class="gd-item"
            :class="{ on: picked === g.file }"
            :title="g.name"
            @click="picked = g.file"
          >
            <img v-if="g.src" :src="g.src" alt="" draggable="false" />
            <span class="gd-cnt">×{{ g.count }}</span>
          </div>
        </div>
        <div v-else class="gd-empty">背包里没有可送的物品，先去商店买点吧～</div>

        <div class="gd-foot">
          <span class="gd-hint">{{ tip || '送出 1 件物品，亲密度 +12，宝贝会开心很久' }}</span>
          <QGoldButton :disabled="!picked" @click="sendGift">送出</QGoldButton>
          <QGoldButton @click="closeGift">取消</QGoldButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import QGoldButton from '../ui/QGoldButton.vue'
import { asset } from '../ui/useSkin'

// 原版好友列表：friendList 下是「好友在线状态」图标（在线/忙碌/离开/离线…），
// 头像位用宠物形象（info 下 GG2/MM2 幼年图）。亲密度随串门/送礼增长，跨会话保留。
// 好友档案：性别决定用 GG（男）/MM（女）的形象，等级决定蛋/幼年/成年
const BASE = [
  { id: '1', pet: '小圆', owner: '琪琪', gender: 'MM', level: 6, state: 'on' },
  { id: '4', pet: '豆豆', owner: '阿宝', gender: 'GG', level: 12, state: 'on' },
  { id: '6', pet: '毛毛', owner: '小林', gender: 'GG', level: 8, state: 'away' },
  { id: '8', pet: '球球', owner: '大熊', gender: 'GG', level: 3, state: 'on' },
  { id: '9', pet: '皮皮', owner: '文文', gender: 'MM', level: 15, state: 'off' },
  { id: '11', pet: '糖糖', owner: '悠悠', gender: 'MM', level: 9, state: 'on' },
  { id: '14', pet: '嘟嘟', owner: '阿杰', gender: 'GG', level: 10, state: 'away' },
  { id: '17', pet: '咪咪', owner: '小鹿', gender: 'MM', level: 2, state: 'off' }
]
// 形象文件名：GG/MM + 1 蛋 / 2 幼年 / 3 成年
const lookOf = (f) => `${f.gender}${f.level >= 10 ? 3 : f.level >= 5 ? 2 : 1}`
const stateText = { on: '在线', away: '离开', off: '离线' }

const friends = ref([])
const tip = ref('')
const heart = ref('')
const giftBg = ref('')
const closeIco = ref('')

// 头像/状态图标单独缓存：build() 只重建数据，不能把图片丢掉
const icons = ref({})
const giftFor = ref(null) // 正在给谁送礼
const picked = ref('') // 选中的物品文件名
const bagItems = ref([])

function readMap(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || '{}')
  } catch {
    return {}
  }
}
function readIntimacy(id) {
  return Number(readMap('qqpet.friendIntimacy')[id]) || 0
}

function build() {
  friends.value = BASE.map((f) => ({
    ...f,
    stateText: stateText[f.state],
    intimacy: Math.min(100, readIntimacy(f.id)),
    // 图标是异步加载的，重建数据时必须带上，否则每 5 秒刷新一次头像就没了
    ...(icons.value[f.id] || {})
  }))
}

async function loadIcons() {
  const list = await Promise.all(
    BASE.map(async (f) => ({
      stateSrc: await asset(`assets/friendList/${f.id}.svg`),
      petSrc: await asset(`assets/info/${lookOf(f)}.svg`)
    }))
  )
  icons.value = Object.fromEntries(
    list.map((it, i) => [BASE[i].id, { stateSrc: it.stateSrc, petSrc: it.petSrc }])
  )
  build()
  heart.value = await asset('assets/tip/heart/2.svg')
  giftBg.value = await asset('assets/tip/gift/2.svg')
  closeIco.value = await asset('assets/tip/gift/11.svg')
}

// 串门：让宝贝玩耍一下（+心情），并增加与该好友的亲密度
function visit(f) {
  window.api.sendControlAction('play')
  const map = readMap('qqpet.friendIntimacy')
  map[f.id] = Math.min(100, (Number(map[f.id]) || 0) + 5)
  localStorage.setItem('qqpet.friendIntimacy', JSON.stringify(map))
  build()
}

// —— 送礼 ——
async function openGift(f) {
  giftFor.value = f
  tip.value = ''
  picked.value = ''
  const inv = readMap('qqpet.inventory')
  const entries = Object.entries(inv).filter(([, it]) => it && it.count > 0)
  bagItems.value = await Promise.all(
    entries.map(async ([file, it]) => {
      const folder = it.folder || (it.effect === 'eat' ? 'food' : 'medicine')
      let src = ''
      try {
        src = await window.api.readImage(`assets/img_res/${folder}/${file}`)
      } catch {
        src = ''
      }
      return { file, count: it.count, name: it.name, src }
    })
  )
  picked.value = bagItems.value[0]?.file || ''
}

function closeGift() {
  giftFor.value = null
  picked.value = ''
}

function sendGift() {
  if (!giftFor.value || !picked.value) return
  const inv = readMap('qqpet.inventory')
  const it = inv[picked.value]
  if (!it || it.count <= 0) return
  it.count -= 1
  if (it.count <= 0) delete inv[picked.value]
  localStorage.setItem('qqpet.inventory', JSON.stringify(inv))

  const map = readMap('qqpet.friendIntimacy')
  map[giftFor.value.id] = Math.min(100, (Number(map[giftFor.value.id]) || 0) + 12)
  localStorage.setItem('qqpet.friendIntimacy', JSON.stringify(map))
  build()

  window.api.sendControlAction('play')
  window.api.sendPetBubble?.(`把${it.name}送给${giftFor.value.pet}啦，亲密度 +12`)
  window.api.storageChanged?.()
  tip.value = `已送出 ${it.name}`
  // 送完把列表刷新一下（物品可能用完了）
  openGift(giftFor.value)
}

function refresh() {
  build()
}

let timer = null
onMounted(async () => {
  build()
  await loadIcons()
  timer = setInterval(build, 5000)
})
onUnmounted(() => {
  if (timer) clearInterval(timer)
})
</script>

<style scoped>
.friend {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
}
.top {
  flex: none;
  display: flex;
  align-items: center;
  gap: 10px;
  height: 28px;
  padding-bottom: 4px;
  border-bottom: 1px solid #d3e5f4;
}
.ttl {
  font-size: 13px;
  font-weight: bold;
  color: #1b3d67;
}
.top .qq-btn {
  margin-left: auto;
  height: 20px;
  padding: 0 10px;
  font-size: 11px;
}
.grid {
  flex: 1;
  min-height: 0;
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 80px;
  gap: 6px;
  padding: 6px;
  align-content: start;
}
.card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 8px;
  border: 1px solid #c9dced;
  border-radius: 4px;
  background: linear-gradient(180deg, #ffffff 0%, #f1f9ff 100%);
}
.avatar {
  flex: none;
  width: 46px;
  height: 46px;
  border-radius: 50%;
  background-color: #fff;
  background-size: contain;
  background-position: center;
  background-repeat: no-repeat;
  box-shadow: inset 0 0 0 1px #d7e7f4;
}
.info {
  flex: 1;
  min-width: 0;
}
.name {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: bold;
  color: #1b3d67;
}
.sex {
  flex: none;
  width: 12px;
  height: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 9px;
  line-height: 1;
  color: #fff;
}
.sex.m {
  background: linear-gradient(180deg, #8ec9f2, #4a86c6);
}
.sex.f {
  background: linear-gradient(180deg, #ffa9c0, #ea5c85);
}
.lv {
  flex: none;
  font-size: 10px;
  font-weight: normal;
  color: #c07000;
}
.owner {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #5b7ba3;
  margin: 1px 0 3px;
}
.st-ico {
  width: 14px;
  height: 14px;
  object-fit: contain;
}
.st {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #b6c8d8;
}
.st.on {
  background: #35b56a;
}
.st.away {
  background: #e8b13a;
}
.st.off {
  background: #b6c8d8;
}

/* 亲密度：心形条素材作底 + 粉色进度覆盖 */
.intimacy {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 14px;
}
.hpill {
  position: relative;
  flex: 1;
  min-width: 0;
  height: 14px;
}
.hbg {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
}
.hfill {
  position: absolute;
  left: 3px;
  top: 3px;
  height: 8px;
  border-radius: 4px;
  background: linear-gradient(180deg, rgba(255, 138, 168, 0.85), rgba(226, 58, 116, 0.8));
  transition: width 0.25s ease;
}
.num {
  flex: none;
  width: 20px;
  text-align: right;
  font-size: 10px;
  color: #c07000;
}
.acts {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.qq-btn.mini {
  height: 19px;
  padding: 0 8px;
  font-size: 11px;
}
.qq-btn.mini.gift {
  border-color: #e0b96a;
  background: linear-gradient(180deg, #fff8e4, #ffe9b8);
  color: #8b5a10;
}

/* 送礼弹窗 */
.mask {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(20, 45, 80, 0.28);
  z-index: 5;
}
.gift-dlg {
  position: relative;
  width: 330px;
  height: 158px;
  padding: 8px 10px;
  box-sizing: border-box;
  border: 1px solid #d8c69c;
  border-radius: 4px;
  background-color: #fdf8ea;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  box-shadow: 0 6px 18px rgba(20, 45, 80, 0.35);
  display: flex;
  flex-direction: column;
}
.gx {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 14px;
  height: 14px;
  padding: 0;
  border: none;
  background-color: transparent;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  cursor: pointer;
}
.gd-title {
  margin-left: 22px; /* 避开底图左上角的元宝图标 */
  font-size: 12px;
  font-weight: bold;
  color: #6b4a1e;
}
.gd-list {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 6px;
  margin-top: 6px;
  overflow-x: auto;
}
.gd-item {
  position: relative;
  flex: none;
  width: 52px;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid #d7c6a0;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}
.gd-item.on {
  border-color: #e59a1c;
  box-shadow: 0 0 0 2px rgba(255, 194, 71, 0.6);
}
.gd-item img {
  max-width: 40px;
  max-height: 40px;
  object-fit: contain;
}
.gd-cnt {
  position: absolute;
  right: 1px;
  bottom: 0;
  padding: 0 2px;
  border-radius: 3px;
  background: rgba(120, 80, 20, 0.55);
  color: #fff;
  font-size: 9px;
}
.gd-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  color: #9a7a44;
}
.gd-foot {
  flex: none;
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.gd-hint {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: #8b6a34;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
