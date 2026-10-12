# LoopPoint AI

一个接入 DeepSeek API 的聊天网页，支持 DeepSeek Chat 和 DeepSeek Reasoner。

## 手机本地版

下载 [deepseek-mobile.html](./deepseek-mobile.html)，用手机浏览器打开，首次使用时输入自己的 DeepSeek API Key。网页文件本身不包含密钥。直接在 GitHub 或聊天软件的文件预览里打开时，JavaScript 可能被禁用；请先下载再用浏览器打开。

如果修改了界面，运行 `npm run build:standalone` 重新生成单文件版。

## 本地开发

```bash
npm install
cp .env.example .env
```

在 `.env` 中设置 `DEEPSEEK_API_KEY`，然后运行：

```bash
npm run dev
```

打开 Vite 输出的地址，通常是 `http://localhost:5173`。

## 部署

服务端版本通过 `/api/chat` 转发请求，密钥只放在服务端环境变量 `DEEPSEEK_API_KEY` 中。项目含 Vercel 配置，可直接导入仓库并添加该环境变量。生产环境本地运行：

```bash
npm run build
npm start
```

默认监听 `http://localhost:8787`。
