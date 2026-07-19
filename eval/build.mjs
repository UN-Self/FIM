// eval/build.mjs
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootModules = path.join(__dirname, "..", "node_modules", "tree-sitter-wasms", "out")
const dest = path.join(__dirname, "out", "tree-sitter-wasms")

if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true })

if (fs.existsSync(rootModules)) {
  for (const file of fs.readdirSync(rootModules)) {
    if (file.endsWith(".wasm")) {
      fs.copyFileSync(path.join(rootModules, file), path.join(dest, file))
    }
  }
  console.log(`copied tree-sitter wasms to ${dest}`)
} else {
  console.warn(`warn: tree-sitter-wasms not found at ${rootModules}`)
}
