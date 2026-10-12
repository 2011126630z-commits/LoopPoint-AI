import { readFile, writeFile } from 'node:fs/promises'
import vm from 'node:vm'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(root, 'dist', 'index.html')
// Vite inherits the checkout's line endings (and can leave stray CRs behind
// when it drops the script tag), so normalise everything to LF: the committed
// standalone file must be byte-identical on Windows and CI.
const readLf = async (file) => (await readFile(file, 'utf8')).replace(/\r\n?/g, '\n')
let html = await readLf(htmlPath)
const cssPath = html.match(/<link[^>]+href="(\/assets\/[^"]+\.css)"[^>]*>/)?.[1]
const jsPath = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"[^>]*><\/script>/)?.[1]
if (!cssPath || !jsPath) throw new Error('Vite output is missing CSS or JavaScript assets.')

const css = await readLf(path.join(root, 'dist', cssPath.slice(1)))
const js = await readLf(path.join(root, 'dist', jsPath.slice(1)))
const inlinedJs = js.replaceAll('</script', '<\\/script')

// The single file has no sibling manifest or icon files, so inline them. The
// manifest itself is built at runtime from a Blob URL: a data: manifest would
// resolve start_url/scope against the data: URL and fail the install checks.
const dataUri = (mime, buffer) => `data:${mime};base64,${buffer.toString('base64')}`
const iconUri = dataUri('image/png', await readFile(path.join(root, 'dist', 'icons', 'maskable-192.png')))
const appleUri = dataUri('image/png', await readFile(path.join(root, 'dist', 'apple-touch-icon.png')))
const faviconUri = dataUri('image/svg+xml', Buffer.from(await readLf(path.join(root, 'dist', 'favicon.svg')), 'utf8'))
const inlineManifest = `<script>
(function () {
  if (!/^https?:$/.test(location.protocol)) return;
  var manifest = ${JSON.stringify({
    name: '环点 AI',
    short_name: '环点AI',
    description: '多模型 AI 聊天，聊天记录只保存在本机。',
    lang: 'zh-CN',
    start_url: './',
    scope: './',
    display: 'standalone',
    background_color: '#f7f9f7',
    theme_color: '#ffffff',
  })};
  manifest.icons = [{ src: ${JSON.stringify(iconUri)}, sizes: '192x192', type: 'image/png', purpose: 'any maskable' }];
  var link = document.createElement('link');
  link.rel = 'manifest';
  link.href = URL.createObjectURL(new Blob([JSON.stringify(manifest)], { type: 'application/manifest+json' }));
  document.head.appendChild(link);
})();
</script>`

// Replacement functions keep `$&`, `$'` and `` $` `` inside the bundle from
// being expanded as replacement patterns, which would corrupt the output.
html = html.replace(/<link[^>]+rel="(?:icon|apple-touch-icon|manifest)"[^>]*>\s*/g, () => '')
html = html.replace('</head>', () => `<link rel="icon" href="${faviconUri}"><link rel="apple-touch-icon" href="${appleUri}"></head>`)
html = html.replace(/<link[^>]+href="\/assets\/[^"]+\.css"[^>]*>/, () => `<style>${css}</style>`)
html = html.replace(/<script[^>]+src="\/assets\/[^"]+\.js"[^>]*><\/script>/, () => '')
html = html.replace('</body>', () => `${inlineManifest}<script>window.LOOPPOINT_STANDALONE=true;</script><script>${inlinedJs}</script></body>`)

const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])
if (scripts.at(-1) !== inlinedJs) throw new Error('The inlined bundle was altered while building the standalone file.')
new vm.Script(inlinedJs, { filename: 'standalone-bundle.js' })

await writeFile(path.join(root, 'deepseek-mobile.html'), html)
console.log(`Built deepseek-mobile.html (${inlinedJs.length} chars of inline JavaScript)`)
