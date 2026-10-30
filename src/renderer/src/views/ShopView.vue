<template>
  <div class="shop">
    <!-- 顶部：原版分类页签（Items_Tag / Items_Tag_Selected 切片）+ 右侧翻页 -->
    <div class="top">
      <div
        v-for="c in cats"
        :key="c.key"
        class="tag"
        :class="{ active: activeCat === c.key, sale: c.key === 'sale' }"
        :style="tagStyle(c)"
        @click="switchCat(c.key)"
      >
        {{ c.label }}
      </div>

      <span class="spacer"></span>

      <div class="pager">
        <button
          class="pg"
          :style="pgStyle(img.pageFirst)"
          :disabled="page <= 1"
          title="第一页"
          @click="goPage(1)"
        ></button>
        <button
          class="pg"
          :style="pgStyle(img.pageLeft)"
          :disabled="page <= 1"
          title="上一页"
          @click="goPage(page - 1)"
        ></button>
        <span class="pg-num">{{ page }} / {{ pageCount }}</span>
        <button
          class="pg"
          :style="pgStyle(img.pageRight)"
          :disabled="page >= pageCount"
          title="下一页"
          @click="goPage(page + 1)"
        ></button>
        <button
          class="pg"
          :style="pgStyle(img.pageLast)"
          :disabled="page >= pageCount"
          title="最后一页"
          @click="goPage(pageCount)"
        ></button>
      </div>
    </div>

    <!-- 商品网格：原版 Card_Items 卡片，3 列 × 4 行 -->
    <div class="grid qq-scroll">
      <div
        v-for="(it, i) in pageItems"
        :key="it.file + i"
        class="card"
        :class="{ active: selected && selected.file === it.file }"
        :style="{ backgroundImage: `url(${img.card})` }"
        @click="selected = it"
        @dblclick="buy(it)"
      >
        <div class="ico-box">
          <img v-if="it.src" class="ico" :src="it.src" alt="" draggable="false" />
          <img v-else-if="img.fail" class="ico fail" :src="img.fail" alt="" draggable="false" />
        </div>
        <div class="txt">
          <div class="nm" :title="it.name">{{ it.name }}</div>
          <div class="eff">{{ shortEffect(it) }}</div>
        </div>
        <div class="price">
          <span class="pv">{{ priceOf(it) }}</span>
        </div>
        <img v-if="badgeOf(it)" class="badge" :src="img['badge_' + badgeOf(it)]" alt="" draggable="false" />
      </div>

      <!-- 空位：原版 Card_Items_Null 切片，保持网格整齐 -->
      <div
        v-for="n in blankSlots"
        :key="'blank-' + n"
        class="card blank"
        :style="{ backgroundImage: `url(${img.cardNull})` }"
      ></div>
    </div>

    <!-- 底部购买栏：选中商品 + 数量 + 合计 + 购买 -->
    <div class="bottom">
      <div class="sel">
        <template v-if="selected">
          <span class="sel-nm">{{ selected.name }}</span>
          <span class="sel-eff">{{ effectText(selected.effect, selected.value) }}</span>
        </template>
        <span v-else class="qq-weak">点一下商品看详情</span>
      </div>

      <div class="qty">
        <span class="qq-weak">数量</span>
        <button
          v-for="q in QTY"
          :key="q"
          class="qbtn"
          :class="{ on: qty === q }"
          :style="qty === q ? qtyStyle(img.subSel) : {}"
          @click="qty = q"
        >{{ q }}</button>
      </div>

      <div class="total">
        <span class="qq-weak">合计</span>
        <b class="gold">{{ total }}</b>
        <span class="qq-weak">元宝</span>
      </div>

      <button class="qq-btn primary buy" :disabled="!selected || coins < total" @click="buy(selected)">
        {{ !selected ? '请选择' : coins < total ? '元宝不足' : '购买' }}
      </button>
    </div>

    <!-- 提示条：购买结果 / 元宝不足 -->
    <div v-if="tip" class="tip">{{ tip }}</div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onUnmounted } from 'vue'
import { asset } from '../ui/useSkin'

// 分类：食品 / 日用品 / 药品 + 特惠（原版商店的 Sale 页签，8 折）
const cats = [
  { key: 'all', label: '全部' },
  { key: 'eat', label: '食品' },
  { key: 'clean', label: '日用品' },
  { key: 'cure', label: '药品' },
  { key: 'sale', label: '特惠' }
]
const activeCat = ref('all')
const PAGE = 12 // 3 列 × 4 行
const QTY = [1, 2, 5]
const PROMO_OFF = 0.8 // 特惠商品 8 折

// 商品目录：名称/价格取自原版商店，图标用 assets/img_res 下的真实素材
const ITEMS = [
  { file: '102010001.gif', name: '圈圈冰激凌', price: 5, value: 130, effect: 'eat' },
  { file: '102010003.gif', name: '月光饼饼', price: 10, value: 194, effect: 'eat' },
  { file: '102010012.gif', name: '桃桃布丁', price: 10, value: 194, effect: 'eat' },
  { file: '10013004.gif', name: '可乐', price: 12, value: 216, effect: 'eat' },
  { file: '10013007.gif', name: '棒棒糖', price: 12, value: 216, effect: 'eat' },
  { file: '10013006.gif', name: '冰淇淋', price: 12, value: 216, effect: 'eat' },
  { file: '10013008.gif', name: '巧克力', price: 15, value: 259, effect: 'eat' },
  { file: '102010010.gif', name: '伟大可乐', price: 20, value: 324, effect: 'eat' },
  { file: '102010014.gif', name: '西湖龙井', price: 20, value: 324, effect: 'eat' },
  { file: '102010016.gif', name: '滴答果果', price: 20, value: 324, effect: 'eat' },
  { file: '102010004.gif', name: '果味米米花', price: 20, value: 324, effect: 'eat' },
  { file: '102010020.gif', name: '冰红茶', price: 20, value: 324, effect: 'eat' },
  { file: '10013009.gif', name: '牛肉干', price: 18, value: 281, effect: 'eat' },
  { file: '10013013.gif', name: '香瓜果冻', price: 20, value: 324, effect: 'eat' },
  { file: '102010021.gif', name: '康师傅红茶', price: 40, value: 454, effect: 'eat' },
  { file: '102010009.gif', name: '漂漂孔雀果', price: 40, value: 454, effect: 'eat' },
  { file: '102010026.gif', name: '五彩沙拉', price: 40, value: 454, effect: 'eat' },
  { file: '102010013.gif', name: '怪怪巧克力', price: 50, value: 540, effect: 'eat' },
  { file: '102010024.gif', name: '霹雳啪啦糖', price: 50, value: 540, effect: 'eat' },
  { file: '102010006.gif', name: '蹦豆豆卷', price: 60, value: 594, effect: 'eat' },
  { file: '102010005.gif', name: '炸虾盖饭', price: 100, value: 756, effect: 'eat' },
  { file: '102010023.gif', name: '金钢竹筒饭', price: 100, value: 756, effect: 'eat' },
  { file: '10001.gif', folder: 'medicine', name: '小梳子', price: 18, value: 173, effect: 'clean' },
  { file: '20001.gif', folder: 'medicine', name: '香皂', price: 15, value: 144, effect: 'clean' },
  { file: '30001.gif', folder: 'medicine', name: '沐浴露', price: 28, value: 274, effect: 'clean' },
  { file: '40001.gif', folder: 'medicine', name: '创可贴', price: 35, value: 40, effect: 'cure' },
  { file: '50001.gif', folder: 'medicine', name: '感冒药', price: 40, value: 50, effect: 'cure' },
  { file: '60001.gif', folder: 'medicine', name: '康复营养液', price: 60, value: 60, effect: 'cure' }
]

const effectText = (effect, value) =>
  effect === 'eat' ? `饱食度 +${value}` : effect === 'clean' ? `清洁度 +${value}` : `健康度 +${value}`
const shortEffect = (it) => effectText(it.effect, it.value).replace('度', '')

// —— 素材 ——
const img = reactive({
  card: '',
  cardNull: '',
  tag: '',
  tagSel: '',
  saleSel: '',
  subSel: '',
  pageFirst: '',
  pageLeft: '',
  pageRight: '',
  pageLast: '',
  fail: '',
  badge_hot: '',
  badge_new: '',
  badge_discount: '',
  badge_recommand: ''
})

async function loadSkin() {
  const S = 'assets/shop/store/Store_img'
  const map = {
    card: `${S}/Card_Items.png`,
    cardNull: `${S}/Card_Items_Null.png`,
    tag: `${S}/Items_Tag.png`,
    tagSel: `${S}/Items_Tag_Selected.png`,
    saleSel: `${S}/Sale_Tag_Selected.png`,
    subSel: `${S}/Items_SubTag_Selected.png`,
    pageFirst: `${S}/page_first.png`,
    pageLeft: `${S}/page_left.png`,
    pageRight: `${S}/page_right.png`,
    pageLast: `${S}/page_last.png`,
    fail: `${S}/fail.png`,
    badge_hot: `${S}/hot.gif`,
    badge_new: `${S}/new.gif`,
    badge_discount: `${S}/discount.gif`,
    badge_recommand: `${S}/recommand.gif`
  }
  await Promise.all(
    Object.keys(map).map(async (k) => {
      img[k] = await asset(map[k])
    })
  )
}

const tagStyle = (c) => {
  const on = activeCat.value === c.key
  if (c.key === 'sale') {
    return on && img.saleSel
      ? { backgroundImage: `url(${img.saleSel})`, width: '85px', height: '34px' }
      : img.tag
        ? { backgroundImage: `url(${img.tag})`, width: '85px' }
        : {}
  }
  if (on) return img.tagSel ? { backgroundImage: `url(${img.tagSel})`, width: '81px' } : {}
  return img.tag ? { backgroundImage: `url(${img.tag})` } : {}
}
const pgStyle = (src) => (src ? { backgroundImage: `url(${src})` } : {})
const qtyStyle = (src) => (src ? { backgroundImage: `url(${src})` } : {})

// —— 商品数据 ——
const items = ref([])
const selected = ref(null)
const coins = ref(Number(localStorage.getItem('qqpet.coins')) || 0)
const tip = ref('')
let tipTimer = null

// 促销/角标：按索引确定性分配，保证每次打开一致
function enlarge(list) {
  return list.map((it, i) => {
    // 打折的商品才挂「折扣」角标，避免价格没变却写着折扣
    const promo = i % 4 === 3
    return {
      ...it,
      promo,
      badge: promo ? 'discount' : i % 9 === 0 ? 'new' : i % 11 === 0 ? 'recommand' : it.price >= 60 ? 'hot' : '',
      category: it.effect === 'eat' ? '食品' : it.effect === 'clean' ? '日用品' : '药品'
    }
  })
}

const filtered = computed(() => {
  if (activeCat.value === 'sale') return items.value.filter((it) => it.promo)
  if (activeCat.value === 'all') return items.value
  return items.value.filter((it) => it.effect === activeCat.value)
})
const pageCount = computed(() => Math.max(1, Math.ceil(filtered.value.length / PAGE)))
const page = ref(1)
const pageItems = computed(() => filtered.value.slice((page.value - 1) * PAGE, page.value * PAGE))
const blankSlots = computed(() => Math.max(0, PAGE - pageItems.value.length))
const badgeOf = (it) => it.badge

const priceOf = (it) => (it ? (it.promo ? Math.round(it.price * PROMO_OFF) : it.price) : 0)
const qty = ref(1)
const total = computed(() => (selected.value ? priceOf(selected.value) * qty.value : 0))

function showTip(text) {
  tip.value = text
  if (tipTimer) clearTimeout(tipTimer)
  tipTimer = setTimeout(() => {
    tip.value = ''
  }, 2400)
}

function switchCat(key) {
  activeCat.value = key
  page.value = 1
  selected.value = filtered.value[0] || null
}

function goPage(n) {
  page.value = Math.min(Math.max(1, n), pageCount.value)
}

watch(pageCount, (n) => {
  if (page.value > n) page.value = n
})

function refreshCoins() {
  coins.value = Number(localStorage.getItem('qqpet.coins')) || 0
}

async function load() {
  const loaded = await Promise.all(
    ITEMS.map(async (it) => {
      try {
        return await window.api.readImage(`assets/img_res/${it.folder || 'food'}/${it.file}`)
      } catch {
        return ''
      }
    })
  )
  items.value = enlarge(ITEMS.map((it, i) => ({ ...it, src: loaded[i] })))
  selected.value = items.value[0] || null
}

// 购买：先用原版提示框确认（tip/alert），确定后再扣元宝入背包
let pending = null
let reqSeq = 0

function buy(item) {
  if (!item) return
  selected.value = item
  const cost = priceOf(item) * qty.value
  if (coins.value < cost) {
    showTip('元宝不够啦，先去打工赚点吧！')
    window.api.openAlert?.({
      mode: 'alert',
      id: `shop-${++reqSeq}`,
      text: `购买「${item.name}」×${qty.value} 需要 ${cost} 元宝，你现在只有 ${coins.value} 元宝，先去打工赚点吧！`
    })
    return
  }
  pending = { item, qty: qty.value, cost }
  window.api.openAlert?.({
    mode: 'confirm',
    id: `shop-${++reqSeq}`,
    text: `确定花 ${cost} 元宝购买「${item.name}」×${qty.value} 吗？\n（${effectText(item.effect, item.value)}）`
  })
}

function onAlertResult(res) {
  if (!res || !res.ok || !pending) return
  const { item, qty: n, cost } = pending
  pending = null
  if (coins.value < cost) return
  coins.value -= cost
  localStorage.setItem('qqpet.coins', String(coins.value))
  // 购买 → 入背包（不立即使用；喂食/洗澡/治疗在宠物右键菜单消耗背包物品）
  const inv = JSON.parse(localStorage.getItem('qqpet.inventory') || '{}')
  if (inv[item.file]) inv[item.file].count += n
  else inv[item.file] = { count: n, effect: item.effect, value: item.value, name: item.name }
  localStorage.setItem('qqpet.inventory', JSON.stringify(inv))
  window.api.storageChanged?.()
  window.api.sendPetBubble(`买到${n}个${item.name}，已放进背包～`)
  showTip(`已购买 ${item.name} ×${n}，放进了背包`)
}

let offStorage = null
let offAlert = null
onMounted(async () => {
  await Promise.all([loadSkin(), load()])
  refreshCoins()
  offStorage = window.api.onStorageChanged?.(refreshCoins)
  offAlert = window.api.onAlertResult?.(onAlertResult)
})
onUnmounted(() => {
  if (offStorage) offStorage()
  if (offAlert) offAlert()
  if (tipTimer) clearTimeout(tipTimer)
})
</script>

<style scoped>
.shop {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

/* 顶栏 */
.top {
  flex: none;
  display: flex;
  align-items: flex-end;
  gap: 3px;
  height: 36px;
  border-bottom: 1px solid #d9c79b;
}
.spacer {
  flex: 1;
}
.tag {
  height: 27px;
  width: 73px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  font-size: 12px;
  color: #7a4a12;
  cursor: pointer;
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.55);
  box-sizing: border-box;
  padding-bottom: 2px;
}
.tag.active {
  color: #5d3305;
  font-weight: bold;
}
.tag.sale {
  width: 85px;
  height: 34px;
  color: #8b3419;
}

/* 翻页按钮：page_first/left/right/last 原版切片 */
.pager {
  display: flex;
  align-items: center;
  gap: 2px;
  padding-bottom: 3px;
}
.pg {
  width: 24px;
  height: 20px;
  padding: 0;
  border: none;
  background-color: transparent;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  cursor: pointer;
}
.pg:disabled {
  filter: grayscale(1) opacity(0.45);
  cursor: default;
}
.pg-num {
  min-width: 34px;
  text-align: center;
  font-size: 11px;
  color: #6b4a1e;
}

/* 商品网格 */
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(3, 159px);
  grid-auto-rows: 78px;
  gap: 7px 9px;
  justify-content: center;
  align-content: start;
  padding: 7px 4px;
  box-sizing: border-box;
  overflow-y: auto;
}
.card {
  position: relative;
  width: 159px;
  height: 78px;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  box-sizing: border-box;
  cursor: pointer;
}
.card.active {
  filter: drop-shadow(0 0 3px rgba(255, 176, 30, 0.95));
}
.card.blank {
  cursor: default;
  opacity: 0.85;
}
.ico-box {
  position: absolute;
  left: 8px;
  top: 8px;
  width: 54px;
  height: 58px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.ico {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}
.ico.fail {
  max-width: 40px;
  max-height: 40px;
}
.txt {
  position: absolute;
  left: 75px;
  right: 6px;
  top: 8px;
  height: 34px;
}
.nm {
  font-size: 12px;
  color: #5a3a12;
  line-height: 15px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.eff {
  margin-top: 5px;
  font-size: 10px;
  color: #94703c;
  white-space: nowrap;
  overflow: hidden;
}
.price {
  position: absolute;
  right: 6px;
  bottom: 4px;
  width: 46px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.pv {
  font-size: 11px;
  font-weight: bold;
  color: #a8480a;
}
.badge {
  position: absolute;
  left: 1px;
  top: 1px;
  width: 26px;
  height: 17px;
  object-fit: contain;
  pointer-events: none;
}

/* 底部购买栏 */
.bottom {
  flex: none;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 42px;
  padding: 0 6px;
  border-top: 1px solid #d9c79b;
  background: linear-gradient(180deg, #fdf6e2 0%, #f6ecd2 100%);
}
.sel {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
}
.sel-nm {
  font-size: 12px;
  font-weight: bold;
  color: #5a3a12;
  white-space: nowrap;
}
.sel-eff {
  font-size: 11px;
  color: #94703c;
  white-space: nowrap;
}
.qty {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
}
.qbtn {
  width: 40px;
  height: 22px;
  padding: 0;
  border: 1px solid #cfb689;
  border-radius: 3px;
  background-color: #fdf8ea;
  background-repeat: no-repeat;
  background-size: 100% 100%;
  color: #7a4a12;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.qbtn.on {
  border-color: transparent;
  color: #5d3305;
  font-weight: bold;
}
.total {
  display: flex;
  align-items: baseline;
  gap: 3px;
  font-size: 11px;
}
.total b {
  font-size: 14px;
}
.buy {
  min-width: 84px;
  height: 24px;
}

/* 提示 */
.tip {
  position: absolute;
  left: 50%;
  bottom: 50px;
  transform: translateX(-50%);
  padding: 4px 12px;
  border: 1px solid #d9b46a;
  border-radius: 9px;
  background: linear-gradient(180deg, #fffbe8, #ffeec2);
  color: #8e580a;
  font-size: 11px;
  white-space: nowrap;
  box-shadow: 0 2px 6px rgba(120, 80, 20, 0.25);
}
</style>
