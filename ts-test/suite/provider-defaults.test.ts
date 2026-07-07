import * as assert from "assert"

import {
  API_PROVIDERS,
  DEFAULT_PROVIDER_FORM_VALUES
} from "../../src/common/constants"

suite("Provider defaults", () => {
  test("provider form defaults to DeepSeek FIM", () => {
    assert.strictEqual(
      DEFAULT_PROVIDER_FORM_VALUES.provider,
      API_PROVIDERS.Deepseek
    )
    assert.strictEqual(DEFAULT_PROVIDER_FORM_VALUES.type, "fim")
    assert.strictEqual(DEFAULT_PROVIDER_FORM_VALUES.label, "DeepSeek")
  })
})
