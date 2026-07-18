import { useEffect, useState } from "react"

import { PROVIDER_EVENT_NAME } from "../../common/constants"
import type { FimProvider } from "../../common/deepseek"
import { ClientMessage, ServerMessage } from "../../common/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export const useProviders = () => {
  const [providers, setProviders] = useState<Record<string, FimProvider>>({})
  const [fimProvider, setFimProvider] = useState<FimProvider | null>(null)
  const [loaded, setLoaded] = useState(false)
  const [embeddingProvider, setEmbeddingProvider] =
    useState<FimProvider | null>(null)
  const saveProvider = (provider: FimProvider) => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.addProvider,
      data: provider
    } as ClientMessage<FimProvider>)
  }

  const copyProvider = (provider: FimProvider) => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.copyProvider,
      data: provider
    } as ClientMessage<FimProvider>)
  }

  const updateProvider = (provider: FimProvider) => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.updateProvider,
      data: provider
    } as ClientMessage<FimProvider>)
  }

  const removeProvider = (provider: FimProvider) => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.removeProvider,
      data: provider
    } as ClientMessage<FimProvider>)
  }

  const setActiveFimProvider = (provider: FimProvider) => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.setActiveFimProvider,
      data: provider
    } as ClientMessage<FimProvider>)
  }

  const setActiveEmbeddingsProvider = (provider: FimProvider) => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.setActiveEmbeddingsProvider,
      data: provider
    } as ClientMessage<FimProvider>)
  }

  const getProvidersByType = (type: string) => {
    return Object.values(providers).filter(
      (provider) => provider.type === type
    ) as FimProvider[]
  }

  const resetProviders = () => {
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.resetProvidersToDefaults
    } as ClientMessage<FimProvider>)
  }

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message: ServerMessage<
        Record<string, FimProvider> | FimProvider
      > = event.data
      if (message?.type === PROVIDER_EVENT_NAME.getAllProviders) {
        const providers = message.data as Record<string, FimProvider>
        setProviders(providers || {})
        setLoaded(true)
      }
      if (message?.type === PROVIDER_EVENT_NAME.getActiveFimProvider) {
        setFimProvider((message.data as FimProvider) || null)
      }
      if (message?.type === PROVIDER_EVENT_NAME.getActiveEmbeddingsProvider) {
        setEmbeddingProvider((message.data as FimProvider) || null)
      }
    }
    window.addEventListener("message", handler)
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.getAllProviders
    })
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveFimProvider
    })
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveEmbeddingsProvider
    })
    return () => window.removeEventListener("message", handler)
  }, [])

  return {
    copyProvider,
    embeddingProvider,
    fimProvider,
    getProvidersByType,
    loaded,
    providers,
    removeProvider,
    resetProviders,
    saveProvider,
    setActiveEmbeddingsProvider,
    setActiveFimProvider,
    updateProvider,
    triggerExportProviders,
    triggerImportProviders
  }
}

const triggerExportProviders = () => {
  global.vscode.postMessage({
    type: PROVIDER_EVENT_NAME.exportProviders
  } as ClientMessage<unknown>)
}

const triggerImportProviders = () => {
  global.vscode.postMessage({
    type: PROVIDER_EVENT_NAME.importProviders
  } as ClientMessage<unknown>)
}
