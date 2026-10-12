# 环点AI（LoopPoint AI）

一个可在手机上安装使用的多模型 AI 聊天应用。支持 DeepSeek、OpenAI、OpenRouter、通义千问和智谱 GLM。

## Android APK

[apk/loopoint-ai-1.0.0.apk](./apk/loopoint-ai-1.0.0.apk)（约 130 KB）是可直接安装的安卓安装包，桌面名称显示为 **环点AI**。

- **安装**：把 APK 传到手机后点开安装；首次会提示允许「安装未知来源的应用」。已装过旧版本可直接覆盖升级（同一个签名）。
- **完全离线**：APK 里是一个 WebView 壳 + 内置的 [deepseek-mobile.html](./deepseek-mobile.html)，只有调用 AI 接口时才联网，其余功能不依赖服务器。
- **数据在本机**：聊天记录、密钥、长期记忆都存在应用自己的存储里；「导出备份」走系统文件选择器保存 JSON，「导入备份」走系统文件选择器读取。
- **图标适配**：Android 8+ 用自适应图标，圆形/圆角方形/方形桌面容器都能正确裁剪；Android 13+ 支持主题取色。Android 7 及以下回退到多密度 PNG。
- 首次打开会自动弹出设置面板，填入任意平台的 API Key 即可开始聊天。

重新打包（需要 `ANDROID_HOME` 指向含 build-tools 与 platforms 的 SDK，以及 JDK 8+）：

```bash
npm run build:apk
```

打包**不需要 Gradle**：[scripts/build-apk.mjs](./scripts/build-apk.mjs) 直接用 `aapt2` 编译资源、`javac` 编译、`d8` 生成 dex、`zipalign` 对齐、`apksigner` 签名。签名用的是 [android/keystore/loopoint.jks](./android/keystore) 里的自签名密钥（密码 `looppoint`），**仅供侧载使用**；如果要上架 Google Play，请换成自己的正式密钥并妥善保管。

## 手机本地版

下载 [deepseek-mobile.html](./deepseek-mobile.html)，在手机浏览器中打开。聊天软件或 GitHub 的文件预览可能禁用 JavaScript，需先下载再打开。

底部输入栏固定在屏幕底端：滚动聊天记录、页面被下拉、手机键盘弹出导致可视区域变矮时，它都会跟着收缩并保持贴底，不会被顶走。带刘海的机型会按安全区自动留白。

在设置里选择平台，输入该平台的 API Key，也可点剪贴板按钮粘贴。密钥保存在当前设备的浏览器里，**不会写入 HTML 文件**。OpenRouter 的 `sk-or-v1-` 和 OpenAI 的 `sk-proj-` 前缀可自动识别；其他平台常共用 `sk-` 格式，需要确认平台。

左下角可切换模型。智能档位会选择该平台对应的模型并调整回复上限；“快速”通过缩短回复上限减少生成时间。省 Token 模式会发送更少的聊天历史并降低回复上限。切换这些设置不会在聊天记录里增加消息。

回复按 Markdown 排版：标题、列表、引用、行内代码和代码块都会正常显示，代码块右上角可一键复制。每条消息旁边有复制和删除按钮，最后一个回复还能重新生成（会替换掉原来的回答，不计入新消息）。删除提问时会连同它的回答一起删除。

顶部的历史按钮可找回、切换或删除旧对话，也可添加、查看和删除长期记忆。聊天时输入“记住：……”也会把后面的内容加入长期记忆。发送消息时会优先带上相关旧对话和有限条记忆；省 Token 模式会进一步缩短上下文。这些数据仅存放在当前浏览器的本地存储中，不会跨设备同步；清除浏览器网站数据后无法恢复。因此面板里还提供导出备份和导入备份：导出会下载一个 JSON 文件，导入时按对话 id 合并、按记忆文本去重，不会覆盖现有内容。长期记忆会随聊天请求发送给当前所选的 AI 平台，不适合存放密码等敏感信息。

修改源码后运行 `npm run build:standalone` 可重新生成单文件版。

## 安装到手机（PWA 图标）

把网页部署到 `http(s)` 后，它本身也是一个可安装的 App（PWA）：有独立图标、名字、全屏运行，并把界面缓存下来，断网也能打开（聊天需要联网）。浏览器只在 `http(s)` 下允许安装，所以要用部署地址，而不是直接打开下载到本地的 HTML 文件。

- **Android / Chrome、Edge**：打开网址后在设置面板里点「添加到主屏幕」，或从浏览器菜单选「安装应用」；也可以用上面的 APK。
- **iPhone / Safari**：点「分享」→「添加到主屏幕」。图标取自 `apple-touch-icon.png`，名称显示为 `环点AI`。
- 已经以 App 方式打开时（含 APK），设置面板里的「安装到手机」一栏会自动隐藏。

图标都从 [public/favicon.svg](./public/favicon.svg) 的品牌标记生成，覆盖了各家系统的裁剪规则：

| 用途 | 文件 | 说明 |
| --- | --- | --- |
| 普通图标 | `icons/icon-192.png`、`icons/icon-512.png` | 保留 favicon 的圆角正方形 |
| 自适应图标 | `icons/maskable-192.png`、`icons/maskable-512.png` | 全出血深绿底，标记落在 80% 安全区内，圆形/圆角/方形容器裁剪都不会切到图形 |
| iOS 主屏 | `apple-touch-icon.png` | 180×180、不透明，由 iOS 自己加圆角 |
| Android 13 主题图标 | `icons/monochrome-512.png` | 透明底白色字形 |
| Android 应用图标 | `android/app/src/main/res/mipmap-*/` | 每个密度一套：圆角 PNG、圆形 PNG、108dp 自适应前景 |
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

`npm test` 覆盖 Markdown 渲染（含转义与链接白名单）、记忆/备份合并逻辑、图标与清单是否匹配（含 maskable 安全区、透明主题图标）、Service Worker 的预缓存与离线回退、`deepseek-mobile.html` 中内联脚本能否正常解析，以及**提交的 APK 是否完整、是否内嵌了最新的单文件版**。`npm run build:standalone` 在写出单文件版前会校验内联脚本没有被替换模式（`$&`、`` $` `` 等）篡改，损坏时会直接报错而不是生成打不开的文件。

改了 `deepseek-mobile.html` 之后要记得重新打包 APK（`npm run build:apk`），否则 `npm test` 里的 APK 同步检查会失败。

如果要让服务端默认提供 DeepSeek，把 `.env.example` 复制为 `.env`，在其中填入 `DEEPSEEK_API_KEY`。在没有服务端密钥时，用户仍可在浏览器设置里输入自己的平台密钥。开发地址通常为 `http://localhost:5173`。

## 部署

项目含 Vercel 配置，也可使用 `npm run build && npm start` 运行。服务端环境变量 `DEEPSEEK_API_KEY` 只用于没有自带密钥的 DeepSeek 请求；用户在网页设置里添加的密钥直接从浏览器发往所选平台，不会写入仓库或服务端日志。
