<template>
  <QFrame title="和QQ聊天" @close="close">
    <template #extra>
      <span class="prov">{{ modelLabel }}</span>
      <span v-if="thinking" class="dots">思考中…</span>
    </template>

    <div class="chat">
      <!-- 未配置：引导去设置 -->
      <div v-if="!configured" class="notice">
        <div class="nt-t">还没配置 AI</div>
        <div class="nt-b">
          去「系统设置 → AI 助手」填上接口地址、API Key 和模型名称（任何 OpenAI 兼容接口都行），
          宝贝就能自己说话了，也能根据你聊的内容自己挑动作（吃东西、洗澡、去打工、玩游戏…）。
        </div>
        <button class="qq-btn primary" @click="openSettings">打开系统设置</button>
      </div>

      <template v-else>
        <div ref="listEl" class="list qq-scroll">
          <template v-for="g in groups" :key="g.day">
            <div class="day">{{ g.day }}</div>
            <div v-for="m in g.rows" :key="m.key" class="row" :class="m.role">
              <div class="bubble">
                <span v-if="m.src === 'auto'" class="auto-tag">主动</span>
                <div class="txt">{{ m.text }}</div>
                <div v-if="m.action || m.emotion" class="act">
                  <span v-if="m.emotion">心情：{{ emotionLabel(m.emotion) }}</span>
                  <span v-if="m.emotion && m.action" class="sepdot">·</span>
                  <span v-if="m.action">动作：{{ actionLabel(m.action) }}</span>
                </div>
                <div v-if="m.fail" class="fail">{{ m.fail }}</div>
              </div>
            </div>
          </template>
          <div v-if="thinking" class="row pet">
            <div class="bubble typing"><span></span><span></span><span></span></div>
          </div>
        </div>

        <div class="chips">
          <span v-for="c in chats" :key="c" class="chip" @click="send(c)">{{ c }}</span>
        </div>

        <div class="input">
          <textarea
            v-model="draft"
            class="ta qq-scroll"
            rows="2"
            maxlength="200"
            placeholder="说点什么…（Enter 发送，Shift+Enter 换行）"
            @keydown.enter.exact.prevent="send()"
          ></textarea>
          <div class="send-col">
            <button class="qq-btn primary" :disabled="thinking || !draft.trim()" @click="send()">发送</button>
            <button class="qq-btn" @click="clearHistory">清空</button>
          </div>
        </div>

        <div class="foot">
          <span class="f-l">{{ status }}</span>
          <span class="f-r">
            {{ messages.length }} 条<template v-if="memFacts"> · 记住 {{ memFacts }} 件</template>
          </span>
        </div>
      </template>
    </div>
  </QFrame>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue'
import QFrame from '../ui/QFrame.vue'
import { readAiConfig, personaText } from '../composables/aiConfig'

// 动作名 → 中文，仅用于气泡下方的小标签
const ACTION_LABEL = {
  eat: '吃东西',
  clean: '洗澡',
  play: '玩耍',
  study: '上课',
  work: '打工',
  game: '玩小游戏',
  shop: '逛商店',
  bag: '翻背包',
  info: '看档案',
  task: '做任务',
  friend: '找好友',
  interact: '撒娇',
  stand: '站好'
}
const EMOTION_LABEL = {
  happy: '开心',
  excited: '兴奋',
  shy: '害羞',
  love: '心动',
  sad: '难过',
  angry: '生气',
  hungry: '饿了',
  sleepy: '困了',
  normal: '平静'
}
const actionLabel = (a) => ACTION_LABEL[a] || a
const emotionLabel = (e) => EMOTION_LABEL[e] || e

const chats = ['在干嘛呀', '讲个笑话']
const messages = ref([])
const draft = ref('')
const thinking = ref(false)
const status = ref('')
const listEl = ref(null)

// —— 记忆：L1 摘要 + L2 长期档案拼成一段，塞进 system prompt ——
// L0 原文就是 messages 本身（发送时取最近 10 轮），不需要另外存。
const memoryBlock = ref('')
const memFacts = ref(0)

// 按天分组显示（历史回填后可能跨好几天）
const groups = computed(() => {
  const out = []
  let cur = null
  for (const m of messages.value) {
    const label = dayLabel(m.time)
    if (!cur || cur.day !== label) {
      cur = { day: label, rows: [] }
      out.push(cur)
    }
    cur.rows.push(m)
  }
  return out
})

function dayLabel(ts) {
  const d = new Date(ts || Date.now())
  const t = new Date()
  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  if (sameDay(d, t)) return '今天'
  const y = new Date(t.getTime() - 86400000)
  if (sameDay(d, y)) return '昨天'
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
}

const cfg = ref(readCfg())
const configured = computed(() => !!(cfg.value.apiKey || '').trim())
// 标题栏右侧显示实际用的模型名（接口地址太长，不往标题上放）
const modelLabel = computed(() => cfg.value.model || '未设模型')

function readCfg() {
  return readAiConfig()
}

// —— 人设 & 状态，让回复贴合宠物现状 ——
function petState() {
  const n = (k, d) => {
    const v = localStorage.getItem(k)
    return v === null ? d : Number(v)
  }
  return {
    name: localStorage.getItem('qqpet.name') || '宝贝',
    owner: localStorage.getItem('qqpet.owner') || localStorage.getItem('qqpet.savedQq') || '主人',
    level: n('qqpet.level', 1),
    hunger: n('qqpet.hunger', 100),
    clean: n('qqpet.clean', 100),
    health: n('qqpet.health', 100),
    mood: n('qqpet.moodval', 1000),
    coins: n('qqpet.coins', 0)
  }
}

function systemPrompt() {
  const s = petState()
  const persona = personaText(cfg.value.persona)
  return [
    `你是桌面宠物「${s.name}」的扮演者，主人叫「${s.owner}」。`,
    `性格设定：${persona}`,
    `当前状态：等级 ${s.level}，饱食 ${s.hunger}/100，清洁 ${s.clean}/100，健康 ${s.health}/100，心情 ${s.mood}/1000，元宝 ${s.coins}。`,
    '保持这个人设说话，不要因为一轮对话就跳出角色。状态不好（饿/脏/病/心情低）时要自然地在台词里流露出来。',
    '回复要求：像宠物说话，口语短句，20~50 字以内，不要用 Markdown、不要列表、不要括号动作描写。',
    '格式要求：只输出那一个 JSON 对象本身，不要代码块、不要解释、不要在前后加任何字符；reply 必须是单行，不能有换行。',
    '格式要求：只输出那一个 JSON 对象本身，不要代码块、不要解释、不要在前后加任何字符；reply 必须是单行，不能有换行。',
    '你必须只输出一个 JSON 对象，格式：{"reply":"对主人说的话","emotion":"情绪","action":"动作","mood":整数}',
    'emotion 必填，只能从这些里选一个，要和语气一致：',
    'happy(开心) excited(兴奋) shy(害羞) love(黏人/撒娇) sad(难过) angry(生气) hungry(饿了) sleepy(困了) normal(平静)',
    'action 只能从这些里选一个，或用 none：',
    'eat(吃东西) clean(洗澡) play(玩耍) study(上课) work(打工) game(玩小游戏) shop(逛商店) bag(翻背包) info(看档案) task(做任务) friend(找好友) interact(撒娇) stand(站好) none(不动作)',
    '选择规则：主人让你吃→eat，让你洗→clean，让你玩→play，让你打工→work，让你上课→study，让你玩游戏→game。',
    '主人只是闲聊时用 interact 或 none，别每次都乱动。mood 是这次对话对心情的影响，-10~10 的整数，普通聊天给 0~3。',
    '你会按 emotion 播放对应的心情动画，所以情绪要选准：被夸→happy/shy，被冷落→sad，被逗→angry，饿着→hungry。',
    memoryBlock.value
      ? `【你的记忆】\n${memoryBlock.value}\n这些是你确实记得的事。聊到相关话题时自然用上，别生硬复述，也别一次全倒出来。`
      : ''
  ]
    .filter(Boolean)
    .join('\n')
}

function scrollBottom() {
  nextTick(() => {
    if (listEl.value) listEl.value.scrollTop = listEl.value.scrollHeight
  })
}

let seq = 0
function push(role, text, extra = {}) {
  messages.value.push({ key: `m${++seq}`, role, text, time: Date.now(), ...extra })
  scrollBottom()
}

// 重新读 L1/L2：压缩完成或清空记忆后调用
async function refreshMemory() {
  const ctx = await window.api.memContext?.(0)
  if (!ctx) return
  const parts = []
  if (ctx.impression) parts.push(`更早以前：${ctx.impression}`)
  if (ctx.summary) parts.push(`最近聊过：\n${ctx.summary}`)
  if (ctx.facts) parts.push(`你记着的事：\n${ctx.facts}`)
  memoryBlock.value = parts.join('\n')
  memFacts.value = ctx.factCount || 0
}

async function send(text) {
  const content = String(text ?? draft.value).trim()
  if (!content || thinking.value) return
  if (!configured.value) {
    status.value = '还没配置 API Key'
    return
  }
  draft.value = ''
  push('user', content)
  // 立刻落盘：即使这轮请求失败，下次打开也还记得问过什么
  window.api.memAppend?.({ role: 'user', text: content, src: 'chat' })
  thinking.value = true
  status.value = `${modelLabel.value} 请求中…`

  // 只带最近 12 轮，控制 token（更早的交给 L1 摘要概括）
  const history = messages.value
    .filter((m) => !m.fail)
    .slice(-12)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text }))

  const res = await window.api.aiChat({
    apiKey: cfg.value.apiKey,
    baseUrl: cfg.value.baseUrl,
    model: cfg.value.model,
    messages: [{ role: 'system', content: systemPrompt() }, ...history]
  })

  thinking.value = false
  if (!res || !res.ok) {
    status.value = '请求失败'
    push('pet', '呜…我脑子卡住了。', { fail: res?.error || '未知错误' })
    return
  }

  const parsed = res.parsed || { reply: res.content || '', action: '', emotion: '', mood: 0 }
  status.value = `${res.model || modelLabel.value} · ${res.usage?.out || 0} tokens`
  push('pet', parsed.reply || '（没说话）', {
    action: parsed.action || '',
    emotion: parsed.emotion || '',
    src: 'chat'
  })
  window.api.memAppend?.({
    role: 'pet',
    text: parsed.reply || '',
    src: 'chat',
    emotion: parsed.emotion || '',
    action: parsed.action || ''
  })

  // 攒够 20 条后台压一次 L1/L2，不 await——绝不能让总结卡住下一句回复
  Promise.resolve(
    window.api.memCompact?.({
      apiKey: cfg.value.apiKey,
      baseUrl: cfg.value.baseUrl,
      model: cfg.value.model
    })
  )
    .then((r) => {
      if (r?.ok && !r.skipped) {
        refreshMemory()
        status.value = `记忆已更新（+${(r.facts || []).length} 条）`
      }
    })
    .catch(() => {})

  // 台词 + 情绪 + 动作一起交给宠物窗口：先冒泡，稍后按情绪/动作播动画
  window.api.aiSay?.({
    text: parsed.reply || '',
    action: parsed.action || '',
    emotion: parsed.emotion || '',
    mood: parsed.mood || 0
  })
}

async function clearHistory() {
  messages.value = []
  status.value = ''
  // 只清今天的聊天原文；L1/L2 是长期记忆，不跟着删（要全清去系统设置）
  await window.api.memClear?.('today')
  push('pet', '刚才的聊天我忘掉啦～', {})
  status.value = '已清空今天的记录'
}

function openSettings() {
  window.api.openSettings?.()
}

function close() {
  window.api.closeSelf()
}

// 回填最近几天的记录（关窗重开不再从空白开始）
async function loadChatHistory() {
  const list = await window.api.memHistory?.({ days: 3, limit: 80 })
  if (!Array.isArray(list)) return
  const rows = list.flatMap((g) => g.rows || []).slice(-80)
  messages.value = rows.map((m) => ({
    key: `m${++seq}`,
    role: m.role === 'user' ? 'user' : 'pet',
    text: String(m.text || ''),
    time: Number(m.t) || Date.now(),
    src: m.src || 'chat',
    emotion: m.emotion || '',
    action: m.action || ''
  }))
}

// 设置页保存后会广播 storage-changed，这里重新读一次配置
let off = null
onMounted(async () => {
  off = window.api.onStorageChanged?.(() => {
    cfg.value = readCfg()
  })
  window.addEventListener('beforeunload', () => off && off())

  await refreshMemory()
  await loadChatHistory()
  if (messages.value.length) {
    scrollBottom()
  } else {
    push('pet', '主人你来啦～想聊点什么？', {})
  }
})
</script>

<style scoped>
.chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  padding: 6px;
  box-sizing: border-box;
}
.prov {
  margin-right: 8px;
  padding: 0 6px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.35);
  color: #1b3d67;
  font-size: 10px;
  line-height: 14px;
}
.dots {
  margin-right: 6px;
  color: #dff0ff;
  font-size: 10px;
}

.notice {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 0 18px;
  text-align: center;
}
.nt-t {
  font-size: 14px;
  font-weight: bold;
  color: #1b3d67;
}
.nt-b {
  font-size: 12px;
  line-height: 1.8;
  color: #4a6b8f;
}
.notice .qq-btn {
  min-width: 120px;
  height: 26px;
}

/* 消息列表 */
.list {
  flex: 1;
  min-height: 0;
  padding: 4px 6px 6px;
  overflow-y: auto;
}
.day {
  margin: 2px 0 8px;
  text-align: center;
  font-size: 10px;
  color: #8aa4bf;
}
/* 宠物自己主动开口说的话，跟主人提问区分开 */
.auto-tag {
  display: inline-block;
  margin-right: 4px;
  padding: 0 4px;
  border-radius: 4px;
  background: #ffe9b0;
  color: #8a5a00;
  font-size: 9px;
  line-height: 13px;
  vertical-align: 1px;
}
.row {
  display: flex;
  margin-bottom: 8px;
}
.row.user {
  justify-content: flex-end;
}
.bubble {
  max-width: 78%;
  padding: 6px 9px;
  border-radius: 8px;
  font-size: 12px;
  line-height: 1.65;
  word-break: break-word;
  white-space: pre-wrap;
}
.row.pet .bubble {
  border: 1px solid #c9dced;
  border-top-left-radius: 2px;
  background: linear-gradient(180deg, #ffffff, #f1f9ff);
  color: #22405f;
  box-shadow: 0 1px 2px rgba(35, 64, 110, 0.08);
}
.row.user .bubble {
  border: 1px solid #8cc0e4;
  border-top-right-radius: 2px;
  background: linear-gradient(180deg, #dff1ff, #c6e5fb);
  color: #12324f;
}
.sepdot {
  margin: 0 4px;
  color: #b9cfe3;
}
.act {
  margin-top: 4px;
  padding-top: 3px;
  border-top: 1px dashed #d5e5f2;
  font-size: 10px;
  color: #2f7bbf;
}
.fail {
  margin-top: 3px;
  font-size: 10px;
  color: #c8402b;
}
.typing {
  display: flex;
  gap: 3px;
  align-items: center;
  height: 26px;
}
.typing span {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #8aa4bf;
  animation: blink 1.2s infinite;
}
.typing span:nth-child(2) {
  animation-delay: 0.2s;
}
.typing span:nth-child(3) {
  animation-delay: 0.4s;
}
@keyframes blink {
  0%,
  60%,
  100% {
    opacity: 0.25;
  }
  30% {
    opacity: 1;
  }
}

/* 快捷短语 */
.chips {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 0 4px 4px;
}
.chip {
  padding: 1px 8px;
  border: 1px solid #b9d3e8;
  border-radius: 9px;
  background: linear-gradient(180deg, #ffffff, #eaf5fd);
  color: #3a6d9c;
  font-size: 11px;
  cursor: pointer;
}
.chip:hover {
  border-color: #7fa9cc;
  color: #1d5288;
}

/* 输入区 */
.input {
  flex: none;
  display: flex;
  gap: 6px;
  padding: 0 4px;
}
.ta {
  flex: 1;
  min-width: 0;
  height: 44px;
  padding: 5px 6px;
  box-sizing: border-box;
  border: 1px solid #9dc0dc;
  border-radius: 4px;
  background: #fff;
  color: #12324f;
  font-family: inherit;
  font-size: 12px;
  line-height: 1.5;
  outline: none;
  resize: none;
}
.ta:focus {
  border-color: #4f8ac0;
  box-shadow: 0 0 0 2px rgba(126, 187, 231, 0.35);
}
.send-col {
  flex: none;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.send-col .qq-btn {
  width: 62px;
  height: 20px;
  padding: 0;
  font-size: 11px;
}

.foot {
  flex: none;
  display: flex;
  align-items: center;
  padding: 4px 6px 0;
  font-size: 10px;
  color: #7a94b0;
}
.f-l {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
</style>
