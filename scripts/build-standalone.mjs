import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const htmlPath = path.join(root, 'dist', 'index.html')
let html = await readFile(htmlPath, 'utf8')
const cssPath = html.match(/<link[^>]+href="(\/assets\/[^"]+\.css)"[^>]*>/)?.[1]
const jsPath = html.match(/<script[^>]+src="(\/assets\/[^"]+\.js)"[^>]*><\/script>/)?.[1]
if (!cssPath || !jsPath) throw new Error('Vite output is missing CSS or JavaScript assets.')

const css = await readFile(path.join(root, 'dist', cssPath.slice(1)), 'utf8')
const js = await readFile(path.join(root, 'dist', jsPath.slice(1)), 'utf8')
html = html.replace(/<link[^>]+rel="icon"[^>]*>/, '')
html = html.replace(/<link[^>]+href="\/assets\/[^"]+\.css"[^>]*>/, `<style>${css}</style>`)
html = html.replace(/<script[^>]+src="\/assets\/[^"]+\.js"[^>]*><\/script>/, '')
html = html.replace('</body>', `<script>window.LOOPPOINT_STANDALONE=true;</script><script>${js.replaceAll('</script', '<\\/script')}</script></body>`)
await writeFile(path.join(root, 'deepseek-mobile.html'), html)
console.log('Built deepseek-mobile.html')
