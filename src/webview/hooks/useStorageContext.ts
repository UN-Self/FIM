import { useEffect, useMemo, useState } from "react"

import { EVENT_NAME } from "../../common/constants"
import { ServerMessage } from "../../common/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export enum StorageType {
  Global = "global",
  Session = "session",
  Workspace = "workspace"
}

interface StorageEventNames {
  listen: string
  fetch: string
  store: string
}

export const useStorageContext = <T>(storageType: StorageType, key: string) => {
  const [context, setContextState] = useState<T | undefined>()

  const eventNames = useMemo((): StorageEventNames => {
    const eventMap = {
      [StorageType.Global]: {
        listen: `${EVENT_NAME.fimGlobalContext}-${key}`,
        fetch: EVENT_NAME.fimGlobalContext,
        store: EVENT_NAME.fimSetGlobalContext
      },
      [StorageType.Session]: {
        listen: `${EVENT_NAME.fimSessionContext}-${key}`,
        fetch: EVENT_NAME.fimSessionContext,
        store: EVENT_NAME.fimSetSessionContext
      },
      [StorageType.Workspace]: {
        listen: `${EVENT_NAME.fimGetWorkspaceContext}-${key}`,
        fetch: EVENT_NAME.fimGetWorkspaceContext,
        store: EVENT_NAME.fimSetWorkspaceContext
      }
    }
    return eventMap[storageType]
  }, [storageType, key])

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message: ServerMessage = event.data
      if (message?.type === eventNames.listen) {
        setContextState(event.data.data)
      }
    }

    window.addEventListener("message", handler)
    global.vscode.postMessage({
      type: eventNames.fetch,
      key
    })

    return () => window.removeEventListener("message", handler)
  }, [eventNames.listen, eventNames.fetch, key])

  const setContext = (value: T) => {
    setContextState(value)
    global.vscode.postMessage({
      type: eventNames.store,
      key,
      data: value
    })
  }

  return { context, setContext }
}
