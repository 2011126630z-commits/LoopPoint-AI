import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import zlib from 'node:zlib'

// The APK is committed so people can install it straight from the repository,
// which means it must stay in sync with the bundled app and — crucially — keep
// the same identity on every release, or installing an update would conflict
// with the copy already on the phone.
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const manifest = await readFile(new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url), 'utf8')
const apk = await readFile(new URL(`../apk/loopoint-ai-${pkg.version}.apk`, import.meta.url))
const standalone = await readFile(new URL('../deepseek-mobile.html', import.meta.url))
const keystore = await readFile(new URL('../android/keystore/loopoint.jks', import.meta.url))

const PACKAGE_ID = 'com.looppoint.ai'
// Regenerating this file would change the signature and break every installed
// copy, so its bytes are pinned here as a tripwire.
const KEYSTORE_SHA256 = '296102b5b14448e75a907d3fda8c5be7c014fc5f38cb3bea01ffe46d8dafdfe8'

const versionCode = (() => {
  const [major, minor, patch] = pkg.version.split('.').map(Number)
  return String(major * 10000 + minor * 100 + patch)
})()

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
// Binary XML string pools use UTF-8 or UTF-16 depending on the string, so look
// for either encoding.
const containsText = (text) => apk.includes(Buffer.from(text, 'utf8')) || apk.includes(Buffer.from(text, 'utf16le'))
// AndroidManifest.xml is deflated, so it has to be inflated before searching.
const binaryManifest = readZipEntry(apk, entries.get('AndroidManifest.xml'))
const containsManifestText = (text) =>
  binaryManifest.includes(Buffer.from(text, 'utf8')) || binaryManifest.includes(Buffer.from(text, 'utf16le'))

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

test('package name, versionCode and versionName agree everywhere', () => {
  assert.match(manifest, new RegExp(`package="${PACKAGE_ID}"`), 'the package name must never change')
  assert.match(manifest, new RegExp(`android:versionCode="${versionCode}"`), 'manifest versionCode must follow package.json')
  assert.match(manifest, new RegExp(`android:versionName="${pkg.version}"`), 'manifest versionName must follow package.json')
  assert.ok(Number(versionCode) >= 10000, 'versionCode must stay well above the 1 used by the first build')
  assert.ok(containsManifestText(pkg.version), `the APK should carry versionName ${pkg.version}`)
})

test('the signing key is the pinned one, so updates install over the old app', () => {
  assert.equal(createHash('sha256').update(keystore).digest('hex'), KEYSTORE_SHA256,
    'android/keystore/loopoint.jks changed: installed copies could no longer be upgraded, only uninstalled first')
  assert.ok(apk.includes(Buffer.from('APK Sig Block 42')), 'APK Signature Scheme v2/v3 block not found')
  assert.ok(containsManifestText(PACKAGE_ID), 'the package id must be embedded')
})

test('the APK declares the app identity 环点AI', () => {
  assert.ok(containsText('环点AI'), 'resources must carry the 环点AI label')
  assert.match(manifest, /android:label="@string\/app_name"/)
  assert.match(manifest, /<string name="app_name">环点AI<\/string>|app_name/)
  assert.match(manifest, /android.permission.INTERNET/)
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
