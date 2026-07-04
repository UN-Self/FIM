const { LRUCache } = require("./out/cache.test.js")

function runCacheTest(capacity, operations) {
  const cache = new LRUCache(capacity)
  const results = []

  for (const op of operations) {
    if (op.op === "set") {
      cache.set(op.key, op.value)
    } else if (op.op === "get") {
      const val = cache.get(op.key)
      const normalized = (val === undefined) ? null : val
      results.push({ key: op.key, got: normalized, expected: op.expected })
      if (normalized !== op.expected) {
        return { passed: false, message: `get("${op.key}") expected ${JSON.stringify(op.expected)}, got ${JSON.stringify(normalized)}` }
      }
    } else if (op.op === "delete") {
      cache.delete(op.key)
    }
  }

  return { passed: true, results }
}

function normalizeKey(text) {
  return text.split("\n").join("").replace(/\s+/g, "").replace(/\s/g, "")
}

function getKey(prefixSuffix) {
  const { prefix, suffix } = prefixSuffix
  if (suffix) {
    return normalizeKey(prefix + " #### " + suffix)
  }
  return normalizeKey(prefix)
}

module.exports = { runCacheTest, normalizeKey, getKey }
