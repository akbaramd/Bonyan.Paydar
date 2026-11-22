import { readdirSync, readFileSync } from 'node:fs'
import { resolve, dirname, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../src')
const sourceFiles = []

function walk(dir) {
  for (const item of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, item.name)
    if (item.isDirectory()) walk(full)
    else if (/\.(ts|tsx)$/.test(item.name) && !item.name.endsWith('.test.ts') && !item.name.endsWith('.test.tsx')) sourceFiles.push(full)
  }
}
walk(root)

const violations = []
for (const file of sourceFiles) {
  const base = relative(root, file).split(sep)
  const imports = readFileSync(file, 'utf8').matchAll(/\b(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g)
  for (const match of imports) {
    const target = match[1]
    if (!target.startsWith('.')) continue
    const to = relative(root, resolve(dirname(file), target)).split(sep)
    if (base[0] === 'shared' && (to[0] === 'features' || to[0] === 'app')) {
      violations.push(`shared cannot depend on application/features: ${relative(root, file)} -> ${target}`)
    }
    if (base[0] === 'features' && to[0] === 'features' && base[1] !== to[1]) {
      violations.push(`feature private cross import: ${relative(root, file)} -> ${target}`)
    }
  }
}
if (violations.length) throw new Error(violations.join('\n'))
console.info(`Frontend boundaries: PASS (${sourceFiles.length} source files)`)
