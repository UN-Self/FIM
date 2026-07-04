/* eslint-disable @typescript-eslint/no-explicit-any */
import * as assert from "assert"

import {
  coerceValue,
  getConfigKey,
  getSettingsByGroup,
  SETTING_DEFS,
  SETTING_GROUPS} from "../../src/common/settings-schema"

suite("Settings schema", () => {
  test("every setting has a unique key", () => {
    const keys = SETTING_DEFS.map((d) => d.key)
    assert.strictEqual(keys.length, new Set(keys).size, "duplicate setting keys")
  })

  test("every setting group has at least one visible setting", () => {
    const visibleGroups = SETTING_GROUPS.filter((g) => g.id !== "templates")
    for (const group of visibleGroups) {
      const settings = getSettingsByGroup(group.id)
      assert.ok(
        settings.length > 0,
        `group "${group.id}" has no settings`
      )
    }
  })

  test("every setting has matching group, type, titleKey, descKey", () => {
    const groupIds = SETTING_GROUPS.map((g) => g.id)
    for (const def of SETTING_DEFS) {
      assert.ok(groupIds.includes(def.group), `${def.key} has unknown group`)
      assert.ok(["boolean", "number", "select"].includes(def.type), `${def.key} bad type`)
      assert.ok(def.titleKey, `${def.key} missing titleKey`)
      assert.ok(def.descKey, `${def.key} missing descKey`)
      if (def.type === "select") {
        assert.ok(def.options && def.options.length > 0, `${def.key} select needs options`)
      }
    }
  })

  test("getConfigKey strips fim prefix", () => {
    assert.strictEqual(getConfigKey({ key: "fim.debounceWait" } as any), "debounceWait")
    assert.strictEqual(getConfigKey({ key: "fim.locale" } as any), "locale")
  })

  test("coerceValue boolean coerces truthy/falsy", () => {
    const def = { type: "boolean" } as any
    assert.strictEqual(coerceValue(def, true), true)
    assert.strictEqual(coerceValue(def, false), false)
    assert.strictEqual(coerceValue(def, "true"), true)
    assert.strictEqual(coerceValue(def, ""), false)
  })

  test("coerceValue number parses and clamps to min/max", () => {
    const def = { type: "number", min: 0, max: 2, step: 0.1 } as any
    assert.strictEqual(coerceValue(def, "0.5"), 0.5)
    assert.strictEqual(coerceValue(def, "abc"), 0) // NaN -> min
    assert.strictEqual(coerceValue(def, 99), 2) // clamped to max
    assert.strictEqual(coerceValue(def, -5), 0) // clamped to min
  })

  test("coerceValue number without min/max does not clamp", () => {
    const def = { type: "number" } as any
    assert.strictEqual(coerceValue(def, "42"), 42)
  })

  test("coerceValue select falls back to first option when invalid", () => {
    const def = {
      type: "select",
      options: [
        { value: "5m", labelKey: "a" },
        { value: "30m", labelKey: "b" }
      ]
    } as any
    assert.strictEqual(coerceValue(def, "30m"), "30m")
    assert.strictEqual(coerceValue(def, "bogus"), "5m") // fallback
  })
})
