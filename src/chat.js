export function buildHistory(messages, saveTokens) {
  const history = messages.filter((message) => !message.error && ['user', 'assistant'].includes(message.role))
  if (!saveTokens) return history.slice(-24).map(({ role, content }) => ({ role, content }))
  const recent = history.slice(-8)
  return recent.map(({ role, content }, index) => ({
    role,
    content: index === recent.length - 1 && role === 'user' ? content : content.slice(-1200),
  }))
}

export function outputLimit(speed, saveTokens, intelligence) {
  const limits = saveTokens
    ? { fast: { low: 128, medium: 256, high: 384 }, standard: { low: 256, medium: 384, high: 512 } }
    : { fast: { low: 384, medium: 640, high: 1024 }, standard: { low: 768, medium: 1536, high: 3072 } }
  return limits[speed]?.[intelligence] || 1536
}

function apiError(status, data, key) {
  if (status === 401 || status === 403) return new Error('密钥无效或没有访问权限，请在设置里检查。')
  if (status === 429) return new Error('请求太频繁或额度已用完，请稍后再试。')
  const message = data?.error?.message || data?.error || `请求失败 (${status})`
  return new Error(String(message).replaceAll(key || '\0', '[密钥]'))
}

export async function streamChat({ endpoint, apiKey, model, messages, maxTokens, signal, onDelta, proxy = false }) {
  const response = await fetch(proxy ? '/api/chat' : endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(proxy ? {} : { Authorization: `Bearer ${apiKey}` }),
    },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, stream: !proxy }),
    signal,
  })

  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw apiError(response.status, data, apiKey)
  }

  const type = response.headers.get('content-type') || ''
  if (!type.includes('text/event-stream') || !response.body) {
    const data = await response.json()
    const content = proxy ? data.message : data.choices?.[0]?.message?.content
    if (!content) throw new Error('没有收到回复，请重试。')
    onDelta(content)
    return content
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  let result = ''
  let done = false

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read()
      if (streamDone) break
      pending = (pending + decoder.decode(value, { stream: true })).replaceAll('\r\n', '\n')
      let end
      while ((end = pending.indexOf('\n\n')) !== -1) {
        const event = pending.slice(0, end)
        pending = pending.slice(end + 2)
        for (const line of event.split('\n')) {
          if (!line.startsWith('data:')) continue
          const data = line.slice(5).trim()
          if (data === '[DONE]') { done = true; break }
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content
            if (typeof delta === 'string' && delta) {
              result += delta
              onDelta(delta)
            }
          } catch { /* Ignore non-JSON stream metadata. */ }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (!result) throw new Error('没有收到回复，请重试。')
  return result
}
