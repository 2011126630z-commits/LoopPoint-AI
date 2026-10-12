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

// Replacement functions keep `$&`, `$'` and `` $` `` inside the bundle from
// being expanded as replacement patterns, which would corrupt the output.
html = html.replace(/<link[^>]+rel="icon"[^>]*>/, () => '')
html = html.replace(/<link[^>]+href="\/assets\/[^"]+\.css"[^>]*>/, () => `<style>${css}</style>`)
html = html.replace(/<script[^>]+src="\/assets\/[^"]+\.js"[^>]*><\/script>/, () => '')
html = html.replace('</body>', () => `<script>window.LOOPPOINT_STANDALONE=true;</script><script>${inlinedJs}</script></body>`)

const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])
if (scripts.at(-1) !== inlinedJs) throw new Error('The inlined bundle was altered while building the standalone file.')
new vm.Script(inlinedJs, { filename: 'standalone-bundle.js' })

await writeFile(path.join(root, 'deepseek-mobile.html'), html)
console.log(`Built deepseek-mobile.html (${inlinedJs.length} chars of inline JavaScript)`)
