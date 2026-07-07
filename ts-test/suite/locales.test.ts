import * as assert from "assert"

import en from "../../src/webview/assets/locales/en.json"
import zhCN from "../../src/webview/assets/locales/zh-CN.json"

suite("Locales", () => {
  test("zh-CN covers every English translation key", () => {
    const missingKeys = Object.keys(en).filter((key) => !(key in zhCN))

    assert.deepStrictEqual(missingKeys, [])
  })
})
