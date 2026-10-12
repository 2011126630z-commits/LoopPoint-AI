const deepseekEndpoint = 'https://api.deepseek.com/chat/completions'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed.' })
  }

  const apiKey = process.env.DEEPSEEK_API_KEY
  if (!apiKey) {
    return res.status(500).json({
      error: 'DeepSeek API key is missing. Add DEEPSEEK_API_KEY in Vercel environment variables.',
    })
  }

  const { messages, model = 'deepseek-chat', max_tokens = 2048 } = req.body || {}

  if (!Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages must be a non-empty array.' })
  }

  const safeMessages = messages
    .filter((message) => ['system', 'user', 'assistant'].includes(message?.role))
    .map((message) => ({
      role: message.role,
      content: String(message.content || '').slice(0, 12000),
    }))
    .filter((message) => message.content.trim())
    .slice(-24)

  if (!safeMessages.some((message) => message.role === 'user')) {
    return res.status(400).json({ error: 'At least one user message is required.' })
  }

  try {
    const response = await fetch(deepseekEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: safeMessages,
        max_tokens: Math.min(8192, Math.max(1, Number(max_tokens) || 2048)),
        stream: false,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'DeepSeek request failed.',
      })
    }

    return res.status(200).json({
      message: data?.choices?.[0]?.message?.content || '',
      usage: data?.usage || null,
      model: data?.model || model,
    })
  } catch (error) {
    return res.status(502).json({ error: `Could not reach DeepSeek: ${error.message}` })
  }
}
