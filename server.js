import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const port = Number(process.env.PORT || 8787)
const deepseekEndpoint = 'https://api.deepseek.com/chat/completions'

app.use(cors())
app.use(express.json({ limit: '1mb' }))

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.DEEPSEEK_API_KEY) })
})

app.post('/api/chat', async (req, res) => {
  const apiKey = process.env.DEEPSEEK_API_KEY

  if (!apiKey) {
    return res.status(500).json({
      error: 'DeepSeek API key is missing. Add DEEPSEEK_API_KEY to your .env file.',
    })
  }

  const { messages, model = 'deepseek-chat', temperature = 0.7 } = req.body || {}

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
        temperature: Number(temperature),
        stream: false,
      }),
    })

    const data = await response.json().catch(() => null)

    if (!response.ok) {
      return res.status(response.status).json({
        error: data?.error?.message || 'DeepSeek request failed.',
      })
    }

    res.json({
      message: data?.choices?.[0]?.message?.content || '',
      usage: data?.usage || null,
      model: data?.model || model,
    })
  } catch (error) {
    res.status(502).json({ error: `Could not reach DeepSeek: ${error.message}` })
  }
})

if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'dist')))
  app.use((_req, res) => {
    res.sendFile(path.join(__dirname, 'dist', 'index.html'))
  })
}

app.listen(port, () => {
  console.log(`DeepSeek chat server listening on http://localhost:${port}`)
})
