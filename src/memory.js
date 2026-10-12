const MAX_CONVERSATIONS = 20
const MAX_MESSAGES = 100
const MAX_MEMORIES = 30

export function explicitMemory(content) {
  const match = content.trim().match(/^(?:请|帮我)?记住(?:一下|这个|这点|：|:|，|,|\s)*(.*)$/s)
  return match?.[1]?.trim().slice(0, 240) || ''
}

export function cleanConversations(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_CONVERSATIONS).filter((item) => item && typeof item.id === 'string' && Array.isArray(item.messages)).map((item) => ({
    id: item.id,
    title: String(item.title || '新对话').slice(0, 32),
    updatedAt: Number(item.updatedAt) || Date.now(),
    messages: item.messages.slice(-MAX_MESSAGES).filter((message) => ['user', 'assistant'].includes(message?.role) && typeof message.content === 'string').map((message) => ({
      role: message.role, content: message.content.slice(0, 12000), ...(message.error ? { error: true } : {}),
    })),
  }))
}

export function cleanMemories(value) {
  if (!Array.isArray(value)) return []
  return value.slice(0, MAX_MEMORIES).filter((item) => item && typeof item.id === 'string' && typeof item.text === 'string' && item.text.trim()).map((item) => ({
    id: item.id, text: item.text.trim().slice(0, 240), createdAt: Number(item.createdAt) || Date.now(),
  }))
}
