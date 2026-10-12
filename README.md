# LoopPoint AI

一个可在手机本地打开的多模型 AI 聊天网页。支持 DeepSeek、OpenAI、OpenRouter、通义千问和智谱 GLM。

## 手机本地版

下载 [deepseek-mobile.html](./deepseek-mobile.html)，在手机浏览器中打开。聊天软件或 GitHub 的文件预览可能禁用 JavaScript，需先下载再打开。

在设置里选择平台，输入该平台的 API Key，也可点剪贴板按钮粘贴。密钥保存在当前设备的浏览器里，**不会写入 HTML 文件**。OpenRouter 的 `sk-or-v1-` 和 OpenAI 的 `sk-proj-` 前缀可自动识别；其他平台常共用 `sk-` 格式，需要确认平台。

左下角可切换模型。智能档位会选择该平台对应的模型并调整回复上限；“快速”通过缩短回复上限减少生成时间。省 Token 模式会发送更少的聊天历史并降低回复上限。切换这些设置不会在聊天记录里增加消息。

修改源码后运行 `npm run build:standalone` 可重新生成单文件版。

## 开发

```bash
npm install
npm test
npm run dev
```

如果要让服务端默认提供 DeepSeek，把 `.env.example` 复制为 `.env`，在其中填入 `DEEPSEEK_API_KEY`。在没有服务端密钥时，用户仍可在浏览器设置里输入自己的平台密钥。开发地址通常为 `http://localhost:5173`。

## 部署

项目含 Vercel 配置，也可使用 `npm run build && npm start` 运行。服务端环境变量 `DEEPSEEK_API_KEY` 只用于没有自带密钥的 DeepSeek 请求；用户在网页设置里添加的密钥直接从浏览器发往所选平台，不会写入仓库或服务端日志。
