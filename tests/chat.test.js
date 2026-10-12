import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHistory, outputLimit, streamChat } from '../src/chat.js'
import { detectProvider, providerForModel } from '../src/providers.js'
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
  assert.equal(buildHistory(messages, true)[0].content.length, 1200)
  messages.push({ role: 'user', content: 'b'.repeat(1400) })
  assert.equal(buildHistory(messages, true).at(-1).content.length, 1400)
  assert.equal(outputLimit('fast', true, 'medium'), 256)
  assert.equal(outputLimit('standard', false, 'high'), 3072)
  assert.equal(messages.length, 4)
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
