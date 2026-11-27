// StarryHook 实机截图驱动:用法见同目录 SKILL.md。
// import { run } from '<技能目录>/cdp-shot.mjs'; run({ port: 5173, out: '/tmp/shots',
//   seed: 'river:496:206:right', actions: [{shot:'01'}, {hold:{key:'ArrowRight',ms:4800}}, ...] })
import puppeteer from 'puppeteer-core'

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export async function run({ port = 5173, out = '/tmp/starryhook-shots', seed = null, actions = [] } = {}) {
  const fs = await import('node:fs')
  fs.mkdirSync(out, { recursive: true })
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    defaultViewport: { width: 960, height: 540 },
    args: ['--no-sandbox', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'],
  })
  const page = await browser.newPage()
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  if (seed) {
    const [mapId, x, y, facing] = seed.split(':')
    await page.evaluateOnNewDocument((p) => {
      localStorage.setItem('starryhook:player-position', JSON.stringify(p))
    }, { mapId, x: Number(x), y: Number(y), facing })
  }
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle0' })
  for (const step of actions) {
    if (step.shot !== undefined) {
      await page.screenshot({ path: `${out}/${step.shot}.png` })
      console.log('shot:', step.shot)
    } else if (step.hold) {
      await page.keyboard.down(step.hold.key)
      await sleep(step.hold.ms)
      await page.keyboard.up(step.hold.key)
    } else if (step.tap) {
      await page.keyboard.down(step.tap)
      await sleep(80)
      await page.keyboard.up(step.tap)
    } else if (step.click) {
      await page.click(step.click).catch(() => {})
    } else if (step.sleep) {
      await sleep(step.sleep)
    }
  }
  await browser.close()
}

// CLI 直跑:node cdp-shot.mjs --seed "river:496:206:right" --actions '[{"shot":"01"},{"sleep":600}]'
if (import.meta.url === `file://${process.argv[1]}`) {
  const argv = process.argv.slice(2)
  const opt = (name) => {
    const i = argv.indexOf(`--${name}`)
    return i === -1 ? undefined : argv[i + 1]
  }
  const { run } = await import(import.meta.url)
  await run({
    port: Number(opt('port') ?? 5173),
    out: opt('out') ?? '/tmp/starryhook-shots',
    seed: opt('seed') ?? null,
    actions: JSON.parse(opt('actions') ?? '[]'),
  })
}
