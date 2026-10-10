import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(process.cwd())
const banned = ['evidence', 'receipt', 'deterministic', 'boundary', 'attestation', 'primitive', 'scoped', 'orchestrate', 'agent', 'trustless', 'decentralized', 'leverage', 'seamless', 'robust', 'revolutionize', 'empower', 'cutting-edge', 'contract', 'transaction', 'hash', 'xdr', 'soroban', 'gas']
const read = (file) => readFile(resolve(root, file), 'utf8')
const readme = await read('README.md')
const [beforeUnderHood, underHood = ''] = readme.split(/^## Under the hood\s*$/m)
const errors = []
for (const word of banned) {
  if (new RegExp(`\\b${word.replace('-', '\\-')}\\b`, 'i').test(beforeUnderHood)) errors.push(`README uses banned word: ${word}`)
}
const wordsBefore = beforeUnderHood.trim().split(/\s+/).filter(Boolean).length
const wordsUnder = underHood.trim().split(/\s+/).filter(Boolean).length
if (wordsBefore > 300) errors.push(`README has ${wordsBefore} words before Under the hood (limit 300)`)
if (wordsUnder > 120) errors.push(`Under the hood has ${wordsUnder} words (limit 120)`)

const copy = await read('src/lib/i18n.ts')
const sentenceCandidates = [...copy.matchAll(/'([^'\\]*(?:\\.[^'\\]*)*)'/g)].map((match) => match[1])
for (const sentence of sentenceCandidates) {
  const wordCount = sentence.split(/\s+/).filter(Boolean).length
  if (wordCount > 25) errors.push(`Site text is longer than 25 words: ${sentence}`)
}

if (errors.length) {
  console.error(errors.join('\n'))
  process.exit(1)
}
console.log(`Plain words check passed (${wordsBefore} README words, ${wordsUnder} Under the hood words).`)
