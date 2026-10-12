/**
 * Builds the Android APK from the bundled single-file app, without Gradle.
 *
 * aapt2 → resources + assets + manifest, javac → classes, d8 → classes.dex,
 * jar → add the dex to the APK, zipalign → alignment, apksigner → signature.
 * Only the Android SDK build-tools and a JDK are required.
 *
 * Usage: node scripts/build-apk.mjs   (run after `npm run build:standalone`)
 */
import { execFileSync } from 'node:child_process'
import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const root = path.resolve(import.meta.dirname, '..')
const work = path.join(root, 'build', 'apk')
const android = path.join(root, 'android', 'app', 'src', 'main')
const outDir = path.join(root, 'apk')

const APP = {
  versionCode: '1',
  versionName: '1.0.0',
  packageId: 'com.looppoint.ai',
  minSdk: '24',
  targetSdk: '34',
  fileName: 'loopoint-ai-1.0.0.apk',
}
const KEYSTORE = {
  file: path.join(root, 'android', 'keystore', 'loopoint.jks'),
  alias: 'looppoint',
  password: 'looppoint',
}

const listDir = (directory) => {
  try { return readdirSync(directory) } catch { return [] }
}
const isDirectory = (target) => {
  try { return statSync(target).isDirectory() } catch { return false }
}
const exists = (target) => {
  try { statSync(target); return true } catch { return false }
}
const newest = (directory, matches) => {
  const names = listDir(directory).filter(matches).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  if (!names.length) throw new Error(`No matching entries in ${directory}`)
  return names.at(-1)
}

function locateSdk() {
  const candidates = [
    process.env.ANDROID_HOME,
    process.env.ANDROID_SDK_ROOT,
    process.platform === 'win32' ? path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk') : null,
    path.join(os.homedir(), 'Library', 'Android', 'sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'),
  ].filter(Boolean)
  const sdk = candidates.find((candidate) => isDirectory(path.join(candidate, 'build-tools')) && isDirectory(path.join(candidate, 'platforms')))
  if (!sdk) throw new Error('Android SDK not found. Set ANDROID_HOME to an SDK containing build-tools and platforms.')
  return sdk
}

function locateJdk() {
  if (process.env.JAVA_HOME && exists(path.join(process.env.JAVA_HOME, 'bin'))) return process.env.JAVA_HOME
  const probe = execFileSync(process.platform === 'win32' ? 'where' : 'which', ['java'], { encoding: 'utf8' })
  return path.dirname(path.dirname(probe.split(/\r?\n/)[0].trim()))
}

const sdk = locateSdk()
const buildToolsName = process.env.ANDROID_BUILD_TOOLS || newest(path.join(sdk, 'build-tools'), (name) => /^\d/.test(name))
const buildTools = path.join(sdk, 'build-tools', buildToolsName)
const platform = process.env.ANDROID_PLATFORM || newest(path.join(sdk, 'platforms'), (name) => name.startsWith('android-'))
const androidJar = path.join(sdk, 'platforms', platform, 'android.jar')
const javaHome = locateJdk()

const suffix = process.platform === 'win32' ? '.exe' : ''
const exe = (tool) => path.join(buildTools, `${tool}${suffix}`)
const jdk = (tool) => path.join(javaHome, 'bin', `${tool}${suffix}`)
const bat = (tool) => path.join(buildTools, `${tool}${process.platform === 'win32' ? '.bat' : ''}`)

function run(command, args, options = {}) {
  const isBatch = process.platform === 'win32' && /\.(bat|cmd)$/i.test(command)
  const file = isBatch ? process.env.ComSpec || 'cmd.exe' : command
  const finalArgs = isBatch
    ? ['/d', '/s', '/c', [command, ...args].map((value) => (/\s/.test(value) ? `"${value}"` : value)).join(' ')]
    : args
  try {
    const output = execFileSync(file, finalArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options })
    if (output.trim()) console.log(output.trim())
    return output
  } catch (error) {
    const detail = [error.stdout, error.stderr].filter(Boolean).join('\n').trim()
    throw new Error(`${path.basename(command)} failed${detail ? `:\n${detail}` : ''}`)
  }
}

function collectClasses(directory) {
  return listDir(directory).flatMap((entry) => {
    const full = path.join(directory, entry)
    if (entry.endsWith('.class')) return [full]
    return isDirectory(full) ? collectClasses(full) : []
  })
}

async function main() {
  const asset = path.join(root, 'deepseek-mobile.html')
  const launcher = path.join(android, 'res', 'mipmap-xxxhdpi', 'ic_launcher.png')
  for (const [file, hint] of [[asset, 'npm run build:standalone'], [launcher, 'python scripts/build-icons.py']]) {
    if (!exists(file)) throw new Error(`${path.relative(root, file)} is missing. Run: ${hint}`)
  }
  for (const tool of [androidJar, exe('aapt2'), exe('zipalign'), bat('d8'), bat('apksigner'), jdk('javac'), jdk('jar'), jdk('keytool')]) {
    if (!exists(tool)) throw new Error(`Missing build tool: ${tool}`)
  }

  await rm(work, { recursive: true, force: true })
  await mkdir(path.join(work, 'gen'), { recursive: true })
  await mkdir(path.join(work, 'dex'), { recursive: true })
  await mkdir(outDir, { recursive: true })
  await mkdir(path.join(android, 'assets'), { recursive: true })
  await copyFile(asset, path.join(android, 'assets', 'deepseek-mobile.html'))

  console.log(`SDK         ${sdk}`)
  console.log(`build-tools ${buildToolsName}  platform ${platform}  jdk ${javaHome}`)

  run(exe('aapt2'), ['compile', '--dir', path.join(android, 'res'), '-o', path.join(work, 'res.zip')])
  run(exe('aapt2'), [
    'link', '-o', path.join(work, 'base.apk'), '-I', androidJar,
    '--manifest', path.join(android, 'AndroidManifest.xml'),
    '-R', path.join(work, 'res.zip'), '--java', path.join(work, 'gen'),
    '-A', path.join(android, 'assets'), '--auto-add-overlay',
    '--min-sdk-version', APP.minSdk, '--target-sdk-version', APP.targetSdk,
    '--version-code', APP.versionCode, '--version-name', APP.versionName,
  ])

  const packagePath = APP.packageId.split('.')
  const sources = [
    path.join(work, 'gen', ...packagePath, 'R.java'),
    path.join(android, 'java', ...packagePath, 'MainActivity.java'),
  ]
  run(jdk('javac'), ['-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options', '-nowarn',
    '-classpath', androidJar, '-d', path.join(work, 'classes'), ...sources])

  const classes = collectClasses(path.join(work, 'classes'))
  if (!classes.length) throw new Error('javac produced no classes')
  run(bat('d8'), ['--lib', androidJar, '--min-api', APP.minSdk, '--output', path.join(work, 'dex'), ...classes])

  run(jdk('jar'), ['--update', '--file', path.join(work, 'base.apk'), '-C', path.join(work, 'dex'), 'classes.dex'])
  run(exe('zipalign'), ['-f', '-p', '4', path.join(work, 'base.apk'), path.join(work, 'aligned.apk')])

  await mkdir(path.dirname(KEYSTORE.file), { recursive: true })
  if (!exists(KEYSTORE.file)) {
    console.log('Creating the sideload signing key (self-signed, not for Play publishing)')
    run(jdk('keytool'), ['-genkeypair', '-keystore', KEYSTORE.file, '-storetype', 'PKCS12',
      '-alias', KEYSTORE.alias, '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10950',
      '-storepass', KEYSTORE.password, '-keypass', KEYSTORE.password,
      '-dname', 'CN=LoopPoint AI, O=LoopPoint AI, C=CN'])
  }

  const output = path.join(outDir, APP.fileName)
  run(bat('apksigner'), ['sign', '--ks', KEYSTORE.file, '--ks-key-alias', KEYSTORE.alias,
    '--ks-pass', `pass:${KEYSTORE.password}`, '--key-pass', `pass:${KEYSTORE.password}`,
    '--v1-signing-enabled', 'true', '--v2-signing-enabled', 'true', '--v3-signing-enabled', 'true', '--v4-signing-enabled', 'false',
    '--out', output, path.join(work, 'aligned.apk')])
  run(bat('apksigner'), ['verify', '--verbose', '--print-certs', output])

  const badging = run(exe('aapt2'), ['dump', 'badging', output])
  for (const line of badging.split('\n')) {
    if (/^(package|application-label|launchable-activity|sdkVersion|targetSdkVersion|uses-permission)/.test(line)) console.log(`  ${line}`)
  }

  const bytes = await stat(output)
  const digest = createHash('sha256').update(readFileSync(output)).digest('hex')
  console.log(`\nBuilt ${path.relative(root, output)}  ${(bytes.size / 1024 / 1024).toFixed(2)} MB`)
  console.log(`sha256 ${digest}`)
}

await main()
