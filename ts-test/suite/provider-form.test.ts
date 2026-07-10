import * as assert from "assert"

import {
  API_PROVIDERS,
  DEFAULT_PROVIDER_FORM_VALUES
} from "../../src/common/constants"
import {
  buildDeepSeekProviderFromForm,
  getDeepSeekProviderFormState
} from "../../src/webview/provider-form"

suite("Provider form", () => {
  test("shows DeepSeek model, base URL, and API key defaults", () => {
    const state = getDeepSeekProviderFormState()

    assert.strictEqual(state.modelName, DEFAULT_PROVIDER_FORM_VALUES.modelName)
    assert.strictEqual(
      state.baseUrl,
      "https://api.deepseek.com/beta/completions"
    )
    assert.strictEqual(state.apiKey, "")
  })

  test("builds a DeepSeek provider payload from model, base URL, and API key", () => {
    const provider = buildDeepSeekProviderFromForm(undefined, {
      apiKey: " sk-test ",
      baseUrl: " https://example.com/v1/completions ",
      modelName: " deepseek-coder "
    })

    assert.strictEqual(provider.modelName, "deepseek-coder")
    assert.strictEqual(provider.apiKey, "sk-test")
    assert.strictEqual(provider.apiProtocol, "https")
    assert.strictEqual(provider.apiHostname, "example.com")
    assert.strictEqual(provider.apiPath, "/v1/completions")
    assert.strictEqual(provider.provider, API_PROVIDERS.Deepseek)
    assert.strictEqual(provider.type, "fim")
  })
})
