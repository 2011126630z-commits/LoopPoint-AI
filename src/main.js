import './style.css'
import { createIcons, Plus, ArrowUp, Square, Settings2, ChevronDown, ClipboardPaste, X, Trash2, History } from 'lucide'
import { providers, providerById, providerForModel, detectProvider, modelName } from './providers.js'
import { buildHistory, outputLimit, streamChat } from './chat.js'
import { cleanConversations, cleanMemories, compactMessages, explicitMemory } from './memory.js'

const localMode = window.LOOPPOINT_STANDALONE === true
const $ = (selector) => document.querySelector(selector)
const vaultName = 'looppoint_keys_v2'
const preferenceName = 'looppoint_preferences'
const conversationsName = 'looppoint_conversations_v1'
const memoriesName = 'looppoint_memories_v1'
const tierNames = { low: '低', medium: '中', high: '高' }
const speedNames = { fast: '快速', standard: '标准' }

function readStorage(name, fallback) {
  try { return JSON.parse(localStorage.getItem(name)) || fallback } catch { return fallback }
}
function writeStorage(name, value) {
  try { localStorage.setItem(name, JSON.stringify(value)); return true } catch { return false }
}
const storedKeys = readStorage(vaultName, {})
try {
  const oldKey = localStorage.getItem('looppoint_api_key') || localStorage.getItem('deepseek_mobile_key')
  if (oldKey && !storedKeys.deepseek) storedKeys.deepseek = oldKey
} catch { /* Local file viewers may block storage. */ }
const keys = { ...storedKeys }
const prefs = readStorage(preferenceName, {})
let activeProvider = providerById(prefs.provider) || providers[0]
let intelligence = ['low', 'medium', 'high'].includes(prefs.intelligence) ? prefs.intelligence : 'medium'
let speed = ['fast', 'standard'].includes(prefs.speed) ? prefs.speed : 'standard'
let saveTokens = Boolean(prefs.saveTokens)
let activeModel = activeProvider.models.some((model) => model.id === prefs.model) ? prefs.model : activeProvider.presets[intelligence]
let conversations = cleanConversations(readStorage(conversationsName, []))
let memories = cleanMemories(readStorage(memoriesName, []))
let activeConversationId = conversations[0]?.id || null
let messages = conversations[0]?.messages.map((message) => ({ ...message })) || []
let sending = false
let controller = null
let conversationVersion = 0
let toastTimer = null
const newId = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

function persistPreferences() {
  writeStorage(preferenceName, {
    provider: activeProvider.id, model: activeModel, intelligence, speed, saveTokens,
  })
}
function persistConversation() {
  if (!messages.length) return
  if (!activeConversationId) activeConversationId = newId()
  const item = {
    id: activeConversationId,
    title: messages.find((message) => message.role === 'user')?.content.trim().slice(0, 32) || '新对话',
    updatedAt: Date.now(),
    messages: compactMessages(messages.filter((message) => !message.pending)),
  }
  conversations = cleanConversations([item, ...conversations.filter((entry) => entry.id !== activeConversationId)])
  if (!writeStorage(conversationsName, conversations)) toast('浏览器未能保存对话记录')
  if ($('#librarySheet').classList.contains('open')) renderLibrary()
}
function persistMemories() {
  memories = cleanMemories(memories)
  if (!writeStorage(memoriesName, memories)) toast('浏览器未能保存记忆')
  if ($('#librarySheet').classList.contains('open')) renderLibrary()
}
function toast(message) {
  const element = $('#toast')
  element.textContent = message
  element.classList.add('visible')
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => element.classList.remove('visible'), 2600)
}

$('#app').innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand"><span class="logo" aria-hidden="true"><i></i></span><span><strong>LoopPoint <em>AI</em></strong><small>与想法继续对话</small></span></div>
      <div class="actions">
        <button id="library" class="icon-btn" type="button" aria-label="历史与记忆" title="历史与记忆"><i data-lucide="history"></i></button>
        <button id="newChat" class="icon-btn" type="button" aria-label="新对话" title="新对话"><i data-lucide="plus"></i></button>
        <button id="settings" class="icon-btn" type="button" aria-label="设置" title="设置"><i data-lucide="settings-2"></i></button>
      </div>
    </header>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>
    <main id="messages" class="messages" aria-live="polite"></main>
    <div class="composer-area">
      <form id="composer" class="composer">
        <textarea id="prompt" rows="1" maxlength="12000" placeholder="发消息给 LoopPoint AI..." aria-label="消息"></textarea>
        <div class="composer-tools">
          <div class="model-picker">
            <button id="modelToggle" class="model-toggle" type="button" aria-label="选择 AI 模型" aria-expanded="false"><span class="model-dot"></span><span id="modelName"></span><i data-lucide="chevron-down"></i></button>
            <div id="modelMenu" class="model-menu" hidden>
              ${providers.map((provider) => `<div class="model-group"><div class="model-group-title">${provider.name}</div>${provider.models.map((model) => `<button type="button" class="model-option" data-model="${model.id}">${model.name}</button>`).join('')}</div>`).join('')}
            </div>
          </div>
          <div class="send-tools">
            <button id="profileButton" class="profile-button" type="button" title="智能与速度设置"></button>
            <button id="send" class="send-btn" type="submit" aria-label="发送" title="发送"><i class="send-icon" data-lucide="arrow-up"></i><i class="stop-icon" data-lucide="square" hidden></i></button>
          </div>
        </div>
      </form>
      <p class="credit">由所选模型提供回答</p>
    </div>
  </div>
  <div id="librarySheet" class="sheet" aria-hidden="true">
    <div id="libraryBackdrop" class="sheet-backdrop"></div>
    <section class="sheet-panel" aria-label="历史与记忆">
      <div class="sheet-head"><div><h2>历史与记忆</h2><small>仅保存在这台设备的浏览器中</small></div><button id="closeLibrary" class="icon-btn" type="button" aria-label="关闭"><i data-lucide="x"></i></button></div>
      <div class="library-tabs" role="tablist"><button id="historyTab" type="button" role="tab" aria-selected="true">历史对话</button><button id="memoryTab" type="button" role="tab" aria-selected="false">长期记忆</button></div>
      <div class="sheet-scroll">
        <div id="historyView"><div id="historyList" class="library-list"></div></div>
        <div id="memoryView" hidden><form id="memoryForm" class="memory-form"><input id="memoryInput" maxlength="240" placeholder="添加要记住的内容" aria-label="添加记忆"><button type="submit" title="添加记忆" aria-label="添加记忆"><i data-lucide="plus"></i></button></form><div id="memoryList" class="library-list"></div></div>
      </div>
    </section>
  </div>
  <div id="sheet" class="sheet" aria-hidden="true">
    <div id="sheetBackdrop" class="sheet-backdrop"></div>
    <section class="sheet-panel" aria-label="聊天设置">
      <div class="sheet-head"><div><h2>聊天设置</h2><small id="keyState"></small></div><button id="closeSettings" class="icon-btn" type="button" aria-label="关闭设置"><i data-lucide="x"></i></button></div>
      <div class="sheet-scroll">
        <div class="setting-block">
          <h3>AI 平台</h3>
          <div id="providerList" class="provider-list">${providers.map((provider) => `<button type="button" class="provider-chip" data-provider="${provider.id}">${provider.name}<span></span></button>`).join('')}</div>
        </div>
        <div class="setting-block">
          <div class="setting-heading"><h3>API Key</h3><button id="deleteKey" class="quiet-icon" type="button" title="删除此平台密钥" aria-label="删除此平台密钥"><i data-lucide="trash-2"></i></button></div>
          <div class="key-row"><input id="apiKey" type="password" placeholder="输入或粘贴 API Key" autocomplete="off" aria-label="API Key"><button id="pasteKey" type="button" title="从剪贴板粘贴" aria-label="从剪贴板粘贴"><i data-lucide="clipboard-paste"></i></button></div>
          <p id="keyHint" class="key-hint"></p>
          <div class="key-actions"><label><input id="rememberKey" type="checkbox" checked>记住密钥</label><button id="saveKey" type="button" class="save-key">保存密钥</button></div>
        </div>
        <div class="setting-block">
          <h3>智能档位</h3>
          <div class="segmented" id="intelligenceControl"><button type="button" data-tier="low">低</button><button type="button" data-tier="medium">中</button><button type="button" data-tier="high">高</button></div>
        </div>
        <div class="setting-block">
          <h3>回复速度</h3>
          <div class="segmented" id="speedControl"><button type="button" data-speed="fast">快速</button><button type="button" data-speed="standard">标准</button></div>
        </div>
        <div class="setting-block toggle-row"><label for="saveTokens">省 Token 模式</label><input id="saveTokens" type="checkbox" role="switch"></div>
      </div>
    </section>
  </div>
`
createIcons({ icons: { Plus, ArrowUp, Square, Settings2, ChevronDown, ClipboardPaste, X, Trash2, History } })

function libraryRow(text, detail, onOpen, onDelete, selected = false) {
  const row = document.createElement('div')
  row.className = `library-row${selected ? ' selected' : ''}`
  const open = document.createElement(onOpen ? 'button' : 'div')
  if (onOpen) open.type = 'button'
  open.className = 'library-item'
  open.textContent = text
  if (detail) {
    const small = document.createElement('small')
    small.textContent = detail
    open.append(small)
  }
  if (onOpen) open.addEventListener('click', onOpen)
  const remove = document.createElement('button')
  remove.type = 'button'
  remove.className = 'quiet-icon'
  remove.title = '删除'
  remove.setAttribute('aria-label', `删除${text}`)
  const icon = document.createElement('i')
  icon.setAttribute('data-lucide', 'trash-2')
  remove.append(icon)
  remove.addEventListener('click', onDelete)
  row.append(open, remove)
  return row
}

function renderLibrary() {
  const historyList = $('#historyList')
  historyList.replaceChildren()
  for (const entry of conversations) historyList.append(libraryRow(entry.title, new Date(entry.updatedAt).toLocaleDateString('zh-CN'), () => {
    conversationVersion++
    controller?.abort()
    setSending(false)
    activeConversationId = entry.id
    messages = entry.messages.map((message) => ({ ...message }))
    renderMessages()
    closeLibrary()
  }, () => {
    conversations = conversations.filter((item) => item.id !== entry.id)
    if (activeConversationId === entry.id) { conversationVersion++; controller?.abort(); setSending(false); activeConversationId = null; messages = []; renderMessages() }
    writeStorage(conversationsName, conversations)
    renderLibrary()
  }, entry.id === activeConversationId))
  if (!conversations.length) historyList.textContent = '暂无历史对话'
  const memoryList = $('#memoryList')
  memoryList.replaceChildren()
  for (const item of memories) memoryList.append(libraryRow(item.text, '', null, () => {
    memories = memories.filter((entry) => entry.id !== item.id)
    persistMemories()
    toast('已删除记忆')
  }))
  if (!memories.length) memoryList.textContent = '暂无长期记忆'
  createIcons({ icons: { Trash2 }, nameAttr: 'data-lucide', attrs: { 'aria-hidden': 'true' }, root: $('#librarySheet') })
}

function closeLibrary() {
  $('#librarySheet').classList.remove('open')
  $('#librarySheet').setAttribute('aria-hidden', 'true')
}
function openLibrary() {
  closeSettings()
  closeModelMenu()
  renderLibrary()
  $('#librarySheet').classList.add('open')
  $('#librarySheet').setAttribute('aria-hidden', 'false')
}
function showLibraryTab(tab) {
  $('#historyView').hidden = tab !== 'history'
  $('#memoryView').hidden = tab !== 'memory'
  $('#historyTab').setAttribute('aria-selected', String(tab === 'history'))
  $('#memoryTab').setAttribute('aria-selected', String(tab === 'memory'))
}

function renderMessages() {
  const list = $('#messages')
  list.replaceChildren()
  if (!messages.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.innerHTML = '<div class="empty-symbol">✳</div><h1>从这里开始</h1><p>把你的想法发过来。</p>'
    list.append(empty)
  }
  for (const message of messages) {
    const row = document.createElement('div')
    row.className = `message ${message.role}${message.error ? ' error' : ''}`
    if (message.role === 'assistant') {
      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      avatar.textContent = '✳'
      row.append(avatar)
    }
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    bubble.textContent = message.content
    row.append(bubble)
    list.append(row)
  }
  list.scrollTop = list.scrollHeight
  return list.lastElementChild?.querySelector('.bubble')
}

function updateControls(refreshKey = false) {
  $('#modelName').textContent = modelName(activeModel)
  $('#profileButton').textContent = `${tierNames[intelligence]}档 · ${speedNames[speed]}`
  $('#saveTokens').checked = saveTokens
  $('#keyState').textContent = keys[activeProvider.id] ? `${activeProvider.name} 已连接` : `${activeProvider.name} 未连接`
  if (refreshKey) {
    $('#apiKey').value = keys[activeProvider.id] || ''
    $('#rememberKey').checked = Boolean(storedKeys[activeProvider.id]) || !keys[activeProvider.id]
    $('#keyHint').textContent = ''
  }
  document.querySelectorAll('.provider-chip').forEach((button) => {
    button.classList.toggle('selected', button.dataset.provider === activeProvider.id)
    button.classList.toggle('connected', Boolean(keys[button.dataset.provider]))
  })
  document.querySelectorAll('.model-option').forEach((button) => button.classList.toggle('selected', button.dataset.model === activeModel))
  document.querySelectorAll('[data-tier]').forEach((button) => button.classList.toggle('selected', button.dataset.tier === intelligence))
  document.querySelectorAll('[data-speed]').forEach((button) => button.classList.toggle('selected', button.dataset.speed === speed))
}

function openSettings() {
  closeLibrary()
  closeModelMenu()
  updateControls(true)
  $('#sheet').classList.add('open')
  $('#sheet').setAttribute('aria-hidden', 'false')
}
function closeSettings() {
  $('#sheet').classList.remove('open')
  $('#sheet').setAttribute('aria-hidden', 'true')
  $('#apiKey').value = ''
}
function closeModelMenu() {
  $('#modelMenu').hidden = true
  $('#modelToggle').setAttribute('aria-expanded', 'false')
}
function changeProvider(providerId, announce = true) {
  activeProvider = providerById(providerId)
  activeModel = activeProvider.presets[intelligence]
  persistPreferences()
  updateControls(true)
  if (announce) toast(`已切换为 ${activeProvider.name} · ${modelName(activeModel)}`)
}

function setSending(value) {
  sending = value
  $('#send').setAttribute('aria-label', value ? '停止生成' : '发送')
  $('#send').title = value ? '停止生成' : '发送'
  $('#send .send-icon').hidden = value
  $('#send .stop-icon').hidden = !value
  $('#profileButton').disabled = value
}

async function sendMessage() {
  const content = $('#prompt').value.trim()
  if (!content || sending) return
  const key = keys[activeProvider.id]
  const proxy = !localMode && activeProvider.id === 'deepseek' && !key
  if (!key && !proxy) {
    openSettings()
    toast(`请先添加 ${activeProvider.name} 的 API Key`)
    return
  }
  closeModelMenu()
  const version = conversationVersion
  const provider = activeProvider
  const model = activeModel
  const request = new AbortController()
  controller = request
  setSending(true)
  $('#prompt').value = ''
  $('#prompt').style.height = ''
  messages = compactMessages([...messages, { role: 'user', content }])
  const remembered = explicitMemory(content)
  if (remembered && !memories.some((item) => item.text === remembered)) {
    memories.unshift({ id: newId(), text: remembered, createdAt: Date.now() })
    persistMemories()
    toast('已加入长期记忆')
  }
  persistConversation()
  const history = buildHistory(messages, saveTokens, memories)
  const reply = { role: 'assistant', content: '正在思考…', pending: true }
  messages.push(reply)
  const bubble = renderMessages()
  let output = ''
  let frame = null
  let timedOut = false
  let inactivityTimer = null
  const resetInactivityTimer = () => {
    clearTimeout(inactivityTimer)
    inactivityTimer = setTimeout(() => { timedOut = true; request.abort() }, 90000)
  }
  const paint = () => {
    frame = null
    if (version !== conversationVersion) return
    const list = $('#messages')
    const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 100
    bubble.textContent = reply.content
    if (nearBottom) list.scrollTop = list.scrollHeight
  }
  try {
    resetInactivityTimer()
    await streamChat({
      endpoint: provider.endpoint, apiKey: key, model, messages: history,
      maxTokens: outputLimit(speed, saveTokens, intelligence), signal: request.signal, proxy,
      onActivity: resetInactivityTimer,
      onDelta(delta) {
        resetInactivityTimer()
        output += delta
        reply.content = output
        if (frame === null) frame = requestAnimationFrame(paint)
      },
    })
    reply.content = output || '没有收到回复。'
  } catch (error) {
    if (version !== conversationVersion) return
    if (error.name === 'AbortError') {
      if (timedOut) {
        reply.content = '等待回复超时，请重试。'
        reply.error = true
        bubble.closest('.message').classList.add('error')
      } else {
        if (!output) messages.pop()
        else reply.content = output
        toast('已停止生成')
      }
    } else {
      reply.content = error instanceof TypeError ? '连接失败，请检查网络或平台接口是否可用。' : error.message
      reply.error = true
      bubble.closest('.message').classList.add('error')
    }
  } finally {
    clearTimeout(inactivityTimer)
    if (frame !== null) cancelAnimationFrame(frame)
    if (version === conversationVersion) {
      reply.pending = false
      if (messages.at(-1) === reply) bubble.textContent = reply.content
      else renderMessages()
      setSending(false)
      persistConversation()
    }
    if (controller === request) controller = null
  }
}

$('#composer').addEventListener('submit', (event) => {
  event.preventDefault()
  if (sending) controller?.abort()
  else sendMessage()
})
$('#prompt').addEventListener('input', () => {
  $('#prompt').style.height = 'auto'
  $('#prompt').style.height = `${Math.min($('#prompt').scrollHeight, 180)}px`
})
$('#prompt').addEventListener('keydown', (event) => {
  if (event.isComposing || event.keyCode === 229) return
  if (event.key === 'Enter' && !event.shiftKey) {
    event.preventDefault()
    $('#composer').requestSubmit()
  }
})
$('#newChat').addEventListener('click', () => {
  conversationVersion++
  controller?.abort()
  setSending(false)
  activeConversationId = null
  messages = []
  renderMessages()
  closeLibrary()
  toast('已开始新对话')
  $('#prompt').focus()
})
$('#library').addEventListener('click', openLibrary)
$('#closeLibrary').addEventListener('click', closeLibrary)
$('#libraryBackdrop').addEventListener('click', closeLibrary)
$('#historyTab').addEventListener('click', () => showLibraryTab('history'))
$('#memoryTab').addEventListener('click', () => showLibraryTab('memory'))
$('#memoryForm').addEventListener('submit', (event) => {
  event.preventDefault()
  const text = $('#memoryInput').value.trim()
  if (!text) return
  if (memories.some((item) => item.text === text)) { toast('这条记忆已经存在'); return }
  memories.unshift({ id: newId(), text, createdAt: Date.now() })
  $('#memoryInput').value = ''
  persistMemories()
  toast('已加入长期记忆')
})
$('#settings').addEventListener('click', openSettings)
$('#profileButton').addEventListener('click', openSettings)
$('#closeSettings').addEventListener('click', closeSettings)
$('#sheetBackdrop').addEventListener('click', closeSettings)

$('#modelToggle').addEventListener('click', () => {
  const open = $('#modelMenu').hidden
  $('#modelMenu').hidden = !open
  $('#modelToggle').setAttribute('aria-expanded', String(open))
})
document.querySelectorAll('.model-option').forEach((button) => button.addEventListener('click', () => {
  const nextProvider = providerForModel(button.dataset.model)
  activeProvider = nextProvider
  activeModel = button.dataset.model
  intelligence = nextProvider.models.find((model) => model.id === activeModel).tier
  persistPreferences()
  updateControls(true)
  closeModelMenu()
  toast(`已切换为 ${nextProvider.name} · ${modelName(activeModel)}`)
  if (!keys[nextProvider.id] && (localMode || nextProvider.id !== 'deepseek')) openSettings()
}))
document.addEventListener('click', (event) => {
  if (!event.target.closest('.model-picker')) closeModelMenu()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') { closeModelMenu(); closeSettings(); closeLibrary() }
})

document.querySelectorAll('.provider-chip').forEach((button) => button.addEventListener('click', () => {
  const pendingKey = $('#apiKey').value.trim()
  const hasNewKey = pendingKey && pendingKey !== (keys[activeProvider.id] || '')
  changeProvider(button.dataset.provider)
  if (hasNewKey) {
    $('#apiKey').value = pendingKey
    inspectKey()
  }
}))
document.querySelectorAll('[data-tier]').forEach((button) => button.addEventListener('click', () => {
  intelligence = button.dataset.tier
  activeModel = activeProvider.presets[intelligence]
  persistPreferences()
  updateControls()
  toast(`智能已切换为${tierNames[intelligence]}档 · ${modelName(activeModel)}`)
}))
document.querySelectorAll('[data-speed]').forEach((button) => button.addEventListener('click', () => {
  speed = button.dataset.speed
  persistPreferences()
  updateControls()
  toast(`回复速度已切换为${speedNames[speed]}`)
}))
$('#saveTokens').addEventListener('change', () => {
  saveTokens = $('#saveTokens').checked
  persistPreferences()
  toast(saveTokens ? '已开启省 Token 模式' : '已关闭省 Token 模式')
})

function inspectKey() {
  const value = $('#apiKey').value.trim()
  const found = detectProvider(value)
  if (found && found !== activeProvider.id) {
    changeProvider(found, false)
    $('#apiKey').value = value
    $('#keyHint').textContent = `已识别为 ${activeProvider.name} 密钥`
  } else if (found) $('#keyHint').textContent = `已识别为 ${activeProvider.name} 密钥`
  else $('#keyHint').textContent = value ? '此类密钥格式多个平台共用，请确认上方平台。' : ''
}
$('#apiKey').addEventListener('input', inspectKey)
$('#pasteKey').addEventListener('click', async () => {
  try {
    if (!navigator.clipboard?.readText) throw new Error('不可用')
    const value = await navigator.clipboard.readText()
    if (!value.trim()) { toast('剪贴板里没有文字'); return }
    $('#apiKey').value = value.trim()
    inspectKey()
    toast('已从剪贴板粘贴')
  } catch { toast('无法读取剪贴板，请长按输入框粘贴') }
})
$('#saveKey').addEventListener('click', () => {
  const value = $('#apiKey').value.trim()
  if (!value) { toast('请先输入 API Key'); $('#apiKey').focus(); return }
  const found = detectProvider(value)
  if (found && found !== activeProvider.id) { toast('密钥格式与所选平台不符'); return }
  keys[activeProvider.id] = value
  if ($('#rememberKey').checked) storedKeys[activeProvider.id] = value
  else delete storedKeys[activeProvider.id]
  if (!writeStorage(vaultName, storedKeys) && $('#rememberKey').checked) toast('当前浏览器无法保存密钥')
  else toast(`${activeProvider.name} 密钥已保存`)
  updateControls(true)
  closeSettings()
})
$('#deleteKey').addEventListener('click', () => {
  delete keys[activeProvider.id]
  delete storedKeys[activeProvider.id]
  writeStorage(vaultName, storedKeys)
  updateControls(true)
  toast(`已删除 ${activeProvider.name} 密钥`)
})

updateControls(true)
renderMessages()
if (localMode && !keys[activeProvider.id]) openSettings()
