// eval/stub/register.ts
// Runtime module-resolution hook: rewrites require("vscode") to our stub.
// Must run BEFORE the module graph loads. The TS `paths` mapping only applies
// at type-resolution time; emitted JS still does require("vscode") which Node
// cannot resolve. This hook fixes that at runtime.
const Module = require("module")
const path = require("path")

const origResolve = Module._resolveFilename
Module._resolveFilename = function (request: string, parent: any, ...rest: any[]) {
  if (request === "vscode") {
    return path.resolve(__dirname, "vscode.js")
  }
  return origResolve.call(this, request, parent, ...rest)
}
