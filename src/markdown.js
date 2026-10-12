// Minimal, dependency-free Markdown renderer for chat replies.
// Everything is escaped before any markup is added, so model output can be
// rendered with innerHTML without creating an injection point.

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }
const SAFE_LINK = /^(?:https?:\/\/|mailto:)[^\s]*$/i
const FENCE_OPEN = /^\s*(```+|~~~+)\s*([\w+#.-]*)\s*$/
const FENCE_CLOSE = (marker) => new RegExp(`^\\s*${marker}{3,}\\s*$`)
const HEADING = /^(#{1,6})\s+(.*)$/
const RULE = /^\s*(?:-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*>/
const BULLET = /^\s*[-*+]\s+/
const NUMBERED = /^\s*\d+[.)]\s+/
const BLOCK_START = /^(?:```|~~~|>|#{1,6}\s|[-*+]\s|\d+[.)]\s)/

export function escapeHtml(text) {
  return String(text ?? '').replace(/[&<>"']/g, (char) => ESCAPES[char])
}

function inline(text) {
  const codes = []
  let out = escapeHtml(text).replace(/`([^`\n]+)`/g, (_match, code) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })
  out = out.replace(/\[([^\]\n]+)\]\(([^)\s]+)\)/g, (_match, label, url) =>
    SAFE_LINK.test(url)
      ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`
      : label)
  out = out.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>')
  out = out.replace(/__([^\n]+?)__/g, '<strong>$1</strong>')
  out = out.replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
  out = out.replace(/~~([^\n]+?)~~/g, '<del>$1</del>')
  return out.replace(/\u0000(\d+)\u0000/g, (_match, index) => `<code>${codes[Number(index)]}</code>`)
}

function codeBlock(code, language) {
  const label = language ? `<span class="code-lang">${escapeHtml(language)}</span>` : '<span class="code-lang"></span>'
  return `<div class="code-block"><div class="code-head">${label}<button class="code-copy" type="button">复制</button></div>`
    + `<pre><code>${escapeHtml(code)}</code></pre></div>`
}

export function renderMarkdown(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n')
  const blocks = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (FENCE_OPEN.test(line)) {
      const marker = line.match(FENCE_OPEN)[1][0]
      const language = line.match(FENCE_OPEN)[2]
      const body = []
      index++
      while (index < lines.length && !FENCE_CLOSE(marker).test(lines[index])) body.push(lines[index++])
      if (index < lines.length) index++
      blocks.push(codeBlock(body.join('\n'), language))
      continue
    }
    if (!line.trim()) { index++; continue }

    const heading = line.match(HEADING)
    if (heading) {
      const level = heading[1].length
      blocks.push(`<h${level}>${inline(heading[2].trim())}</h${level}>`)
      index++
      continue
    }
    if (RULE.test(line)) { blocks.push('<hr>'); index++; continue }

    if (QUOTE.test(line)) {
      const quoted = []
      while (index < lines.length && QUOTE.test(lines[index])) quoted.push(lines[index++].replace(/^\s*>\s?/, ''))
      blocks.push(`<blockquote>${quoted.map(inline).join('<br>')}</blockquote>`)
      continue
    }

    const ordered = NUMBERED.test(line)
    if (ordered || BULLET.test(line)) {
      const item = ordered ? NUMBERED : BULLET
      const items = []
      while (index < lines.length && item.test(lines[index])) items.push(inline(lines[index++].replace(item, '')))
      blocks.push(`<${ordered ? 'ol' : 'ul'}>${items.map((entry) => `<li>${entry}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`)
      continue
    }

    const paragraph = []
    while (index < lines.length && lines[index].trim() && !BLOCK_START.test(lines[index]) && !RULE.test(lines[index])) {
      paragraph.push(lines[index++])
    }
    if (paragraph.length) blocks.push(`<p>${paragraph.map(inline).join('<br>')}</p>`)
    else index++
  }
  return blocks.join('')
}
