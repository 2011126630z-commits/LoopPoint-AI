import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

// deepseek-mobile.html is the file users download and open directly, so a
// broken inline bundle there is invisible to the other tests.
const source = await readFile(new URL('../deepseek-mobile.html', import.meta.url), 'utf8')
const scripts = [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1])

test('standalone file ships a parseable inline bundle', () => {
  assert.ok(scripts.length >= 2, 'expected a flag script and the app bundle')
  assert.equal(scripts[0], 'window.LOOPPOINT_STANDALONE=true;')
  for (const [index, body] of scripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(body, { filename: `inline-${index}.js` }), `inline script ${index} must parse`)
  }
})

test('inline bundle is not corrupted by build-time replacement patterns', () => {
  const bundle = scripts.at(-1)
  // `$&`, `$'` and `` $` `` were once expanded by String.replace into the page
  // markup; the inlined script must never contain markup or the doctype.
  assert.ok(!bundle.includes('<!doctype'), 'inline bundle must not contain page markup')
  assert.ok(!bundle.includes('<html'), 'inline bundle must not contain page markup')
  assert.match(bundle, /createIcons/, 'bundle should contain the app entry')
})

test('standalone file keeps assets inline and drops external references', () => {
  assert.ok(source.includes('<style>'), 'CSS should be inlined')
  assert.ok(!/<script[^>]+src=/.test(source), 'no external script tags')
  assert.ok(!/<link[^>]+href="\/assets\//.test(source), 'no external asset links')
  assert.ok(!source.includes('\r'), 'standalone file must use LF endings so CI can compare it byte-for-byte')
})
