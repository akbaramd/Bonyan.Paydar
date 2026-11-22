import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const source = JSON.parse(readFileSync(resolve(root, 'design-tokens/tokens.json'), 'utf8'))
const lines = [
  '/* Generated from design-tokens/tokens.json. Edit JSON, then npm run tokens:build. */',
  ':root {',
  '  color-scheme: dark;',
  '  --ig-font-ui: "Vazirmatn Variable", Tahoma, "Segoe UI", Arial, sans-serif;',
  '  --ig-font-mono: Consolas, "Cascadia Code", monospace;',
]
for (const [kind, entries] of Object.entries(source.core)) {
  for (const [key, value] of Object.entries(entries)) {
    lines.push(`  --ig-${kind.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}: ${value}px;`)
  }
}
lines.push('}')
for (const [name, palette] of Object.entries(source.themes)) {
  lines.push(`[data-theme="${name}"] {`)
  lines.push(`  color-scheme: ${name};`)
  for (const [key, value] of Object.entries(palette)) {
    lines.push(`  --ig-${key.replace(/[A-Z]/g, c => '-' + c.toLowerCase())}: ${value};`)
  }
  lines.push('}')
}
const css = lines.join('\n') + '\n'
const ts = '// Generated from design-tokens/tokens.json.\n' +
  'export const themes = ' + JSON.stringify(source.themes, null, 2) + ' as const;\n' +
  'export const coreTokens = ' + JSON.stringify(source.core, null, 2) + ' as const;\n'
const outputs = [
  [resolve(root, 'src/shared/styles/tokens.css'), css],
  [resolve(root, 'src/shared/styles/tokens.generated.ts'), ts],
]
if (process.argv.includes('--check')) {
  for (const [path, expected] of outputs) {
    if (readFileSync(path, 'utf8') !== expected) {
      throw new Error(`Generated tokens are out of date: ${path}`)
    }
  }
  console.info('Design tokens are in sync.')
} else {
  for (const [path, output] of outputs) writeFileSync(path, output)
  console.info('Generated CSS + TypeScript design tokens.')
}