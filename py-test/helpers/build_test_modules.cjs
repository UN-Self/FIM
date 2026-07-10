const esbuild = require("esbuild")
const path = require("path")

const PROJECT_ROOT = path.resolve(__dirname, "..", "..")

const MODULES = [
  { name: "fim-templates", entry: "src/extension/fim-templates.ts" },
  { name: "cache", entry: "src/extension/cache.ts" },
  { name: "completion-formatter", entry: "src/extension/completion-formatter.ts" },
  { name: "utils", entry: "src/extension/utils.ts" },
  { name: "completion-provider", entry: "src/extension/providers/completion.ts" },
  { name: "llm", entry: "src/extension/llm.ts" },
]

;(async () => {
  for (const mod of MODULES) {
    await esbuild.build({
      bundle: true,
      entryPoints: [path.resolve(PROJECT_ROOT, mod.entry)],
      external: ["vscode", "web-tree-sitter", "async-lock", "ignore", "fs", "path"],
      format: "cjs",
      outfile: path.resolve(__dirname, "out", `${mod.name}.test.js`),
      platform: "node",
      sourcemap: false,
      logLevel: "warning",
    })
  }
  console.log("Test modules built successfully")
})()
