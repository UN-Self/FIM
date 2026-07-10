import { useEffect, useState } from "react"

import { PROVIDER_EVENT_NAME } from "../../common/constants"
import type { FimProvider } from "../../common/deepseek"
import { ClientMessage, ServerMessage } from "../../common/types"

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const global = globalThis as any

export const useProviders = () => {
  const [providers, setProviders] = useState<Record<string, FimProvider>>({})
  const [fimProvider, setFimProvider] = useState<FimProvider | null>(null)
  const [embeddingProvider, setEmbeddingProvider] =
    useState<FimProvider | null>(null)
  const handler = (event: MessageEvent) => {
    const message: ServerMessage<
      Record<string, FimProvider> | FimProvider
    > = event.data
    if (message?.type === PROVIDER_EVENT_NAME.getAllProviders) {
      const providers = message.data as Record<string, FimProvider>
      setProviders(providers || {})
    }
    if (message?.type === PROVIDER_EVENT_NAME.getActiveFimProvider) {
      if (message.data) {
        const provider = message.data as FimProvider
        setFimProvider(provider)
      }
    }
    if (message?.type === PROVIDER_EVENT_NAME.getActiveEmbeddingsProvider) {
      if (message.data) {
        const provider = message.data as FimProvider
        setEmbeddingProvider(provider)
      }
    }
    return () => window.removeEventListener("message", handler)
  }

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
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.getAllProviders
    })
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveFimProvider
    })
    global.vscode.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveEmbeddingsProvider
    })
    window.addEventListener("message", handler)
    return () => window.removeEventListener("message", handler)
  }, [])

  return {
    copyProvider,
    embeddingProvider,
    fimProvider,
    getProvidersByType,
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
