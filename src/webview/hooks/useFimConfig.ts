import { useCallback, useEffect, useState } from "react"

import { EVENT_NAME } from "../../common/constants"
import { ServerMessage } from "../../common/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export interface FimConfig {
  [bareKey: string]: unknown
}

/**
 * Reads all fim.* config values in one batch on mount, and provides an
 * `update(bareKey, value)` that optimistically updates local state and posts
 * a fimSetConfigValue message. Keys are BARE (e.g. "debounceWait", not
 * "fim.debounceWait") to match the VS Code config protocol.
 */
export const useFimConfig = () => {
  const [config, setConfig] = useState<FimConfig>({})
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message: ServerMessage<FimConfig> = event.data
      if (message?.type === EVENT_NAME.fimGetAllConfigValues) {
        setConfig(message.data || {})
        setLoaded(true)
      }
    }
    window.addEventListener("message", handler)
    global.vscode.postMessage({ type: EVENT_NAME.fimGetAllConfigValues })
    return () => window.removeEventListener("message", handler)
  }, [])

  const update = useCallback((bareKey: string, value: unknown) => {
    setConfig((prev) => ({ ...prev, [bareKey]: value }))
    global.vscode.postMessage({
      type: EVENT_NAME.fimSetConfigValue,
      key: bareKey,
      data: value
    })
  }, [])

  return { config, loaded, update }
}
