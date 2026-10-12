import test from 'node:test'
import assert from 'node:assert/strict'
import { escapeHtml, renderMarkdown } from '../src/markdown.js'

test('markdown escapes model output before adding markup', () => {
  const html = renderMarkdown('<img src=x onerror="alert(1)"> **要加粗**')
  assert.ok(!html.includes('<img'))
  assert.match(html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt;/)
  assert.match(html, /<strong>要加粗<\/strong>/)
  assert.equal(escapeHtml(`a & b < c > "d" 'e'`), 'a &amp; b &lt; c &gt; &quot;d&quot; &#39;e&#39;')
})

test('markdown renders a fenced code block with language and copy control', () => {
  const html = renderMarkdown('说明：\n\n```js\nconst a = 1 < 2\n```\n\n完成')
  assert.match(html, /<div class="code-block">/)
  assert.match(html, /<span class="code-lang">js<\/span>/)
  assert.match(html, /<button class="code-copy" type="button">复制<\/button>/)
  assert.match(html, /const a = 1 &lt; 2/)
  assert.ok(!html.includes('```'))
})

test('markdown handles headings, lists, quotes, rules and inline styles', () => {
  const html = renderMarkdown([
    '# 标题',
    '',
    '- 一',
    '- 二',
    '',
    '1. 第一',
    '2. 第二',
    '',
    '> 引用',
    '',
    '---',
    '',
    '`code` 与 *斜体* 与 ~~删除~~',
  ].join('\n'))
  assert.match(html, /<h1>标题<\/h1>/)
  assert.match(html, /<ul><li>一<\/li><li>二<\/li><\/ul>/)
  assert.match(html, /<ol><li>第一<\/li><li>第二<\/li><\/ol>/)
  assert.match(html, /<blockquote>引用<\/blockquote>/)
  assert.match(html, /<hr>/)
  assert.match(html, /<code>code<\/code>/)
  assert.match(html, /<em>斜体<\/em>/)
  assert.match(html, /<del>删除<\/del>/)
})

test('markdown only links http, https and mailto targets', () => {
  const safe = renderMarkdown('[文档](https://example.com/a?b=1)')
  assert.match(safe, /<a href="https:\/\/example\.com\/a\?b=1" target="_blank" rel="noopener noreferrer">文档<\/a>/)
  const unsafe = renderMarkdown('[点我](javascript:alert(1))')
  assert.ok(!unsafe.includes('<a '))
  assert.match(unsafe, /点我/)
})

test('markdown keeps plain text readable and code spans inert', () => {
  assert.equal(renderMarkdown('一行\n两行'), '<p>一行<br>两行</p>')
  const html = renderMarkdown('`**not bold**` 正常 **加粗**')
  assert.match(html, /<code>\*\*not bold\*\*<\/code>/)
  assert.match(html, /<strong>加粗<\/strong>/)
  assert.equal(renderMarkdown(''), '')
})
