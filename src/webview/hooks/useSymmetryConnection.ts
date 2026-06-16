import { useEffect, useState } from "react" // Removed useCallback

import {
  EVENT_NAME,
  EXTENSION_SESSION_NAME,
  GLOBAL_STORAGE_KEY
} from "../../common/constants"
import {
  ClientMessage,
  ServerMessage,
  SymmetryConnection,
  SymmetryModelProvider
} from "../../common/types"

import {
  StorageType,
  useStorageContext
} from "./useStorageContext"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export const useSymmetryConnection = () => {
  const [connecting, setConnecting] = useState(false)
  const [providers, setModels] = useState<SymmetryModelProvider[]>([])
  const [selectedModel, setSelectedModel] =
    useState<SymmetryModelProvider | null>(null)
  const {
    context: symmetryConnectionSession,
    setContext: setSymmetryConnectionSession
  } = useStorageContext<SymmetryConnection | undefined>(
    StorageType.Session,
    EXTENSION_SESSION_NAME.fimSymmetryConnection
  )

  const {
    context: symmetryProviderStatus,
    setContext: setSymmetryProviderStatus
  } = useStorageContext<string>(
    StorageType.Session,
    EXTENSION_SESSION_NAME.fimSymmetryConnectionProvider
  )

  const {
    context: autoConnectProviderContext,
    setContext: setAutoConnectProviderContext
  } = useStorageContext<boolean>(
    StorageType.Global,
    GLOBAL_STORAGE_KEY.autoConnectSymmetryProvider
  )

  const isProviderConnected = symmetryProviderStatus === "connected"

  const connectToSymmetry = () => {
    setConnecting(true)
    global.vscode.postMessage({
      type: EVENT_NAME.fimConnectSymmetry,
      data: selectedModel
    } as ClientMessage<SymmetryModelProvider>)
  }

  const disconnectSymmetry = () => {
    setConnecting(true)
    global.vscode.postMessage({
      type: EVENT_NAME.fimDisconnectSymmetry
    } as ClientMessage)
  }

  const connectAsProvider = () => { // Removed useCallback
    global.vscode.postMessage({
      type: EVENT_NAME.fimStartSymmetryProvider
    } as ClientMessage)
  }

  const disconnectAsProvider = () => {
    global.vscode.postMessage({
      type: EVENT_NAME.fimStopSymmetryProvider
    } as ClientMessage)
  }

  const getModels = () => {
    global.vscode.postMessage({
      type: EVENT_NAME.fimGetSymmetryModels
    })
  }

  const handler = (event: MessageEvent) => {
    const message: ServerMessage<
      SymmetryConnection | string | SymmetryModelProvider[]
    > = event.data
    if (message?.type === EVENT_NAME.fimConnectedToSymmetry) {
      setConnecting(false)
      setSymmetryConnectionSession(message.data as SymmetryConnection)
    }
    if (message?.type === EVENT_NAME.fimDisconnectedFromSymmetry) {
      setConnecting(false)
      setSymmetryConnectionSession(undefined)
    }
    if (message?.type === EVENT_NAME.fimSendSymmetryMessage) {
      setSymmetryProviderStatus(message?.data as string)
    }

    if (message?.type === EVENT_NAME.fimSymmetryModels) {
      setModels(message?.data as SymmetryModelProvider[])
    }
  }

  useEffect(() => {
    if (symmetryConnectionSession !== undefined) {
      setSymmetryConnectionSession(symmetryConnectionSession)
    }
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [symmetryConnectionSession, setSymmetryConnectionSession, setSymmetryProviderStatus])

  useEffect(() => {
    if (
      autoConnectProviderContext &&
      symmetryProviderStatus === "disconnected"
    ) {
      connectAsProvider()
    }
  }, [autoConnectProviderContext, symmetryProviderStatus, connectAsProvider])

  return {
    autoConnectProviderContext,
    connectAsProvider,
    connecting,
    connectToSymmetry,
    disconnectAsProvider,
    disconnectSymmetry,
    getModels,
    isConnected: symmetryConnectionSession !== undefined,
    isProviderConnected,
    providers,
    selectedModel,
    setAutoConnectProviderContext,
    setSelectedModel,
    symmetryConnection: symmetryConnectionSession,
    symmetryProviderStatus
  }
}
