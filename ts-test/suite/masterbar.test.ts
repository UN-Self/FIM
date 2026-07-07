import * as assert from "assert"
import * as fs from "fs"
import * as path from "path"

suite("MasterBar", () => {
  test("does not include a manage providers option in the provider dropdown", () => {
    const sourcePath = path.resolve(__dirname, "../../../src/webview/settings/MasterBar.tsx")
    const source = fs.readFileSync(sourcePath, "utf8")

    assert.ok(!source.includes("__manage"))
    assert.ok(!source.includes("settings.masterBar.manageProviders"))
  })
})
