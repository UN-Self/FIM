#!/usr/bin/env node
const path = require("path")

const PROJECT_ROOT = path.resolve(__dirname, "..", "..")
const MODULES_DIR = path.resolve(__dirname, "out")

require("./vscode_intercept.cjs")

function readStdin() {
  return new Promise((resolve, reject) => {
    let data = ""
    process.stdin.setEncoding("utf8")
    process.stdin.on("data", (chunk) => { data += chunk })
    process.stdin.on("end", () => resolve(data))
    process.stdin.on("error", reject)
  })
}

async function main() {
  const input = JSON.parse(await readStdin())
  const { module: moduleName, fn: fnName, args = [], mockFetch = null } = input

  if (mockFetch) {
    const { ReadableStream } = require("stream/web")
    global.fetch = async () => {
      const chunks = mockFetch.chunks.map((c) => `data: ${JSON.stringify(c)}\n`)
      const body = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder()
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk))
          }
          controller.close()
        },
      })
      return {
        ok: true,
        body,
        status: 200,
        text: async () => chunks.join(""),
        json: async () => mockFetch.chunks[0],
      }
    }
  }

  let mod
  const fs = require("fs")
  const helperName = moduleName.replace(/-/g, "_") + "_test_helper.cjs"
  const helperPath = path.resolve(__dirname, helperName)
  const modPath = path.resolve(MODULES_DIR, `${moduleName}.test.js`)

  if (fs.existsSync(helperPath)) {
    mod = require(helperPath)
  } else {
    mod = require(modPath)
  }

  if (!(fnName in mod)) {
    throw new Error(`Function "${fnName}" not found in module "${moduleName}". Available: ${Object.keys(mod).join(", ")}`)
  }

  const result = await mod[fnName](...args)
  process.stdout.write(JSON.stringify({ success: true, result }))
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ success: false, error: err.message, stack: err.stack }))
  process.exit(0)
})
