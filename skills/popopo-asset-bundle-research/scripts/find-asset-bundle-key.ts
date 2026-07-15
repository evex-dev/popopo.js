#!/usr/bin/env bun

import { createCipheriv } from 'node:crypto'
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'

const unityMagic = Buffer.from('UnityFS\0', 'ascii')
const fieldRvaPattern = /Field RVA Decoded \(hex blob\): \[([0-9A-Fa-f ]+)\]/g

type Arguments = {
  cpp2ilOutput: string
  sample: string
  output: string
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2))
  const files = await listCsFiles(args.cpp2ilOutput)
  const candidates = new Map<string, Buffer>()

  for (const file of files) {
    const source = await readFile(file, 'utf8')

    for (const match of source.matchAll(fieldRvaPattern)) {
      const bytes = Buffer.from(
        match[1]!.trim().split(/\s+/).map((value) => Number.parseInt(value, 16)),
      )
      const key =
        bytes.length === 32
          ? bytes
          : bytes.length === 33 && bytes[32] === 0
            ? bytes.subarray(0, 32)
            : undefined

      if (key) candidates.set(key.toString('hex'), Buffer.from(key))
    }
  }

  const sample = (await readFile(args.sample)).subarray(0, 4096)
  const matches = [...candidates.values()].filter((key) => validatesUnityHeader(sample, key))

  if (matches.length !== 1) {
    throw new Error(`Expected exactly one verified 32-byte key candidate; found ${matches.length}.`)
  }

  await mkdir(dirname(args.output), { recursive: true })
  await writeFile(args.output, matches[0]!, { mode: 0o600 })
  await chmod(args.output, 0o600).catch(() => undefined)
  console.log(`Verified one key candidate and wrote 32 bytes to ${args.output}.`)
}

function parseArguments(argv: string[]): Arguments {
  const values = new Map<string, string>()

  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index]
    const value = argv[index + 1]

    if (!name?.startsWith('--') || !value) {
      throw new Error(
        'Usage: find-asset-bundle-key.ts --cpp2il-output <dir> --sample <bundle> --output <key-file>',
      )
    }

    values.set(name.slice(2), value)
  }

  const cpp2ilOutput = values.get('cpp2il-output')
  const sample = values.get('sample')
  const output = values.get('output')

  if (!cpp2ilOutput || !sample || !output) {
    throw new Error(
      'Usage: find-asset-bundle-key.ts --cpp2il-output <dir> --sample <bundle> --output <key-file>',
    )
  }

  return {
    cpp2ilOutput: resolve(cpp2ilOutput),
    sample: resolve(sample),
    output: resolve(output),
  }
}

async function listCsFiles(root: string): Promise<string[]> {
  const files: string[] = []

  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = resolve(root, entry.name)
    if (entry.isDirectory()) files.push(...(await listCsFiles(path)))
    else if (entry.isFile() && entry.name.endsWith('.cs')) files.push(path)
  }

  return files
}

function validatesUnityHeader(encrypted: Buffer, key: Buffer): boolean {
  try {
    const decoded = transform(encrypted, key)
    if (!decoded.subarray(0, unityMagic.length).equals(unityMagic)) return false

    let offset = unityMagic.length + 4
    offset = decoded.indexOf(0, offset) + 1
    if (offset <= 0) return false
    offset = decoded.indexOf(0, offset) + 1
    if (offset <= 0 || offset + 8 > decoded.length) return false

    return decoded.readBigUInt64BE(offset) > 0n
  } catch {
    return false
  }
}

function transform(input: Buffer, key: Buffer): Buffer {
  const paddedLength = Math.ceil(input.length / 16) * 16
  const counters = Buffer.alloc(paddedLength)

  for (let offset = 0, block = 1n; offset < paddedLength; offset += 16, block += 1n) {
    counters.writeBigUInt64BE(block, offset)
  }

  const aes = createCipheriv('aes-256-ecb', key, null)
  aes.setAutoPadding(false)
  const stream = Buffer.concat([aes.update(counters), aes.final()])
  const output = Buffer.alloc(input.length)

  for (let index = 0; index < input.length; index += 1) {
    output[index] = input[index]! ^ stream[index]!
  }

  return output
}

await main()
