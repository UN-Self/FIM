import * as assert from "assert"

import { EVENT_NAME } from "../../src/common/constants"
import { getMessagesForConfigUpdate } from "../../src/extension/config-messages"

suite("Config messages", () => {
  test("locale updates notify the webview immediately", () => {
    assert.deepStrictEqual(
      getMessagesForConfigUpdate("locale", "zh-CN"),
      [
        {
          type: EVENT_NAME.fimSetLocale,
          data: "zh-CN"
        }
      ]
    )
  })

  test("non-locale updates do not emit locale messages", () => {
    assert.deepStrictEqual(getMessagesForConfigUpdate("enabled", true), [])
  })
})
