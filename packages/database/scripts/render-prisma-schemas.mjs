import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const outputDirectory = fileURLToPath(new URL('../prisma/.generated/', import.meta.url))
const canonicalSchema = await readFile(new URL('../prisma/schema.prisma', import.meta.url), 'utf8')

await mkdir(outputDirectory, { recursive: true })

for (const provider of ['sqlite', 'postgresql']) {
  const output = `../../generated/${provider}`
  const rendered = canonicalSchema
    .replace(/output\s*=\s*"[^"]+"/, `output              = "${output}"`)
    .replace(/(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*)"[^"]+"/, `$1"${provider}"`)

  if (rendered === canonicalSchema || !rendered.includes(`provider = "${provider}"`)) {
    throw new Error(`Could not render the ${provider} Prisma schema.`)
  }

  await writeFile(`${outputDirectory}schema.${provider}.prisma`, rendered)
}
