# LoopPoint AI

一个可在手机本地打开的多模型 AI 聊天网页。支持 DeepSeek、OpenAI、OpenRouter、通义千问和智谱 GLM。

## 手机本地版

下载 [deepseek-mobile.html](./deepseek-mobile.html)，在手机浏览器中打开。聊天软件或 GitHub 的文件预览可能禁用 JavaScript，需先下载再打开。

底部输入栏固定在屏幕底端：滚动聊天记录、页面被下拉、手机键盘弹出导致可视区域变矮时，它都会跟着收缩并保持贴底，不会被顶走。带刘海的机型会按安全区自动留白。

在设置里选择平台，输入该平台的 API Key，也可点剪贴板按钮粘贴。密钥保存在当前设备的浏览器里，**不会写入 HTML 文件**。OpenRouter 的 `sk-or-v1-` 和 OpenAI 的 `sk-proj-` 前缀可自动识别；其他平台常共用 `sk-` 格式，需要确认平台。

左下角可切换模型。智能档位会选择该平台对应的模型并调整回复上限；“快速”通过缩短回复上限减少生成时间。省 Token 模式会发送更少的聊天历史并降低回复上限。切换这些设置不会在聊天记录里增加消息。

回复按 Markdown 排版：标题、列表、引用、行内代码和代码块都会正常显示，代码块右上角可一键复制。每条消息旁边有复制和删除按钮，最后一个回复还能重新生成（会替换掉原来的回答，不计入新消息）。删除提问时会连同它的回答一起删除。

顶部的历史按钮可找回、切换或删除旧对话，也可添加、查看和删除长期记忆。聊天时输入“记住：……”也会把后面的内容加入长期记忆。发送消息时会优先带上相关旧对话和有限条记忆；省 Token 模式会进一步缩短上下文。这些数据仅存放在当前浏览器的本地存储中，不会跨设备同步；清除浏览器网站数据后无法恢复。因此面板里还提供导出备份和导入备份：导出会下载一个 JSON 文件，导入时按对话 id 合并、按记忆文本去重，不会覆盖现有内容。长期记忆会随聊天请求发送给当前所选的 AI 平台，不适合存放密码等敏感信息。

修改源码后运行 `npm run build:standalone` 可重新生成单文件版。

## 安装到手机（App 图标）

部署后的网址本身就是一个可安装的 App（PWA）：有独立图标、名字、全屏运行，并把界面缓存下来，断网也能打开（聊天需要联网）。浏览器只在 `http(s)` 下允许安装，所以要用部署地址，而不是直接打开下载到本地的 HTML 文件。

- **Android / Chrome、Edge**：打开网址后在设置面板里点「添加到主屏幕」，或从浏览器菜单选「安装应用」。安装后桌面图标会显示 LoopPoint 的标记。
- **iPhone / Safari**：点「分享」→「添加到主屏幕」。图标取自 `apple-touch-icon.png`，名称显示为 `LoopPoint`。
- 已经以 App 方式打开时，设置面板里的「安装到手机」一栏会自动隐藏。

图标都从 [public/favicon.svg](./public/favicon.svg) 的品牌标记生成，覆盖了各家系统的裁剪规则：

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| 普通图标 | `icons/icon-192.png`、`icons/icon-512.png` | 保留 favicon 的圆角正方形 |
| 自适应图标 | `icons/maskable-192.png`、`icons/maskable-512.png` | 全出血深绿底，标记落在 80% 安全区内，圆形/圆角/方形容器裁剪都不会切到图形 |
| iOS 主屏 | `apple-touch-icon.png` | 180×180、不透明，由 iOS 自己加圆角 |
| Android 13 主题图标 | `icons/monochrome-512.png` | 透明底白色字形 |
| 浏览器标签页 | `favicon.svg`、`favicon.ico`、`icons/favicon-32.png`、`icons/favicon-16.png` | 多尺寸 |

图标需要重新生成时运行（依赖 Pillow）：

```bash
python scripts/build-icons.py
```

单文件版 `deepseek-mobile.html` 会把图标以 data URI 内联，并在 `http(s)` 下用 Blob 生成清单，因此把它托管起来同样可以安装；用文件管理器直接打开则无法安装，这是浏览器的限制。

## 开发

```bash
npm install
npm test
npm run dev
```

`npm test` 覆盖 Markdown 渲染（含转义与链接白名单）、记忆/备份合并逻辑、图标与清单是否匹配（含 maskable 安全区、透明主题图标）、Service Worker 的预缓存与离线回退，以及 `deepseek-mobile.html` 中内联脚本能否正常解析。`npm run build:standalone` 在写出单文件版前会校验内联脚本没有被替换模式（`$&`、`` $` `` 等）篡改，损坏时会直接报错而不是生成打不开的文件。

如果要让服务端默认提供 DeepSeek，把 `.env.example` 复制为 `.env`，在其中填入 `DEEPSEEK_API_KEY`。在没有服务端密钥时，用户仍可在浏览器设置里输入自己的平台密钥。开发地址通常为 `http://localhost:5173`。

## 部署

项目含 Vercel 配置，也可使用 `npm run build && npm start` 运行。服务端环境变量 `DEEPSEEK_API_KEY` 只用于没有自带密钥的 DeepSeek 请求；用户在网页设置里添加的密钥直接从浏览器发往所选平台，不会写入仓库或服务端日志。
