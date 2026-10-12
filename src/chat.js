function terms(text) {
  const result = new Set((text.toLowerCase().match(/[a-z0-9]{2,}|[\u3400-\u9fff]{2,}/g) || []).flatMap((word) =>
    /[\u3400-\u9fff]/.test(word) ? Array.from({ length: Math.max(0, word.length - 1) }, (_, i) => word.slice(i, i + 2)) : [word]))
  return result
}

function relevance(text, query) {
  const words = terms(text)
  let score = 0
  for (const word of query) if (words.has(word)) score++
  return score
}

export function buildHistory(messages, saveTokens, memories = []) {
  const history = messages.filter((message) => !message.error && ['user', 'assistant'].includes(message.role))
  const latest = history.at(-1)?.content || ''
  const query = terms(latest)
  const recentStart = Math.max(0, history.length - (saveTokens ? 6 : 18))
  const selected = new Set(history.slice(recentStart).map((_, index) => recentStart + index))
  const older = []
  for (let i = 0; i < recentStart; i++) {
    if (history[i].role !== 'user') continue
    const score = relevance(history[i].content + ' ' + (history[i + 1]?.role === 'assistant' ? history[i + 1].content : ''), query)
    if (score) older.push({ index: i, score })
  }
  older.sort((a, b) => b.score - a.score || b.index - a.index)
  for (const { index } of older.slice(0, saveTokens ? 1 : 2)) {
    selected.add(index)
    if (history[index + 1]?.role === 'assistant' && index + 1 < recentStart) selected.add(index + 1)
  }
  const result = [...selected].sort((a, b) => a - b).map((index) => ({
    role: history[index].role,
    content: index === history.length - 1 && history[index].role === 'user'
      ? history[index].content
      : history[index].content.slice(-(saveTokens ? 900 : 3000)),
  }))
  const ranked = memories.map((item, index) => ({ text: item.text, score: relevance(item.text, query), index }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, saveTokens ? 4 : 10)
  if (ranked.length) result.unshift({ role: 'system', content: `以下是用户明确要求记住的信息。仅在相关时使用，不要无端提及：\n${ranked.map((item) => `- ${item.text}`).join('\n')}` })
  return result
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
