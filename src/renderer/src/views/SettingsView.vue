<template>
  <div class="st" :style="{ backgroundImage: `url(${bg})` }">
    <!-- 原版背景自带「⚙ 系统设置」标题，这里只铺一条透明拖动带 -->
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
      @click="cancel"
    />

    <!-- 左栏页签（yeqian00 未选 / yeqian01 选中） -->
    <div class="side">
      <div
        v-for="t in tabs"
        :key="t.key"
        class="side-tab"
        :class="{ on: tab === t.key }"
        :style="{ backgroundImage: `url(${tab === t.key ? tabOn : tabOff})` }"
        @click="tab = t.key"
      >
        {{ t.label }}
      </div>
    </div>

    <!-- 右侧内容 -->
    <div class="body">
      <template v-if="tab === 'basic'">
        <div class="row">
          <QCheck v-model="alwaysOnTop" label="宠物窗口总在最前" />
        </div>
        <div class="row">
          <QCheck v-model="mouseThrough" label="鼠标穿透（点击直达下层程序）" />
        </div>
        <div class="row">
          <QCheck v-model="bubbleOff" label="关闭宠物说话气泡" />
        </div>
        <div class="row">
          <QCheck v-model="noticeOn" label="桌面提醒（饿了/生病/奖励可领时弹公告）" />
        </div>
        <div class="hint">提示：鼠标穿透只能从这里或托盘菜单关闭。</div>

        <!-- 数据目录：默认在 exe 同级的 qqpetdata，可改到任意位置（改动时旧数据自动补过去） -->
        <div class="dpath">
          <div class="dp-row">
            <span class="dp-h">数据目录</span>
            <span class="dp-p" :title="dataDir">{{ dataDir || '读取中…' }}</span>
          </div>
          <div class="dp-b">
            <button class="mini-b" @click="openDataDir">打开</button>
            <button class="mini-b" @click="changeDataDir">更改</button>
            <button class="mini-b" :disabled="!isCustomDir" @click="resetDataDir">默认</button>
          </div>
          <div v-if="dirMsg" class="dp-msg" :class="{ bad: dirBad }">{{ dirMsg }}</div>
        </div>
      </template>

      <template v-else-if="tab === 'sound'">
        <div class="row">
          <span class="k">音量</span>
          <QSlider v-model="volume" :width="150" :disabled="muted" />
          <span class="v">{{ muted ? '静音' : volume }}</span>
        </div>
        <div class="row">
          <QCheck v-model="muted" label="静音（关闭宠物动画音效）" />
        </div>
        <div class="hint">音量会实时作用于宠物动画与小游戏的声音。</div>
      </template>

      <template v-else-if="tab === 'ai'">
        <div class="fld">
          <span class="lab">接口地址</span>
          <input
            v-model="ai.baseUrl"
            class="tin"
            spellcheck="false"
            placeholder="https://api.deepseek.com/v1"
          />
        </div>
        <div class="fld">
          <span class="lab">API Key</span>
          <input v-model="ai.apiKey" class="tin" type="password" spellcheck="false" placeholder="sk-..." />
        </div>
        <div class="fld">
          <span class="lab">模型</span>
          <input v-model="ai.model" class="tin" spellcheck="false" placeholder="deepseek-chat" />
        </div>
        <div class="fld">
          <span class="lab">人设</span>
          <select v-model="personaKey" class="tin sel" @change="onPersonaChange">
            <option v-for="p in PERSONA_PRESETS" :key="p.key" :value="p.key">{{ p.label }}</option>
            <option value="custom">自定义</option>
          </select>
          <button class="mini-b" @click="openPersona">编辑</button>
        </div>
        <!-- 把真正会发给模型的人设摊开显示：存的是空串时会回落默认，这里能一眼看出 -->
        <div class="hint pe-now">当前生效：{{ activePersonaBrief }}</div>
        <div class="fld">
          <QCheck v-model="ai.autoTalk" label="主动搭话" />
          <input
            v-model.number="ai.autoTalkMin"
            class="tin num"
            type="number"
            min="1"
            max="180"
            step="1"
            title="1~180 分钟；饿了/脏了/生病时会提前到最多 3 分钟一次"
            :disabled="!ai.autoTalk"
          />
          <span class="unit">分钟</span>
        </div>
        <div class="ai-foot">
          <button class="mini-b" :disabled="aiTesting" @click="testAi">
            {{ aiTesting ? '测试中…' : '测试连接' }}
          </button>
          <button class="mini-b" :disabled="aiSaving" @click="saveAiNow">
            {{ aiSaving ? '保存中…' : '保存配置' }}
          </button>
          <span class="ai-msg" :class="{ bad: aiTestBad }">{{ aiTestMsg }}</span>
        </div>
        <div class="hint">兼容 OpenAI 协议，Key 存本机。</div>

        <!-- 记忆：默认收起成一行，避免把 196px 的内容区撑长；点标题展开管理 -->
        <div class="mem">
          <div class="mem-h" @click="memOpen = !memOpen">
            <span>记忆</span>
            <span class="mem-sub">{{ memStats.messages || 0 }} 条 · {{ facts.length }} 件事</span>
            <span class="mem-ar">{{ memOpen ? '−' : '+' }}</span>
          </div>
          <template v-if="memOpen">
            <div v-if="facts.length" class="mem-list qq-scroll">
              <div v-for="f in facts" :key="f.t" class="mem-i">
                <span class="mem-t" :title="f.t">{{ f.t }}</span>
                <span class="mem-x" title="忘掉这条" @click="forget(f.t)">×</span>
              </div>
            </div>
            <div v-else class="mem-empty">还没记住什么，聊够 20 句会自动整理</div>
            <div class="mem-b">
              <button class="mini-b" @click="openDir">文件夹</button>
              <button class="mini-b" @click="exportChat">导出</button>
              <button class="mini-b" :disabled="flushing" @click="flushMemory">
                {{ flushing ? '整理中…' : '整理' }}
              </button>
              <button class="mini-b danger" @click="onClearMem">
                {{ clearArm ? '确认清空?' : '全忘' }}
              </button>
            </div>
          </template>
        </div>
      </template>

      <template v-else>
        <div class="about">
          <img v-if="icon" class="app-icon" :src="icon" alt="" draggable="false" />
          <div class="about-txt">
            <div class="about-name">QQ宠物 · 复刻版</div>
            <div class="about-line">版本 1.1.0</div>
            <div class="about-line">素材来源：原版 QQ 宠物</div>
            <div class="about-line">动画引擎：Ruffle（Flash 模拟）</div>
          </div>
        </div>
      </template>
    </div>

    <!-- 人设编辑浮层：预设选「自定义」或点「编辑」时打开 -->
    <div v-if="personaOpen" class="pe-mask" @click.self="closePersona">
      <div class="pe">
        <div class="pe-h">
          <span>宠物人设</span>
          <span class="pe-x" @click="closePersona">×</span>
        </div>
        <textarea
          v-model="personaDraft"
          class="pe-ta"
          maxlength="300"
          spellcheck="false"
          placeholder="用一两句话描述宝贝的性格与说话习惯，会作为系统提示词发给模型"
        ></textarea>
        <div class="pe-foot">
          <span class="pe-note">{{ personaDraft.trim().length }}/300</span>
          <button class="mini-b" @click="personaDraft = PERSONA_DEFAULT">恢复默认</button>
          <button class="mini-b" @click="closePersona">取消</button>
          <button class="mini-b on" @click="savePersona">保存</button>
        </div>
      </div>
    </div>

    <!-- 全局操作提示：应用/确定 在任意页签点了都有反馈 -->
    <div v-if="toast" class="toast" :class="{ bad: toastBad }">{{ toast }}</div>

    <!-- 底部按钮：确定 / 取消 / 应用（原版 84×40 三态图） -->
    <div class="foot">
      <img
        v-for="b in buttons"
        :key="b.key"
        class="fbtn"
        :src="b.imgs[b.state]"
        :alt="b.label"
        draggable="false"
        @mouseenter="b.state = 1"
        @mouseleave="b.state = 0"
        @mousedown="b.state = 2"
        @mouseup="b.state = 1"
        @click="b.action"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted } from 'vue'
import QCheck from '../ui/QCheck.vue'
import QSlider from '../ui/QSlider.vue'
import { asset } from '../ui/useSkin'
import {
  readAiConfig,
  saveAiConfig,
  matchPersona,
  personaText,
  PERSONA_PRESETS,
  PERSONA_DEFAULT
} from '../composables/aiConfig'

const tabs = [
  { key: 'basic', label: '基本设置' },
  { key: 'sound', label: '音效' },
  { key: 'ai', label: 'AI 助手' },
  { key: 'about', label: '关于' }
]
const tab = ref('basic')

const bg = ref('')
const icon = ref('')
const tabOn = ref('')
const tabOff = ref('')
const closeImgs = ref(['', '', ''])
const closeState = ref(0)

const alwaysOnTop = ref(false)
const mouseThrough = ref(false)
const bubbleOff = ref(localStorage.getItem('qqpet.bubbleOff') === '1')
const noticeOn = ref(localStorage.getItem('qqpet.noticeOff') !== '1')
const volume = ref(Number(localStorage.getItem('qqpet.volume') ?? 100))
const muted = ref(localStorage.getItem('qqpet.muted') === '1')

// —— AI 配置（存 localStorage.qqpet.ai，随请求传给主进程）——
// 不区分服务商：接口地址 + API Key + 模型名称，任何 OpenAI 兼容接口都能接。
const ai = ref(readAiConfig())
const aiTesting = ref(false)
const aiTestMsg = ref('')
const aiTestBad = ref(false)
const aiSaving = ref(false)

// 把当前 AI 配置写进 localStorage 并读回比对，返回错误文案（空串 = 成功）。
// 所有保存路径（人设切换 / 人设浮层 / 保存按钮 / 底部应用）统一走这里，保证有据可查。
function persistAi() {
  try {
    const before = readAiConfig().persona
    saveAiConfig(ai.value)
    // 人设换了就记下时间点：之后拼上下文时，这个时间之前的对话不再喂给模型，
    // 否则里面全是旧语气的示范，模型会照着「本座」继续演。
    if (before !== String(ai.value.persona || '')) {
      localStorage.setItem('qqpet.ai.personaRevAt', String(Date.now()))
    }
    const back = readAiConfig()
    const same =
      back.model === String(ai.value.model).trim() &&
      back.apiKey === String(ai.value.apiKey || '') &&
      back.persona === String(ai.value.persona || '')
    if (!same) return '保存异常：写入后读回不一致'
    window.api.storageChanged?.() // 广播给宠物窗：下次说话就用新人设/新模型
    return ''
  } catch (e) {
    return '保存失败：' + (e?.message || e)
  }
}

// 保存前的业务校验（人设切换不校验这些——可能先选人设再填 Key）
function validateAi() {
  const base = ai.value.baseUrl.trim()
  if (!base) return '接口地址不能为空'
  if (!/^https?:\/\//i.test(base)) return '接口地址要以 http(s):// 开头'
  if (!ai.value.apiKey.trim()) return 'API Key 不能为空'
  if (!ai.value.model.trim()) return '模型名称不能为空'
  return ''
}

/** 「保存配置」按钮：先校验再落盘，结果写进反馈条 */
function saveAiNow() {
  const bad = validateAi()
  if (bad) {
    aiTestBad.value = true
    aiTestMsg.value = bad
    return
  }
  aiSaving.value = true
  aiTestBad.value = false
  aiTestMsg.value = '保存中…'
  setTimeout(() => {
    const err = persistAi()
    aiSaving.value = false
    aiTestBad.value = !!err
    aiTestMsg.value = err || `配置已保存（${ai.value.model.trim()}）`
  }, 0)
}

// 人设：下拉选预设，选「自定义」或点「编辑」开浮层
const personaKey = ref(matchPersona(ai.value.persona).key)
const personaOpen = ref(false)
const personaDraft = ref('')

// 真正会发给模型的人设（空串会回落到默认人设），摊在设置页上让用户一眼看到实际生效的那份
const activePersonaBrief = computed(() => {
  const t = personaText(ai.value.persona).trim()
  return t.length > 46 ? `${t.slice(0, 46)}…` : t
})

function onPersonaChange(e) {
  const key = e.target.value
  if (key === 'custom') {
    personaDraft.value = ai.value.persona || PERSONA_DEFAULT
    personaOpen.value = true
    return
  }
  const preset = PERSONA_PRESETS.find((p) => p.key === key)
  if (!preset) return
  ai.value.persona = preset.text
  // 切换即保存并广播：宠物下句话就是新人设；成功失败都提示
  const err = persistAi()
  aiTestBad.value = !!err
  aiTestMsg.value = err || `人设已切换：${preset.label}`
}

function openPersona() {
  personaDraft.value = ai.value.persona || PERSONA_DEFAULT
  personaOpen.value = true
}

// 取消编辑时把下拉框拨回当前实际人设（否则会停在「自定义」上）
function closePersona() {
  personaOpen.value = false
  personaKey.value = matchPersona(ai.value.persona).key
}

function savePersona() {
  const text = personaDraft.value.trim()
  // 清空保存 = 想用默认人设。落盘默认值而不是空串，避免存储里留着空导致「看着没生效」
  ai.value.persona = text || PERSONA_DEFAULT
  personaKey.value = matchPersona(ai.value.persona).key
  personaOpen.value = false
  const err = persistAi()
  aiTestBad.value = !!err
  aiTestMsg.value = err || (text ? '人设已保存' : '内容为空，已恢复默认人设')
}

async function testAi() {
  if (!ai.value.apiKey.trim()) {
    aiTestMsg.value = '先填 API Key'
    aiTestBad.value = true
    return
  }
  aiTesting.value = true
  aiTestMsg.value = '请求中…'
  const res = await window.api.aiTest({
    apiKey: ai.value.apiKey,
    baseUrl: ai.value.baseUrl,
    model: ai.value.model
  })
  aiTesting.value = false
  aiTestBad.value = !res?.ok
  aiTestMsg.value = res?.ok ? `连接成功：${res.content || 'OK'}` : res?.error || '失败'
}

// —— 数据目录：默认 exe 同级 qqpetdata，可改到任意位置；改动时旧数据会自动补过去 ——
const dataDir = ref('')
const isCustomDir = ref(false)
const dirMsg = ref('')
const dirBad = ref(false)

async function loadDataDir() {
  const i = await window.api.dataDirInfo?.()
  if (!i) return
  dataDir.value = i.dir || ''
  isCustomDir.value = !!i.isCustom
  // 启动时若因权限问题回退过，把原因显示出来；已有操作提示时不覆盖
  if (i.note && !dirMsg.value) {
    dirBad.value = true
    dirMsg.value = i.note
  }
}

function openDataDir() {
  window.api.dataDirOpen?.()
}

async function changeDataDir() {
  const picked = await window.api.dataDirPick?.()
  if (!picked?.ok) return
  const r = await window.api.dataDirSet?.(picked.dir)
  if (!r?.ok) {
    dirBad.value = true
    dirMsg.value = r?.error || '切换失败'
    return
  }
  dirBad.value = false
  dirMsg.value = r.moved ? `已切换，迁移 ${r.moved} 个文件` : '已切换'
  await loadDataDir()
  await loadMemory()
}

async function resetDataDir() {
  const r = await window.api.dataDirReset?.()
  if (!r?.ok) {
    dirBad.value = true
    dirMsg.value = r?.error || '恢复失败'
    return
  }
  dirBad.value = false
  dirMsg.value = r.moved ? `已回到默认，迁移 ${r.moved} 个文件` : '已回到默认目录'
  await loadDataDir()
  await loadMemory()
}

// —— 记忆面板：记录条数 + 长期事实，可单条遗忘 / 手动整理 / 全部清空 ——
const memStats = ref({ messages: 0, facts: 0 })
const facts = ref([])
const memOpen = ref(false)
const flushing = ref(false)
const clearArm = ref(false)
let clearTimer = null

async function loadMemory() {
  const s = await window.api.memStats?.()
  if (s) memStats.value = s
  const p = await window.api.memProfile?.()
  facts.value = p?.facts || []
}

async function forget(text) {
  await window.api.memForget?.(text)
  await loadMemory()
}

// 两段式确认：先变红问一次，3 秒内再点才真清，避免窄窗口误点把记忆丢光
function onClearMem() {
  if (!clearArm.value) {
    clearArm.value = true
    clearTimeout(clearTimer)
    clearTimer = setTimeout(() => (clearArm.value = false), 3000)
    return
  }
  clearArm.value = false
  clearTimeout(clearTimer)
  forgetAll()
}

async function forgetAll() {
  await window.api.memClear?.('all')
  await loadMemory()
  aiTestBad.value = false
  aiTestMsg.value = '记忆和聊天记录已清空'
}

async function flushMemory() {
  if (!ai.value.apiKey.trim()) {
    aiTestBad.value = true
    aiTestMsg.value = '先填 API Key'
    return
  }
  flushing.value = true
  aiTestMsg.value = '整理中…'
  const r = await window.api.memCompact?.({
    apiKey: ai.value.apiKey,
    baseUrl: ai.value.baseUrl,
    model: ai.value.model
  })
  flushing.value = false
  await loadMemory()
  if (r?.ok && !r.skipped) {
    aiTestBad.value = false
    aiTestMsg.value = `整理完成，新增 ${(r.facts || []).length} 条记忆`
  } else if (r?.skipped === 'not-enough') {
    aiTestBad.value = false
    aiTestMsg.value = `还不满 20 句（现在 ${r.pending || 0} 句）`
  } else {
    aiTestBad.value = true
    aiTestMsg.value = r?.error || '整理失败'
  }
}

async function exportChat() {
  const r = await window.api.memExport?.({
    name: localStorage.getItem('qqpet.name') || '宝贝',
    owner: localStorage.getItem('qqpet.owner') || localStorage.getItem('qqpet.savedQq') || '主人'
  })
  if (r?.ok) {
    aiTestBad.value = false
    aiTestMsg.value = '已导出'
  } else if (r && !r.canceled) {
    aiTestBad.value = true
    aiTestMsg.value = r.error || '导出失败'
  }
}

function openDir() {
  window.api.memOpenDir?.()
}

const buttons = reactive([])

function makeBtn(key, label, action) {
  return { key, label, imgs: ['', '', ''], state: ref(0), action }
}

async function loadImages() {
  bg.value = await asset('assets/sysSeting/ditu.png')
  icon.value = await asset('assets/sysSeting/icon.png')
  tabOn.value = await asset('assets/sysSeting/yeqian01.png')
  tabOff.value = await asset('assets/sysSeting/yeqian00.png')
  closeImgs.value = await Promise.all(
    [0, 1, 2].map((i) => asset(`assets/sysSeting/guanbi0${i}.png`))
  )
}

async function loadButtons() {
  const defs = [
    { key: 'ok', label: '确定', name: 'queding', action: () => save(true) },
    { key: 'cancel', label: '取消', name: 'quxiao', action: cancel },
    { key: 'apply', label: '应用', name: 'yingyong', action: () => save(false) }
  ]
  for (const d of defs) {
    const b = makeBtn(d.key, d.label, d.action)
    b.imgs = await Promise.all([0, 1, 2].map((i) => asset(`assets/sysSeting/${d.name}0${i}.png`)))
    buttons.push(b)
  }
}

// 全局轻提示：底部「应用/确定」在两个页签都能点，成功失败都浮一条，2.5 秒消失
const toast = ref('')
const toastBad = ref(false)
let toastTimer = null
function showToast(msg, bad = false) {
  toast.value = msg
  toastBad.value = bad
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), 2500)
}

// 保存设置：气泡/音量走 localStorage（渲染层各处自行读取），置顶/穿透走主进程窗口属性
function save(closeAfter) {
  localStorage.setItem('qqpet.bubbleOff', bubbleOff.value ? '1' : '0')
  localStorage.setItem('qqpet.noticeOff', noticeOn.value ? '0' : '1')
  localStorage.setItem('qqpet.volume', String(volume.value))
  localStorage.setItem('qqpet.muted', muted.value ? '1' : '0')
  const aiErr = persistAi()
  window.api.setWindowPrefs?.({ alwaysOnTop: alwaysOnTop.value, mouseThrough: mouseThrough.value })
  if (aiErr) {
    // AI 配置写失败：不关窗，浮出原因让用户知情（关掉就等于静默丢配置）
    showToast(aiErr, true)
    return
  }
  if (closeAfter) window.api.closeSelf()
  else showToast('设置已保存')
}

function cancel() {
  window.api.closeSelf()
}

onMounted(async () => {
  await Promise.all([loadImages(), loadButtons()])
  const p = await window.api.getWindowPrefs()
  alwaysOnTop.value = !!p.alwaysOnTop
  mouseThrough.value = !!p.mouseThrough
  loadDataDir()
  loadMemory()
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
.st {
  position: relative;
  width: 350px;
  height: 311px;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  box-sizing: border-box;
}
.drag {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 26px;
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

/* 左栏页签：原版 yeqian 图 85×30 */
.side {
  position: absolute;
  left: 14px;
  top: 44px;
  width: 86px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.side-tab {
  width: 85px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-size: 100% 100%;
  background-repeat: no-repeat;
  font-size: 12px;
  color: #7a5a2a;
  cursor: pointer;
  letter-spacing: 1px;
}
.side-tab.on {
  color: #5a3a10;
  font-weight: bold;
}

/* 右侧内容区（背景图留出的白区） */
.body {
  position: absolute;
  left: 108px;
  top: 50px;
  width: 228px;
  height: 196px;
  padding: 4px 6px;
  box-sizing: border-box;
  overflow-y: auto;
}
.row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  color: #6b4a1e;
}
.k {
  flex: none;
  width: 30px;
  color: #7a5a2a;
}
.v {
  width: 34px;
  text-align: right;
  color: #8e580a;
}
/* AI 页签 */
.fld {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.lab {
  flex: none;
  width: 46px;
  font-size: 11px;
  color: #8a6c42;
}
.fld .seg {
  flex: 1;
}
.tin {
  flex: 1;
  min-width: 0;
  width: auto;
  height: 21px;
  padding: 0 5px;
  box-sizing: border-box;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: #fffdf6;
  color: #5a3a10;
  font-family: inherit;
  font-size: 11px;
  outline: none;
}
.tin.num {
  flex: none;
  width: 46px;
  text-align: center;
}
.tin.sel {
  flex: 1;
  min-width: 0;
  padding: 0 2px;
  cursor: pointer;
}
.mini-b.on {
  border-color: #b8862f;
  background: linear-gradient(180deg, #ffe9a8, #e8c46a);
  color: #5a3a10;
  font-weight: bold;
}
/* 人设编辑浮层 */
.pe-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(40, 26, 8, 0.28);
  z-index: 30;
}
.pe {
  width: 296px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #b8862f;
  border-radius: 4px;
  background: linear-gradient(180deg, #fffdf6, #fbf1d9);
  box-shadow: 0 4px 14px rgba(60, 40, 10, 0.35);
}
.pe-h {
  display: flex;
  align-items: center;
  height: 18px;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: bold;
  color: #6b4a1e;
}
.pe-x {
  margin-left: auto;
  padding: 0 3px;
  font-size: 13px;
  font-weight: normal;
  color: #a5844f;
  cursor: pointer;
}
.pe-x:hover {
  color: #7a5417;
}
.pe-ta {
  width: 100%;
  height: 92px;
  padding: 4px 5px;
  box-sizing: border-box;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: #fffdf6;
  color: #5a3a10;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.6;
  outline: none;
  resize: none;
}
.pe-ta:focus {
  border-color: #b8862f;
  box-shadow: 0 0 0 2px rgba(224, 178, 92, 0.28);
}
.pe-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
}
.pe-note {
  flex: 1;
  font-size: 10px;
  color: #a5844f;
}
.unit {
  flex: none;
  font-size: 11px;
  color: #8a6c42;
}
.tin.num {
  flex: none;
  width: 46px;
  text-align: center;
}
.tin.sel {
  flex: 1;
  min-width: 0;
  padding: 0 2px;
  cursor: pointer;
}
.mini-b.on {
  border-color: #b8862f;
  background: linear-gradient(180deg, #ffe9a8, #e8c46a);
  color: #5a3a10;
  font-weight: bold;
}
/* 人设编辑浮层 */
.pe-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(40, 26, 8, 0.28);
  z-index: 30;
}
.pe {
  width: 296px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #b8862f;
  border-radius: 4px;
  background: linear-gradient(180deg, #fffdf6, #fbf1d9);
  box-shadow: 0 4px 14px rgba(60, 40, 10, 0.35);
}
.pe-h {
  display: flex;
  align-items: center;
  height: 18px;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: bold;
  color: #6b4a1e;
}
.pe-x {
  margin-left: auto;
  padding: 0 3px;
  font-size: 13px;
  font-weight: normal;
  color: #a5844f;
  cursor: pointer;
}
.pe-x:hover {
  color: #7a5417;
}
.pe-ta {
  width: 100%;
  height: 92px;
  padding: 4px 5px;
  box-sizing: border-box;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: #fffdf6;
  color: #5a3a10;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.6;
  outline: none;
  resize: none;
}
.pe-ta:focus {
  border-color: #b8862f;
  box-shadow: 0 0 0 2px rgba(224, 178, 92, 0.28);
}
.pe-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
}
.pe-note {
  flex: 1;
  font-size: 10px;
  color: #a5844f;
}
.unit {
  flex: none;
  font-size: 11px;
  color: #8a6c42;
}
.tin:focus {
  border-color: #b8862f;
  box-shadow: 0 0 0 2px rgba(224, 178, 92, 0.28);
}
.seg {
  display: flex;
  gap: 4px;
}
.seg-b {
  flex: 1;
  height: 21px;
  padding: 0;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: linear-gradient(180deg, #fffdf6, #f4e8cd);
  color: #8a6c42;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.seg-b.on {
  border-color: #b8862f;
  background: linear-gradient(180deg, #ffe9a8, #e8c46a);
  color: #5a3a10;
  font-weight: bold;
}
.ai-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 1px 0 3px;
}
.mini-b {
  flex: none;
  height: 20px;
  padding: 0 8px;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: linear-gradient(180deg, #fffdf6, #f1e3c4);
  color: #8a6c42;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.mini-b:hover {
  border-color: #b8862f;
  color: #5a3a10;
}
.ai-msg {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: #3f7a3f;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ai-msg.bad {
  color: #b33b28;
}
/* 全局操作提示：浮在底部按钮上方，不占内容区高度 */
.toast {
  position: absolute;
  left: 50%;
  bottom: 52px;
  transform: translateX(-50%);
  max-width: 88%;
  padding: 3px 10px;
  background: #fffbe8;
  border: 1px solid #d9c49a;
  border-radius: 4px;
  font-size: 11px;
  line-height: 16px;
  color: #6b4a1e;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  z-index: 30;
  pointer-events: none;
}
.toast.bad {
  color: #b33b28;
  border-color: #e2a9a0;
  background: #fff2f0;
}
/* AI 页签 */
.fld {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 4px;
}
.lab {
  flex: none;
  width: 46px;
  font-size: 11px;
  color: #8a6c42;
}
.fld .seg {
  flex: 1;
}
.tin {
  flex: 1;
  min-width: 0;
  width: auto;
  height: 21px;
  padding: 0 5px;
  box-sizing: border-box;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: #fffdf6;
  color: #5a3a10;
  font-family: inherit;
  font-size: 11px;
  outline: none;
}
.tin.num {
  flex: none;
  width: 46px;
  text-align: center;
}
.tin.sel {
  flex: 1;
  min-width: 0;
  padding: 0 2px;
  cursor: pointer;
}
.mini-b.on {
  border-color: #b8862f;
  background: linear-gradient(180deg, #ffe9a8, #e8c46a);
  color: #5a3a10;
  font-weight: bold;
}
/* 人设编辑浮层 */
.pe-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(40, 26, 8, 0.28);
  z-index: 30;
}
.pe {
  width: 296px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #b8862f;
  border-radius: 4px;
  background: linear-gradient(180deg, #fffdf6, #fbf1d9);
  box-shadow: 0 4px 14px rgba(60, 40, 10, 0.35);
}
.pe-h {
  display: flex;
  align-items: center;
  height: 18px;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: bold;
  color: #6b4a1e;
}
.pe-x {
  margin-left: auto;
  padding: 0 3px;
  font-size: 13px;
  font-weight: normal;
  color: #a5844f;
  cursor: pointer;
}
.pe-x:hover {
  color: #7a5417;
}
.pe-ta {
  width: 100%;
  height: 92px;
  padding: 4px 5px;
  box-sizing: border-box;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: #fffdf6;
  color: #5a3a10;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.6;
  outline: none;
  resize: none;
}
.pe-ta:focus {
  border-color: #b8862f;
  box-shadow: 0 0 0 2px rgba(224, 178, 92, 0.28);
}
.pe-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
}
.pe-note {
  flex: 1;
  font-size: 10px;
  color: #a5844f;
}
.unit {
  flex: none;
  font-size: 11px;
  color: #8a6c42;
}
.tin.num {
  flex: none;
  width: 46px;
  text-align: center;
}
.tin.sel {
  flex: 1;
  min-width: 0;
  padding: 0 2px;
  cursor: pointer;
}
.mini-b.on {
  border-color: #b8862f;
  background: linear-gradient(180deg, #ffe9a8, #e8c46a);
  color: #5a3a10;
  font-weight: bold;
}
/* 人设编辑浮层 */
.pe-mask {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(40, 26, 8, 0.28);
  z-index: 30;
}
.pe {
  width: 296px;
  padding: 8px;
  box-sizing: border-box;
  border: 1px solid #b8862f;
  border-radius: 4px;
  background: linear-gradient(180deg, #fffdf6, #fbf1d9);
  box-shadow: 0 4px 14px rgba(60, 40, 10, 0.35);
}
.pe-h {
  display: flex;
  align-items: center;
  height: 18px;
  margin-bottom: 5px;
  font-size: 12px;
  font-weight: bold;
  color: #6b4a1e;
}
.pe-x {
  margin-left: auto;
  padding: 0 3px;
  font-size: 13px;
  font-weight: normal;
  color: #a5844f;
  cursor: pointer;
}
.pe-x:hover {
  color: #7a5417;
}
.pe-ta {
  width: 100%;
  height: 92px;
  padding: 4px 5px;
  box-sizing: border-box;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: #fffdf6;
  color: #5a3a10;
  font-family: inherit;
  font-size: 11px;
  line-height: 1.6;
  outline: none;
  resize: none;
}
.pe-ta:focus {
  border-color: #b8862f;
  box-shadow: 0 0 0 2px rgba(224, 178, 92, 0.28);
}
.pe-foot {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-top: 6px;
}
.pe-note {
  flex: 1;
  font-size: 10px;
  color: #a5844f;
}
.unit {
  flex: none;
  font-size: 11px;
  color: #8a6c42;
}
.tin:focus {
  border-color: #b8862f;
  box-shadow: 0 0 0 2px rgba(224, 178, 92, 0.28);
}
.seg {
  display: flex;
  gap: 4px;
}
.seg-b {
  flex: 1;
  height: 21px;
  padding: 0;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: linear-gradient(180deg, #fffdf6, #f4e8cd);
  color: #8a6c42;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.seg-b.on {
  border-color: #b8862f;
  background: linear-gradient(180deg, #ffe9a8, #e8c46a);
  color: #5a3a10;
  font-weight: bold;
}
.ai-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 1px 0 3px;
}
.mini-b {
  flex: none;
  height: 20px;
  padding: 0 8px;
  border: 1px solid #cbb081;
  border-radius: 3px;
  background: linear-gradient(180deg, #fffdf6, #f1e3c4);
  color: #8a6c42;
  font-family: inherit;
  font-size: 11px;
  cursor: pointer;
}
.mini-b:hover {
  border-color: #b8862f;
  color: #5a3a10;
}
.ai-msg {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  color: #3f7a3f;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.ai-msg.bad {
  color: #b33b28;
}
.hint {
  margin-top: 3px;
  padding-top: 3px;
  border-top: 1px dashed #d9c49a;
  font-size: 11px;
  line-height: 1.7;
  color: #9b7f52;
}
/* 人设「当前生效」提示：紧贴下拉框，不画分隔线 */
.pe-now {
  margin: -1px 0 5px 46px;
  padding-top: 0;
  border-top: 0;
  font-size: 10px;
  line-height: 1.5;
  color: #7c8fa6;
  word-break: break-all;
}

/* 数据目录：标题与路径同行（路径过长省略，悬停看完整），下面一排小按钮 */
.dpath {
  margin-top: 2px;
  padding-top: 2px;
  border-top: 1px dashed #d9c49a;
}
.dp-row {
  display: flex;
  align-items: center;
  gap: 5px;
}
.dp-h {
  flex: none;
  font-size: 11px;
  font-weight: bold;
  color: #6b4a1e;
}
.dp-p {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  line-height: 14px;
  color: #9b7f52;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.dp-b {
  display: flex;
  gap: 4px;
  margin-top: 2px;
}
.dp-b .mini-b {
  height: 19px;
  padding: 0 8px;
  font-size: 10px;
}
.dp-b .mini-b:disabled {
  opacity: 0.45;
  cursor: default;
}
.dp-msg {
  margin-top: 2px;
  font-size: 10px;
  line-height: 1.4;
  color: #3f7a3f;
}
.dp-msg.bad {
  color: #b33b28;
}

/* 记忆面板：默认收起成一行摘要，展开后才占空间（内容区只有 196px 高） */
.mem {
  margin-top: 0;
  padding-top: 1px;
  border-top: 1px dashed #d9c49a;
}
.mem-h {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 16px;
  cursor: pointer;
  font-size: 12px;
  font-weight: bold;
  line-height: 16px;
  color: #6b4a1e;
}
.mem-h:hover {
  color: #a06b1e;
}
.mem-sub {
  flex: 1;
  min-width: 0;
  font-size: 10px;
  font-weight: normal;
  color: #9b7f52;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mem-ar {
  flex: none;
  width: 13px;
  text-align: center;
  font-size: 12px;
  color: #b0762a;
}
.mem-list {
  max-height: 74px;
  overflow-y: auto;
  margin: 3px 0;
}
.mem-i {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  line-height: 16px;
  color: #7d6242;
}
.mem-t {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.mem-x {
  flex: none;
  padding: 0 2px;
  color: #b0762a;
  cursor: pointer;
}
.mem-x:hover {
  color: #b33b28;
}
.mem-empty {
  margin: 3px 0;
  font-size: 10px;
  color: #b3a184;
}
.mem-b {
  display: flex;
  gap: 4px;
  margin-top: 3px;
}
.mem-b .mini-b {
  height: 19px;
  padding: 0 6px;
  font-size: 10px;
}
.mini-b.danger {
  border-color: #d8a79b;
  color: #b33b28;
}
.mini-b.danger:hover {
  border-color: #b33b28;
  background: linear-gradient(180deg, #fff0ec, #f6d6cd);
}

.about {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  padding-top: 6px;
}
.app-icon {
  width: 32px;
  height: 32px;
  border-radius: 4px;
}
.about-name {
  font-size: 13px;
  font-weight: bold;
  color: #5a3a10;
  margin-bottom: 4px;
}
.about-line {
  font-size: 11px;
  line-height: 1.8;
  color: #8a6c42;
}

/* 底部按钮 */
.foot {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 10px;
  display: flex;
  justify-content: center;
  gap: 14px;
}
.fbtn {
  width: 84px;
  height: 40px;
  cursor: pointer;
}
</style>
