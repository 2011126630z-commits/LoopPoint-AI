import './style.css'
import { createIcons, Plus, ArrowUp, ChevronDown } from 'lucide'

const localMode = window.LOOPPOINT_STANDALONE === true
const storageKey = 'looppoint_api_key'
const $ = (selector) => document.querySelector(selector)
function savedKey() {
  try { return localStorage.getItem(storageKey) || '' } catch { return '' }
}
let key = localMode ? savedKey() : ''
let messages = []
let sending = false
let sendAfterKey = false
let selectedModel = 'deepseek-chat'

$('#app').innerHTML = `
  <div class="app">
    <header class="topbar">
      <div class="brand"><span class="logo" aria-hidden="true"><i></i></span><span><strong>LoopPoint <em>AI</em></strong><small>与想法继续对话</small></span></div>
      <div class="actions">
        <button id="newChat" class="icon-btn" type="button" aria-label="新对话" title="新对话"><i data-lucide="plus"></i></button>
        ${localMode ? '<button id="settings" class="text-btn" type="button" title="设置密钥">密钥</button>' : ''}
      </div>
    </header>
    <main id="messages" class="messages" aria-live="polite"></main>
    <div class="composer-area">
      <form id="composer" class="composer">
        <textarea id="prompt" rows="1" placeholder="发消息给 LoopPoint AI..." aria-label="消息"></textarea>
        <div class="composer-tools">
          <div class="model-picker">
            <button id="modelToggle" class="model-toggle" type="button" aria-label="选择模型" aria-haspopup="true" aria-expanded="false"><span class="model-dot"></span><span id="modelName">DeepSeek Chat</span><i data-lucide="chevron-down"></i></button>
            <div id="modelMenu" class="model-menu" hidden>
              <button class="model-option active" type="button" data-model="deepseek-chat" aria-pressed="true"><span>DeepSeek Chat</span><small>日常对话</small></button>
              <button class="model-option" type="button" data-model="deepseek-reasoner" aria-pressed="false"><span>DeepSeek Reasoner</span><small>深入思考</small></button>
            </div>
          </div>
          <div class="send-tools"><span id="status" role="status"></span><button id="send" class="send-btn" type="submit" aria-label="发送" title="发送"><i data-lucide="arrow-up"></i></button></div>
        </div>
      </form>
      <p class="credit">由 DeepSeek 提供回答</p>
    </div>
  </div>
  ${localMode ? `<dialog id="keyDialog">
    <form id="keyForm">
      <div class="dialog-logo">✳</div>
      <h2>连接 DeepSeek</h2>
      <p>输入 API Key 即可开始对话。密钥只保存在这台设备，不会写进网页文件。</p>
      <label for="apiKey">API Key</label>
      <input id="apiKey" type="password" placeholder="sk-..." autocomplete="off" required>
      <label class="remember"><input id="remember" type="checkbox" checked>在此设备记住密钥</label>
      <div class="dialog-actions"><button id="cancelKey" type="button">取消</button><button class="primary" type="submit">连接</button></div>
    </form>
  </dialog>` : ''}
`
createIcons({ icons: { Plus, ArrowUp, ChevronDown } })

function render() {
  const list = $('#messages')
  list.replaceChildren()
  if (!messages.length) {
    const empty = document.createElement('div')
    empty.className = 'empty'
    empty.innerHTML = '<div class="empty-symbol">✳</div><h1>从这里开始</h1><p>把你的想法发过来。</p>'
    list.append(empty)
  }
  for (const item of messages) {
    const row = document.createElement('div')
    row.className = `message ${item.role}${item.error ? ' error' : ''}`
    if (item.role === 'assistant') {
      const avatar = document.createElement('span')
      avatar.className = 'avatar'
      avatar.textContent = '✳'
      row.append(avatar)
    }
    const bubble = document.createElement('div')
    bubble.className = 'bubble'
    bubble.textContent = item.content
    row.append(bubble)
    list.append(row)
  }
  list.scrollTop = list.scrollHeight
}

function showKeyDialog() {
  $('#apiKey').value = key
  $('#remember').checked = Boolean(savedKey()) || !key
  $('#keyDialog').showModal()
}

async function send() {
  const content = $('#prompt').value.trim()
  if (!content || sending) return
  if (localMode && !key) {
    sendAfterKey = true
    showKeyDialog()
    return
  }
  sending = true
  $('#send').disabled = true
  $('#status').textContent = '正在回复'
  $('#prompt').value = ''
  $('#prompt').style.height = ''
  messages.push({ role: 'user', content })
  const history = messages.filter((item) => !item.error).map(({ role, content: text }) => ({ role, content: text }))
  messages.push({ role: 'assistant', content: '正在思考…' })
  render()
  try {
    const response = await fetch(localMode ? 'https://api.deepseek.com/chat/completions' : '/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(localMode ? { Authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify({ model: selectedModel, messages: history, stream: false }),
    })
    const data = await response.json()
    if (!response.ok) {
      if (response.status === 401) throw new Error('密钥无效，请点右上角“密钥”重新填写。')
      throw new Error(data.error?.message || data.error || `请求失败 (${response.status})`)
    }
    messages[messages.length - 1] = { role: 'assistant', content: localMode ? data.choices?.[0]?.message?.content || '没有收到回复。' : data.message || '没有收到回复。' }
  } catch (error) {
    messages[messages.length - 1] = { role: 'assistant', error: true, content: error instanceof TypeError ? '连接失败，请检查网络后再试。' : error.message }
  } finally {
    sending = false
    $('#send').disabled = false
    $('#status').textContent = ''
    render()
  }
}

$('#composer').addEventListener('submit', (event) => { event.preventDefault(); send() })
$('#prompt').addEventListener('input', () => {
  $('#prompt').style.height = 'auto'
  $('#prompt').style.height = `${Math.min($('#prompt').scrollHeight, 180)}px`
})
$('#prompt').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); $('#composer').requestSubmit() }
})
$('#newChat').addEventListener('click', () => { messages = []; render(); $('#prompt').focus() })
function closeModelMenu() {
  $('#modelMenu').hidden = true
  $('#modelToggle').setAttribute('aria-expanded', 'false')
}
$('#modelToggle').addEventListener('click', () => {
  const open = $('#modelMenu').hidden
  $('#modelMenu').hidden = !open
  $('#modelToggle').setAttribute('aria-expanded', String(open))
})
document.querySelectorAll('.model-option').forEach((option) => {
  option.addEventListener('click', () => {
    selectedModel = option.dataset.model
    $('#modelName').textContent = option.querySelector('span').textContent
    document.querySelectorAll('.model-option').forEach((item) => {
      const active = item === option
      item.classList.toggle('active', active)
      item.setAttribute('aria-pressed', String(active))
    })
    closeModelMenu()
    $('#modelToggle').focus()
  })
})
document.addEventListener('click', (event) => {
  if (!event.target.closest('.model-picker')) closeModelMenu()
})
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeModelMenu()
})

if (localMode) {
  $('#settings').addEventListener('click', showKeyDialog)
  $('#cancelKey').addEventListener('click', () => { sendAfterKey = false; $('#keyDialog').close() })
  $('#keyForm').addEventListener('submit', (event) => {
    event.preventDefault()
    key = $('#apiKey').value.trim()
    if (!key) return
    try {
      if ($('#remember').checked) localStorage.setItem(storageKey, key)
      else localStorage.removeItem(storageKey)
    } catch { $('#status').textContent = '密钥仅在当前页面有效' }
    $('#keyDialog').close()
    if (sendAfterKey) { sendAfterKey = false; $('#composer').requestSubmit() }
    else $('#prompt').focus()
  })
}

render()
if (localMode && !key) showKeyDialog()
