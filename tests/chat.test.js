import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHistory, outputLimit, streamChat } from '../src/chat.js'
import { detectProvider, providerForModel } from '../src/providers.js'
import { cleanConversations, cleanMemories, compactMessages, explicitMemory } from '../src/memory.js'
import hostedChat from '../api/chat.js'

test('key detection only selects providers with unique prefixes', () => {
  assert.equal(detectProvider('sk-or-v1-example'), 'openrouter')
  assert.equal(detectProvider('sk-proj-example'), 'openai')
  assert.equal(detectProvider('sk-ambiguous'), null)
  assert.equal(providerForModel('qwen-plus')?.id, 'qwen')
})

test('token saving trims history without creating messages', () => {
  const messages = [
    { role: 'user', content: 'a'.repeat(1400) },
    { role: 'assistant', content: 'failed', error: true },
    { role: 'assistant', content: 'answer' },
  ]
  assert.equal(buildHistory(messages, false).length, 2)
  assert.equal(buildHistory(messages, true)[0].content.length, 900)
  messages.push({ role: 'user', content: 'b'.repeat(1400) })
  assert.equal(buildHistory(messages, true).at(-1).content.length, 1400)
  assert.equal(outputLimit('fast', true, 'medium'), 256)
  assert.equal(outputLimit('standard', false, 'high'), 3072)
  assert.equal(messages.length, 4)
})

test('relevant older exchanges and explicit memories survive short context mode', () => {
  const messages = [
    { role: 'user', content: '我的项目叫星河笔记' },
    { role: 'assistant', content: '记下项目名称了' },
    ...Array.from({ length: 10 }, (_, index) => [
      { role: 'user', content: `普通问题 ${index}` },
      { role: 'assistant', content: `普通回答 ${index}` },
    ]).flat(),
    { role: 'user', content: '星河笔记的名字是什么？' },
  ]
  const result = buildHistory(messages, true, [{ text: '星河笔记是小说项目' }, { text: '完全无关的偏好' }])
  assert.equal(result[0].role, 'system')
  assert.match(result[0].content, /小说项目/)
  assert.doesNotMatch(result[0].content, /无关的偏好/)
  assert.ok(result.some((item) => item.content === '我的项目叫星河笔记'))
  assert.equal(result.at(-1).content, '星河笔记的名字是什么？')
  assert.equal(messages.length, 23)
})

test('saved conversations and memories are bounded and validated', () => {
  assert.equal(explicitMemory('请记住：我喜欢简洁回答'), '我喜欢简洁回答')
  assert.equal(explicitMemory('普通问题'), '')
  assert.deepEqual(cleanConversations([{ id: 'a', messages: [{ role: 'user', content: 'hello' }, { role: 'system', content: 'ignore' }] }])[0].messages, [{ role: 'user', content: 'hello' }])
  assert.deepEqual(cleanMemories([{ id: 'm', text: '  简洁回答  ' }])[0].text, '简洁回答')
  const longChat = Array.from({ length: 105 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: String(i) }))
  assert.equal(compactMessages(longChat).length, 99)
  assert.equal(compactMessages(longChat)[0].role, 'user')
})

test('reasoning-only stream events count as activity without showing hidden reasoning', async () => {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  globalThis.fetch = async () => new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\ndata: {"choices":[{"delta":{"content":"答复"}}]}\n\ndata: [DONE]\n\n'))
      controller.close()
    },
  }), { headers: { 'content-type': 'text/event-stream' } })
  try {
    let activity = 0
    let visible = ''
    await streamChat({ endpoint: 'https://example.test', apiKey: 'test', model: 'deepseek-reasoner', messages: [], maxTokens: 50,
      onActivity() { activity++ }, onDelta(delta) { visible += delta },
    })
    assert.equal(activity, 2)
    assert.equal(visible, '答复')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streaming accepts a final event without a blank line and reports stream errors', async () => {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  const responseFor = (body) => new Response(new ReadableStream({
    start(controller) { controller.enqueue(encoder.encode(body)); controller.close() },
  }), { headers: { 'content-type': 'text/event-stream' } })
  try {
    globalThis.fetch = async () => responseFor('data: {"choices":[{"delta":{"content":"完成"}}]}')
    assert.equal(await streamChat({ endpoint: 'https://example.test', apiKey: 'test', model: 'x', messages: [], maxTokens: 50, onDelta() {} }), '完成')
    globalThis.fetch = async () => responseFor('data: {"error":{"message":"额度不足"}}\n\n')
    await assert.rejects(streamChat({ endpoint: 'https://example.test', apiKey: 'test', model: 'x', messages: [], maxTokens: 50, onDelta() {} }), /额度不足/)
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('streaming joins split SSE events and returns visible text', async () => {
  const originalFetch = globalThis.fetch
  const encoder = new TextEncoder()
  const chunks = [
    'data: {"choices":[{"delta":{"content":"你"}}]}\r',
    '\n\r\ndata: {"choices":[{"delta":{"content":"好"}}]}\n\n',
    'data: [DONE]\n\n',
  ]
  globalThis.fetch = async (_url, options) => {
    assert.equal(JSON.parse(options.body).stream, true)
    return new Response(new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
        controller.close()
      },
    }), { headers: { 'content-type': 'text/event-stream' } })
  }
  try {
    let visible = ''
    const result = await streamChat({
      endpoint: 'https://example.test/chat', apiKey: 'test-key', model: 'deepseek-chat',
      messages: [{ role: 'user', content: 'hi' }], maxTokens: 512,
      onDelta(delta) { visible += delta },
    })
    assert.equal(result, '你好')
    assert.equal(visible, '你好')
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('proxy replies and authentication errors have clear behavior', async () => {
  const originalFetch = globalThis.fetch
  try {
    globalThis.fetch = async (_url, options) => {
      assert.equal(JSON.parse(options.body).stream, false)
      return Response.json({ message: 'OK' })
    }
    let visible = ''
    assert.equal(await streamChat({
      endpoint: '', apiKey: '', model: 'deepseek-chat', messages: [], maxTokens: 256,
      proxy: true, onDelta(delta) { visible += delta },
    }), 'OK')
    assert.equal(visible, 'OK')
    globalThis.fetch = async () => Response.json({ error: { message: 'bad key' } }, { status: 401 })
    await assert.rejects(
      streamChat({ endpoint: '', apiKey: 'secret', model: '', messages: [], maxTokens: 256, onDelta() {} }),
      /密钥无效/,
    )
  } finally {
    globalThis.fetch = originalFetch
  }
})

test('hosted DeepSeek proxy forwards the selected output limit', async () => {
  const originalFetch = globalThis.fetch
  const originalKey = process.env.DEEPSEEK_API_KEY
  process.env.DEEPSEEK_API_KEY = 'test-only-key'
  let sentBody
  globalThis.fetch = async (_url, options) => {
    sentBody = JSON.parse(options.body)
    return Response.json({ choices: [{ message: { content: 'OK' } }] })
  }
  const response = {
    status(code) { this.statusCode = code; return this },
    json(body) { this.body = body; return this },
  }
  try {
    await hostedChat({
      method: 'POST',
      body: { model: 'deepseek-chat', max_tokens: 256, messages: [{ role: 'user', content: 'hi' }] },
    }, response)
    assert.equal(response.statusCode, 200)
    assert.equal(response.body.message, 'OK')
    assert.equal(sentBody.max_tokens, 256)
    assert.equal(sentBody.stream, false)
  } finally {
    globalThis.fetch = originalFetch
    if (originalKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = originalKey
  }
})
