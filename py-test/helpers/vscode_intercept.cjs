const path = require("path")
const Module = require("module")

const originalResolve = Module._resolveFilename
const originalLoad = Module._load

Module._resolveFilename = function (request, parent, ...args) {
  if (request === "vscode") {
    return path.resolve(__dirname, "vscode_stub.cjs")
  }
  return originalResolve.call(this, request, parent, ...args)
}

Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return require(path.resolve(__dirname, "vscode_stub.cjs"))
  }
  return originalLoad.call(this, request, parent, isMain)
}

module.exports = {}
