export const providers = [
  {
    id: 'deepseek',
    name: 'DeepSeek',
    endpoint: 'https://api.deepseek.com/chat/completions',
    models: [
      { id: 'deepseek-chat', name: 'DeepSeek Chat', tier: 'low' },
      { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner', tier: 'high' },
    ],
    presets: { low: 'deepseek-chat', medium: 'deepseek-chat', high: 'deepseek-reasoner' },
  },
  {
    id: 'openai',
    name: 'OpenAI',
    endpoint: 'https://api.openai.com/v1/chat/completions',
    models: [
      { id: 'gpt-4.1-mini', name: 'GPT-4.1 mini', tier: 'low' },
      { id: 'gpt-4.1', name: 'GPT-4.1', tier: 'high' },
    ],
    presets: { low: 'gpt-4.1-mini', medium: 'gpt-4.1-mini', high: 'gpt-4.1' },
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    endpoint: 'https://openrouter.ai/api/v1/chat/completions',
    models: [
      { id: 'openai/gpt-4o-mini', name: 'GPT-4o mini', tier: 'low' },
      { id: 'openrouter/auto', name: 'Auto Router', tier: 'medium' },
      { id: 'openai/gpt-4.1', name: 'GPT-4.1', tier: 'high' },
    ],
    presets: { low: 'openai/gpt-4o-mini', medium: 'openrouter/auto', high: 'openai/gpt-4.1' },
  },
  {
    id: 'qwen',
    name: '通义千问',
    endpoint: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    models: [
      { id: 'qwen-turbo', name: 'Qwen Turbo', tier: 'low' },
      { id: 'qwen-plus', name: 'Qwen Plus', tier: 'medium' },
      { id: 'qwen-max', name: 'Qwen Max', tier: 'high' },
    ],
    presets: { low: 'qwen-turbo', medium: 'qwen-plus', high: 'qwen-max' },
  },
  {
    id: 'zhipu',
    name: '智谱 GLM',
    endpoint: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    models: [
      { id: 'glm-4-flash', name: 'GLM-4 Flash', tier: 'low' },
      { id: 'glm-4-plus', name: 'GLM-4 Plus', tier: 'high' },
    ],
    presets: { low: 'glm-4-flash', medium: 'glm-4-flash', high: 'glm-4-plus' },
  },
]

export function providerById(id) {
  return providers.find((provider) => provider.id === id)
}

export function providerForModel(modelId) {
  return providers.find((provider) => provider.models.some((model) => model.id === modelId))
}

// Most platforms use sk- keys, so only prefixes unique to one provider are detected.
export function detectProvider(apiKey) {
  if (/^sk-or-v1-/i.test(apiKey)) return 'openrouter'
  if (/^sk-proj-/i.test(apiKey)) return 'openai'
  return null
}

export function modelName(modelId) {
  const provider = providerForModel(modelId)
  return provider?.models.find((model) => model.id === modelId)?.name || modelId
}
