import { useCallback, useEffect, useState } from "react"

import { EVENT_NAME } from "../../common/constants"
import { ServerMessage } from "../../common/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export interface FimConfig {
  [bareKey: string]: unknown
}

interface ConfigUpdateResult {
  error?: string
  key: string
  success: boolean
  value: unknown
}

/**
 * Reads all fim.* config values in one batch on mount, and provides an
 * `update(bareKey, value)` that posts a fimSetConfigValue message and waits
 * for the extension host to return the persisted value. Keys are BARE (e.g.
 * "debounceWait", not "fim.debounceWait") to match the VS Code config protocol.
 */
export const useFimConfig = () => {
  const [config, setConfig] = useState<FimConfig>({})
  const [loaded, setLoaded] = useState(false)
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message: ServerMessage<FimConfig> = event.data
      if (message?.type === EVENT_NAME.fimGetAllConfigValues) {
        setConfig(message.data || {})
        setLoaded(true)
      }
      if (message?.type === EVENT_NAME.fimSetConfigValueResult) {
        const result = message.data as unknown as ConfigUpdateResult
        if (!result?.key) return
        setConfig((prev) => ({ ...prev, [result.key]: result.value }))
        setUpdateErrors((prev) => {
          const next = { ...prev }
          if (result.success) {
            delete next[result.key]
          } else {
            next[result.key] = result.error || "Configuration update failed"
          }
          return next
        })
      }
    }
    window.addEventListener("message", handler)
    global.vscode.postMessage({ type: EVENT_NAME.fimGetAllConfigValues })
    return () => window.removeEventListener("message", handler)
  }, [])

  const update = useCallback((bareKey: string, value: unknown) => {
    setUpdateErrors((prev) => {
      const next = { ...prev }
      delete next[bareKey]
      return next
    })
    global.vscode.postMessage({
      type: EVENT_NAME.fimSetConfigValue,
      key: bareKey,
      data: value
    })
  }, [])

  return { config, loaded, update, updateErrors }
}
