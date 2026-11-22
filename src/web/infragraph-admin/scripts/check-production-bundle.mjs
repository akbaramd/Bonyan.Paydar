import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../dist')
const assetDir = resolve(root, 'assets')
const assets = readdirSync(assetDir)
const invalid = assets.filter((name) => /TableLabPage|DesignSystemPage|\.map$/i.test(name))
if (invalid.length) throw new Error('Development-only assets in production: ' + invalid.join(', '))
const js = assets.filter((name) => name.endsWith('.js')).map((name) => readFileSync(resolve(assetDir, name), 'utf8')).join('\n')
// The unique lab-only synthetic dataset identifier must not ship to a customer release.
if (js.includes('demo-asset-') || js.includes('FW-01') || js.includes('CORE-SW-01')) throw new Error('Synthetic topology or inventory data leaked into production')
if (!readFileSync(resolve(root, 'index.html'), 'utf8').includes('<html')) {
  throw new Error('React HTML entry missing from bundle')
}
console.info('Production bundle isolation: PASS (no developer labs or synthetic dataset)')