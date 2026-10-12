import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import zlib from 'node:zlib'
import vm from 'node:vm'

const root = new URL('../', import.meta.url)
const read = (path) => readFile(new URL(path, root), 'utf8')
const readBuffer = (path) => readFile(new URL(path, root))

// Minimal 8-bit non-interlaced PNG reader, so the tests can prove what the
// launcher will actually see (full-bleed maskable icons, transparent glyphs).
function decodePng(buffer) {
  assert.equal(buffer.subarray(0, 4).toString('latin1'), '\x89PNG', 'not a PNG')
  const width = buffer.readUInt32BE(16)
  const height = buffer.readUInt32BE(20)
  const [depth, colorType, , , interlace] = [buffer[24], buffer[25], buffer[26], buffer[27], buffer[28]]
  assert.equal(depth, 8, 'expected an 8-bit PNG')
  assert.equal(interlace, 0, 'expected a non-interlaced PNG')
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType]
  assert.ok(channels, `unsupported colour type ${colorType}`)

  const chunks = []
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('latin1')
    if (type === 'IDAT') chunks.push(buffer.subarray(offset + 8, offset + 8 + length))
    offset += 12 + length
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks))
  const stride = width * channels
  const pixels = Buffer.alloc(height * stride)
  const paeth = (left, up, upLeft) => {
    const p = left + up - upLeft
    const pa = Math.abs(p - left)
    const pb = Math.abs(p - up)
    const pc = Math.abs(p - upLeft)
    return pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft
  }
  let position = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[position++]
    const line = raw.subarray(position, position + stride)
    position += stride
    const out = pixels.subarray(y * stride, (y + 1) * stride)
    const previous = y ? pixels.subarray((y - 1) * stride, y * stride) : null
    for (let x = 0; x < stride; x++) {
      const left = x >= channels ? out[x - channels] : 0
      const up = previous ? previous[x] : 0
      const upLeft = previous && x >= channels ? previous[x - channels] : 0
      let value = line[x]
      if (filter === 1) value += left
      else if (filter === 2) value += up
      else if (filter === 3) value += (left + up) >> 1
      else if (filter === 4) value += paeth(left, up, upLeft)
      out[x] = value & 0xff
    }
  }
  return {
    width,
    height,
    channels,
    pixel(x, y) {
      const index = (y * width + x) * channels
      return {
        r: pixels[index],
        g: pixels[index + 1],
        b: pixels[index + 2],
        a: channels === 4 ? pixels[index + 3] : 255,
      }
    },
  }
}

const BRAND_BACKGROUND = { r: 0x16, g: 0x44, b: 0x38 }

test('manifest describes an installable standalone phone app', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'))
  assert.equal(manifest.name, '环点 AI')
  assert.equal(manifest.short_name, '环点AI')
  assert.ok(manifest.short_name.length <= 12, 'short_name must not be truncated under the icon')
  assert.equal(manifest.lang, 'zh-CN')
  assert.equal(manifest.start_url, './')
  assert.equal(manifest.scope, './')
  assert.equal(manifest.display, 'standalone')
  assert.equal(manifest.background_color, '#f7f9f7')
  assert.equal(manifest.theme_color, '#ffffff')
})

test('every manifest icon exists and matches its declared size', async () => {
  const manifest = JSON.parse(await read('public/manifest.webmanifest'))
  assert.ok(manifest.icons.length >= 4)
  for (const icon of manifest.icons) {
    const buffer = await readBuffer(`public/${icon.src}`)
    const image = decodePng(buffer)
    assert.equal(`${image.width}x${image.height}`, icon.sizes, `${icon.src} must match its manifest size`)
  }
  const purposes = manifest.icons.flatMap((icon) => icon.purpose.split(' '))
  for (const purpose of ['any', 'maskable', 'monochrome']) {
    assert.ok(purposes.includes(purpose), `manifest needs a ${purpose} icon`)
  }
  assert.ok(manifest.icons.some((icon) => icon.sizes === '512x512' && icon.purpose.includes('any')), 'Chrome requires a 512px any icon')
})

test('maskable and iOS icons are full-bleed and use the brand background', async () => {
  for (const path of ['public/icons/maskable-512.png', 'public/apple-touch-icon.png', 'public/icons/icon-512.png']) {
    const image = decodePng(await readBuffer(path))
    const last = image.width - 1
    const corners = [image.pixel(0, 0), image.pixel(last, 0), image.pixel(0, last), image.pixel(last, last)]
    if (path.includes('maskable') || path.includes('apple-touch')) {
      for (const corner of corners) {
        assert.equal(corner.a, 255, `${path} must not have transparent corners`)
        assert.deepEqual({ r: corner.r, g: corner.g, b: corner.b }, BRAND_BACKGROUND, `${path} corner must be the brand background`)
      }
    } else {
      // The rounded "any" icon keeps the favicon's rounded corners.
      assert.ok(corners[0].a < 255, `${path} corner should be rounded`)
    }
  }
})

test('the themed icon is a transparent monochrome glyph', async () => {
  const image = decodePng(await readBuffer('public/icons/monochrome-512.png'))
  assert.equal(image.pixel(2, 2).a, 0, 'themed icons need a transparent background')
  const centre = image.pixel(256, 256)
  assert.equal(centre.a, 0, 'the ring centre stays transparent')
  const ring = image.pixel(256, 130)
  assert.deepEqual({ r: ring.r, g: ring.g, b: ring.b }, { r: 255, g: 255, b: 255 }, 'the glyph is drawn in white')
})

test('index.html links the manifest and iOS home-screen metadata', async () => {
  const html = await read('index.html')
  assert.match(html, /<link rel="manifest" href="\/manifest\.webmanifest"/)
  assert.match(html, /<link rel="apple-touch-icon" href="\/apple-touch-icon\.png"/)
  assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes"/)
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="环点AI"/)
  assert.match(html, /<meta name="theme-color" content="#ffffff"/)
  assert.match(html, /viewport-fit=cover/)
})

test('service worker precaches the shell and handles fetch', async () => {
  const worker = await read('public/sw.js')
  assert.match(worker, /addEventListener\('install'/)
  assert.match(worker, /addEventListener\('activate'/)
  assert.match(worker, /addEventListener\('fetch'/)
  assert.match(worker, /request\.mode === 'navigate'/)
  assert.ok(worker.includes('./index.html'), 'the shell must be precached for offline use')
  assert.ok(worker.includes('./manifest.webmanifest'), 'the manifest must be available offline')
})

test('every precached shell path exists in public/', async () => {
  const worker = await read('public/sw.js')
  const shell = JSON.parse(/const SHELL = (\[[^\]]+\])/.exec(worker)[1].replaceAll("'", '"'))
  assert.ok(shell.length >= 4)
  for (const entry of shell) {
    // './' and './index.html' are the built page: Vite emits it from the root index.html.
    const relative = entry.replace(/^\.\//, '')
    const path = relative === '' || relative === 'index.html' ? 'index.html' : `public/${relative}`
    const buffer = await readBuffer(path)
    assert.ok(buffer.length > 0, `${entry} must exist so the worker can precache it`)
  }
})

// Runs public/sw.js inside a stub worker scope, so precaching and offline
// behaviour are executed for real instead of only being grepped.
const workerSource = await read('public/sw.js')
const fakeResponse = (body) => ({ ok: true, type: 'basic', body, clone: () => fakeResponse(body) })

function runServiceWorker() {
  const listeners = {}
  const stores = new Map()
  const requested = []
  let offline = false
  const key = (value) => (typeof value === 'string' ? value : value.url)
  const fetchImpl = async (url) => {
    requested.push(key(url))
    if (offline) throw new TypeError('offline')
    return fakeResponse(`network:${key(url)}`)
  }
  const cacheNamed = (name) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const entries = stores.get(name)
    return {
      async addAll(urls) { for (const url of urls) entries.set(url, await fetchImpl(url)) },
      async put(request, value) { entries.set(key(request), value) },
      async match(request) { return entries.get(key(request)) },
    }
  }
  const caches = {
    open: async (name) => cacheNamed(name),
    match: async (request) => {
      for (const entries of stores.values()) if (entries.has(key(request))) return entries.get(key(request))
      return undefined
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  }
  const self = {
    location: { origin: 'http://localhost' },
    addEventListener: (type, handler) => { listeners[type] = handler },
    skipWaiting: async () => {},
    clients: { claim: async () => {} },
  }
  new vm.Script(workerSource, { filename: 'sw.js' }).runInContext(vm.createContext({ self, caches, fetch: fetchImpl, URL, console, Promise }))
  return {
    stores,
    requested,
    setOffline: (value) => { offline = value },
    dispatch(type) {
      const promises = []
      listeners[type]({ waitUntil: (promise) => promises.push(promise) })
      return Promise.all(promises)
    },
    request(url, mode) {
      let captured
      listeners.fetch({ request: { method: 'GET', mode, url }, respondWith: (promise) => { captured = promise } })
      return captured
    },
  }
}

test('service worker precaches the shell on install', async () => {
  const worker = runServiceWorker()
  await worker.dispatch('install')
  const shell = worker.stores.get('looppoint-shell-v1')
  assert.ok(shell.has('./index.html'), 'install must precache the shell')
  assert.ok(shell.has('./manifest.webmanifest'), 'install must precache the manifest')
  assert.ok(worker.requested.includes('./icons/icon-192.png'), 'install must precache an install-sized icon')
})

test('service worker refreshes navigations and falls back to the cached shell', async () => {
  const worker = runServiceWorker()
  await worker.dispatch('install')
  const shell = worker.stores.get('looppoint-shell-v1')

  const online = worker.request('http://localhost/', 'navigate')
  assert.match((await online).body, /^network:/, 'online navigations are served from the network')
  assert.match(shell.get('./index.html').body, /^network:/, 'the fresh page replaces the cached shell')

  shell.set('./index.html', fakeResponse('cached-shell'))
  worker.setOffline(true)
  assert.equal((await worker.request('http://localhost/', 'navigate')).body, 'cached-shell', 'offline navigations use the cached shell')

  // Hashed assets are cached on first use, then served without the network.
  worker.setOffline(false)
  assert.match((await worker.request('http://localhost/assets/app.js', 'no-cors')).body, /^network:/)
  worker.setOffline(true)
  assert.equal((await worker.request('http://localhost/assets/app.js', 'no-cors')).body, 'network:http://localhost/assets/app.js')

  // API traffic is never intercepted.
  assert.equal(worker.request('http://localhost/api/chat', 'cors'), undefined)
})

test('service worker activate drops stale caches', async () => {
  const worker = runServiceWorker()
  await worker.dispatch('install')
  worker.stores.set('looppoint-shell-v0', new Map())
  await worker.dispatch('activate')
  assert.ok(worker.stores.has('looppoint-shell-v1'), 'the current cache must survive')
  assert.equal(worker.stores.has('looppoint-shell-v0'), false, 'old caches must be removed')
})
