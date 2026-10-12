import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import zlib from 'node:zlib'

// The APK is committed so people can install it straight from the repository,
// which means it must stay in sync with the bundled single-file app.
const apk = await readFile(new URL('../apk/loopoint-ai-1.0.0.apk', import.meta.url))
const standalone = await readFile(new URL('../deepseek-mobile.html', import.meta.url))
const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')

function readZipEntries(buffer) {
  let eocd = -1
  const earliest = Math.max(0, buffer.length - 22 - 0xffff)
  for (let index = buffer.length - 22; index >= earliest; index--) {
    if (buffer.readUInt32LE(index) === 0x06054b50) { eocd = index; break }
  }
  if (eocd < 0) throw new Error('not a ZIP archive')
  const count = buffer.readUInt16LE(eocd + 10)
  let offset = buffer.readUInt32LE(eocd + 16)
  const entries = new Map()
  for (let index = 0; index < count; index++) {
    const method = buffer.readUInt16LE(offset + 10)
    const compressedSize = buffer.readUInt32LE(offset + 20)
    const nameLength = buffer.readUInt16LE(offset + 28)
    const extraLength = buffer.readUInt16LE(offset + 30)
    const commentLength = buffer.readUInt16LE(offset + 32)
    const localOffset = buffer.readUInt32LE(offset + 42)
    const name = buffer.subarray(offset + 46, offset + 46 + nameLength).toString('utf8')
    entries.set(name, { method, compressedSize, localOffset })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

function readZipEntry(buffer, entry) {
  const nameLength = buffer.readUInt16LE(entry.localOffset + 26)
  const extraLength = buffer.readUInt16LE(entry.localOffset + 28)
  const start = entry.localOffset + 30 + nameLength + extraLength
  const data = buffer.subarray(start, start + entry.compressedSize)
  return entry.method === 0 ? data : zlib.inflateRawSync(data)
}

const entries = readZipEntries(apk)

test('the APK contains a manifest, code, resources and the bundled app', () => {
  for (const name of ['AndroidManifest.xml', 'classes.dex', 'resources.arsc', 'assets/deepseek-mobile.html']) {
    assert.ok(entries.has(name), `APK is missing ${name}`)
  }
  assert.ok(apk.subarray(0, 2).toString() === 'PK', 'APK must be a ZIP archive')
})

test('the APK bundles the current standalone app, byte for byte', () => {
  const bundled = readZipEntry(apk, entries.get('assets/deepseek-mobile.html'))
  assert.equal(bundled.length, standalone.length, 'the APK is stale: rebuild it with npm run build:apk')
  assert.ok(bundled.equals(standalone), 'the APK embeds a different deepseek-mobile.html than the one committed')
})

test('the APK is signed and declares the app identity', () => {
  assert.ok(apk.includes(Buffer.from('APK Sig Block 42')), 'APK Signature Scheme v2/v3 block not found')
  const utf8 = apk.includes(Buffer.from('环点AI', 'utf8'))
  const utf16 = apk.includes(Buffer.from('环点AI', 'utf16le'))
  assert.ok(utf8 || utf16, 'resources must carry the 环点AI label')
  assert.match(manifest, /android:label="@string\/app_name"/)
  assert.match(manifest, /<string name="app_name">环点AI<\/string>|app_name/)
  assert.match(manifest, /android.permission.INTERNET/)
  assert.match(manifest, /package="com\.looppoint\.ai"/)
})

test('the launcher ships adaptive icons for every density', async () => {
  for (const density of ['mdpi', 'hdpi', 'xhdpi', 'xxhdpi', 'xxxhdpi']) {
    const launcher = await readFile(new URL(`../android/app/src/main/res/mipmap-${density}/ic_launcher.png`, import.meta.url))
    assert.equal(launcher.subarray(1, 4).toString(), 'PNG', `mipmap-${density} launcher icon must be a PNG`)
  }
  const adaptive = await readFile(new URL('../android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml', import.meta.url), 'utf8')
  assert.match(adaptive, /<background android:drawable="@color\/ic_launcher_background"/)
  assert.match(adaptive, /<foreground android:drawable="@mipmap\/ic_launcher_foreground"/)
})
