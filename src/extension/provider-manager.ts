import { ReactNode } from "react"
import { TokenJS } from "fluency.js"
import { CompletionNonStreaming, LLMProvider } from "fluency.js/dist/chat"
import { TextEncoder } from "util"
import { ExtensionContext, Uri, Webview, window, workspace } from "vscode"

import {
  ACTIVE_CHAT_PROVIDER_STORAGE_KEY,
  ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY,
  ACTIVE_FIM_PROVIDER_STORAGE_KEY,
  API_PROVIDERS,
  buildProviderBaseUrl,
  DEEPSEEK_DEFAULT_MODEL,
  DEFAULT_PROVIDER_FORM_VALUES,
  EVENT_NAME,
  FIM_PROVIDERS_FILENAME,
  FIM_TEMPLATE_FORMAT,
  GLOBAL_STORAGE_KEY,
  INFERENCE_PROVIDERS_STORAGE_KEY,
  OPEN_AI_COMPATIBLE_PROVIDERS,
  parseProviderBaseUrl,
  PROVIDER_EVENT_NAME,
  WEBUI_TABS
} from "../common/constants"
import { ClientMessage, ServerMessage } from "../common/types"

import { getIsOpenAICompatible } from "./utils"

export interface FimProvider {
  apiHostname?: string
  apiKey?: string
  apiPath?: string
  apiPort?: number
  apiProtocol?: string
  features?: string[]
  fimTemplate?: string
  id: string
  label: string
  logo?: ReactNode
  modelName: string
  provider: string
  repositoryLevel?: boolean
  type: string
}

type Providers = Record<string, FimProvider> | undefined

const DEEPSEEK_PROVIDER_ID = "deepseek-default"

export class ProviderManager {
  _context: ExtensionContext
  _webView: Webview
  _storageLocation: string

  constructor(context: ExtensionContext, webviewView: Webview) {
    this._context = context
    this._webView = webviewView
    this._storageLocation =
      workspace.getConfiguration("fim").get("providerStorageLocation") ||
      "globalState"
    void this._initializeProviders()
    this.setUpEventListeners()
  }

  private async _initializeProviders(): Promise<void> {
    await this.ensureDeepSeekOnlyProvider()
    await this.getAllProviders()
  }

  private normalizeDeepSeekProvider(provider?: Partial<FimProvider>): FimProvider {
    const baseUrl = this._buildProviderBaseUrl({
      ...DEFAULT_PROVIDER_FORM_VALUES,
      ...provider
    } as FimProvider)
    const url = parseProviderBaseUrl(baseUrl)

    return {
      ...DEFAULT_PROVIDER_FORM_VALUES,
      ...provider,
      ...url,
      apiKey: provider?.apiKey || "",
      fimTemplate: FIM_TEMPLATE_FORMAT.deepseek,
      id: provider?.id || DEEPSEEK_PROVIDER_ID,
      label: "DeepSeek",
      modelName: provider?.modelName || DEEPSEEK_DEFAULT_MODEL,
      provider: API_PROVIDERS.Deepseek,
      repositoryLevel: provider?.repositoryLevel,
      type: "fim"
    } as FimProvider
  }

  private async ensureDeepSeekOnlyProvider() {
    const providers = await this.getProviders()
    const existingDeepSeek = Object.values(providers || {}).find(
      (provider) => provider.provider === API_PROVIDERS.Deepseek
    )
    const deepSeekProvider = this.normalizeDeepSeekProvider(
      existingDeepSeek || this.getDefaultFimProvider()
    )
    const nextProviders = {
      [deepSeekProvider.id]: deepSeekProvider
    }
    const activeFimProvider = this._context.globalState.get<FimProvider>(
      ACTIVE_FIM_PROVIDER_STORAGE_KEY
    )
    const providerStorageChanged =
      JSON.stringify(providers || {}) !== JSON.stringify(nextProviders)
    const activeFimProviderChanged =
      JSON.stringify(activeFimProvider) !== JSON.stringify(deepSeekProvider)

    await Promise.all([
      providerStorageChanged ? this._saveProviders(nextProviders) : undefined,
      this._context.globalState.get(ACTIVE_CHAT_PROVIDER_STORAGE_KEY)
        ? this._context.globalState.update(
            ACTIVE_CHAT_PROVIDER_STORAGE_KEY,
            undefined
          )
        : undefined,
      this._context.globalState.get(ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY)
        ? this._context.globalState.update(
            ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY,
            undefined
          )
        : undefined,
      activeFimProviderChanged
        ? this._context.globalState.update(
            ACTIVE_FIM_PROVIDER_STORAGE_KEY,
            deepSeekProvider
          )
        : undefined
    ])
  }

  setUpEventListeners() {
    this._webView?.onDidReceiveMessage(
      async (message: ClientMessage<FimProvider>) => {
        await this.handleMessage(message)
      }
    )
  }

  async handleMessage(message: ClientMessage<FimProvider>) {
    const { data: provider } = message
    switch (message.type) {
      case PROVIDER_EVENT_NAME.addProvider:
        return await this.addProvider(provider)
      case PROVIDER_EVENT_NAME.removeProvider:
        return await this.removeProvider()
      case PROVIDER_EVENT_NAME.updateProvider:
        return await this.updateProvider(provider)
      case PROVIDER_EVENT_NAME.getActiveChatProvider:
        return this.getActiveChatProvider()
      case PROVIDER_EVENT_NAME.getActiveFimProvider:
        return this.getActiveFimProvider()
      case PROVIDER_EVENT_NAME.getActiveEmbeddingsProvider:
        return this.getActiveEmbeddingsProvider()
      case PROVIDER_EVENT_NAME.setActiveChatProvider:
        return this.setActiveChatProvider(provider)
      case PROVIDER_EVENT_NAME.setActiveFimProvider:
        return this.setActiveFimProvider(provider)
      case PROVIDER_EVENT_NAME.setActiveEmbeddingsProvider:
        return this.setActiveEmbeddingsProvider(provider)
      case PROVIDER_EVENT_NAME.copyProvider:
        return this.copyProvider(provider)
      case PROVIDER_EVENT_NAME.getAllProviders:
        return await this.getAllProviders()
      case PROVIDER_EVENT_NAME.resetProvidersToDefaults:
        return await this.resetProvidersToDefaults()
      case PROVIDER_EVENT_NAME.exportProviders:
        return await this.exportProviders()
      case PROVIDER_EVENT_NAME.importProviders:
        return await this.importProviders()
      case PROVIDER_EVENT_NAME.testProvider:
        return this.testProvider(provider)
    }
  }

  public async importProviders(): Promise<void> {
    try {
      const fileUris = await window.showOpenDialog({
        canSelectMany: false,
        filters: { JSON: ["json"] }
      })

      if (!fileUris || fileUris.length === 0) {
        return
      }

      const fileUri = fileUris[0]
      const readData = await workspace.fs.readFile(fileUri)
      const jsonString = new TextDecoder().decode(readData)

      let importedProvidersData
      try {
        importedProvidersData = JSON.parse(jsonString)
      } catch {
        window.showErrorMessage("Error parsing provider file")
        console.error("Error parsing provider file:")
        return
      }

      if (
        typeof importedProvidersData !== "object" ||
        importedProvidersData === null ||
        Array.isArray(importedProvidersData)
      ) {
        window.showErrorMessage(
          "Invalid provider file format or content: Expected a JSON object of providers."
        )
        console.error(
          "Import validation failed: Data is not an object or is null/array."
        )
        return
      }

      for (const id in importedProvidersData) {
        // eslint-disable-next-line no-prototype-builtins
        if (importedProvidersData.hasOwnProperty(id)) {
          const provider = importedProvidersData[id]
          if (
            typeof provider !== "object" ||
            provider === null ||
            typeof provider?.id !== "string" ||
            typeof provider?.label !== "string" ||
            typeof provider?.modelName !== "string" ||
            typeof provider?.provider !== "string"
          ) {
            window.showErrorMessage(
              `Invalid provider file format or content: Provider with id '${id}' is invalid or missing essential properties.`
            )
            console.error(
              `Import validation failed: Provider '${id}' is invalid.`,
              provider
            )
            return
          }
        }
      }

      const validatedProviders = importedProvidersData as Providers
      const importedDeepSeek = Object.values(validatedProviders || {}).find(
        (provider) => provider.provider === API_PROVIDERS.Deepseek
      )
      const deepSeekProvider = this.normalizeDeepSeekProvider(importedDeepSeek)

      await this._saveProviders({ [deepSeekProvider.id]: deepSeekProvider })
      this.setActiveFimProvider(deepSeekProvider)
      await this.getAllProviders()
      window.showInformationMessage("Providers imported successfully.")
    } catch {
      window.showErrorMessage("Error importing providers")
      console.error("Error importing providers")
    }
  }

  public async exportProviders(): Promise<void> {
    const providers = await this.getProviders()
    if (!providers || Object.keys(providers).length === 0) {
      window.showInformationMessage("No providers to export.")
      return
    }
    try {
      const fileUri = await window.showSaveDialog({
        defaultUri: Uri.file("fim-providers.json"),
        filters: { JSON: ["json"] }
      })
      if (!fileUri) {
        return
      }
      const jsonString = JSON.stringify(providers, null, 2)
      const writeData = new TextEncoder().encode(jsonString)
      await workspace.fs.writeFile(fileUri, writeData)
      window.showInformationMessage("Providers exported successfully.")
    } catch {
      window.showErrorMessage("Error exporting providers")
      console.error("Error exporting providers")
      return this.resetProvidersToDefaults()
    }
  }

  public focusProviderTab = () => {
    this._webView.postMessage({
      type: PROVIDER_EVENT_NAME.focusProviderTab,
      data: WEBUI_TABS.providers
    } as ServerMessage<string>)
  }

  getDefaultFimProvider() {
    return this.normalizeDeepSeekProvider()
  }

  async addDefaultProviders() {
    await this.ensureDeepSeekOnlyProvider()
  }

  private async _saveProviders(providers: Providers): Promise<void> {
    if (this._storageLocation === "file") {
      await this._saveProvidersToFile(providers)
    } else {
      await this._context.globalState.update(
        INFERENCE_PROVIDERS_STORAGE_KEY,
        providers
      )
    }
  }

  async getProviders(): Promise<Providers> {
    if (this._storageLocation === "file") {
      return await this._getProvidersFromFile()
    } else {
      return this._context.globalState.get<Providers>(
        INFERENCE_PROVIDERS_STORAGE_KEY
      )
    }
  }

  async getAllProviders() {
    const providers = (await this.getProviders()) || {}
    this._webView?.postMessage({
      type: PROVIDER_EVENT_NAME.getAllProviders,
      data: providers
    })
  }

  getActiveChatProvider() {
    const provider = this._context.globalState.get<FimProvider>(
      ACTIVE_CHAT_PROVIDER_STORAGE_KEY
    )
    this._webView?.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveChatProvider,
      data: provider
    })
    return provider
  }

  getActiveFimProvider() {
    const provider = this._context.globalState.get<FimProvider>(
      ACTIVE_FIM_PROVIDER_STORAGE_KEY
    )
    this._webView?.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveFimProvider,
      data: provider
    })
    return provider
  }

  getActiveEmbeddingsProvider() {
    const provider = this._context.globalState.get<FimProvider>(
      ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY
    )
    this._webView?.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveEmbeddingsProvider,
      data: provider
    })
    return provider
  }

  setActiveChatProvider(provider?: FimProvider) {
    if (!provider) return
    this._context.globalState.update(ACTIVE_CHAT_PROVIDER_STORAGE_KEY, provider)
    return this.getActiveChatProvider()
  }

  setActiveFimProvider(provider?: FimProvider) {
    if (!provider) return
    this._context.globalState.update(ACTIVE_FIM_PROVIDER_STORAGE_KEY, provider)
    return this.getActiveFimProvider()
  }

  setActiveEmbeddingsProvider(provider?: FimProvider) {
    if (!provider) return
    this._context.globalState.update(
      ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY,
      provider
    )
    return this.getActiveEmbeddingsProvider()
  }

  async addProvider(provider?: FimProvider): Promise<FimProvider | null> {
    if (!provider) return null
    provider = this.normalizeDeepSeekProvider(provider)
    await this._saveProviders({ [provider.id]: provider })
    this._context.globalState.update(ACTIVE_FIM_PROVIDER_STORAGE_KEY, provider)
    this._context.globalState.update(
      `${EVENT_NAME.fimGlobalContext}-${GLOBAL_STORAGE_KEY.selectedModel}`,
      provider.modelName
    )
    await this.getAllProviders()
    return provider
  }

  async copyProvider(provider?: FimProvider) {
    if (!provider) return
    await this.addProvider(provider)
  }

  async removeProvider() {
    await this.ensureDeepSeekOnlyProvider()
    await this.getAllProviders()
  }

  async updateProvider(provider?: FimProvider) {
    if (!provider) return
    provider = this.normalizeDeepSeekProvider(provider)
    await this._saveProviders({ [provider.id]: provider })
    this.setActiveFimProvider(provider)
    await this.getAllProviders()
  }

  async resetProvidersToDefaults(): Promise<void> {
    await this._context.globalState.update(
      ACTIVE_CHAT_PROVIDER_STORAGE_KEY,
      undefined
    )
    await this._context.globalState.update(
      ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY,
      undefined
    )
    await this._context.globalState.update(
      ACTIVE_FIM_PROVIDER_STORAGE_KEY,
      undefined
    )

    if (this._storageLocation === "file") {
      await this._saveProvidersToFile({})
    } else {
      await this._context.globalState.update(
        INFERENCE_PROVIDERS_STORAGE_KEY,
        undefined
      )
    }

    await this.ensureDeepSeekOnlyProvider()
    const fimProvider = this.getActiveFimProvider()

    this.focusProviderTab()

    this.setActiveFimProvider(fimProvider)
    await this.getAllProviders()
  }

  private async _getProvidersFromFile(): Promise<Providers | undefined> {
    const fileUri = Uri.joinPath(
      this._context.globalStorageUri,
      FIM_PROVIDERS_FILENAME
    )
    try {
      const content = await workspace.fs.readFile(fileUri)
      const providers = JSON.parse(content.toString()) as Providers
      return providers
    } catch {
      return undefined
    }
  }

  private async _saveProvidersToFile(providers: Providers): Promise<void> {
    const fileUri = Uri.joinPath(
      this._context.globalStorageUri,
      FIM_PROVIDERS_FILENAME
    )
    try {
      const content = JSON.stringify(providers, null, 2)
      await workspace.fs.writeFile(fileUri, Buffer.from(content))
    } catch (e) {
      console.error(e)
    }
  }

  private _buildProviderBaseUrl(provider: FimProvider): string {
    return buildProviderBaseUrl(provider)
  }

  private _getProviderTypeForFluency(provider: FimProvider): LLMProvider {
    if (getIsOpenAICompatible(provider)) {
      return OPEN_AI_COMPATIBLE_PROVIDERS.OpenAICompatible as LLMProvider
    }
    return provider.provider as LLMProvider
  }

  async testProvider(provider?: FimProvider) {
    if (!provider) {
      this._webView?.postMessage({
        type: PROVIDER_EVENT_NAME.testProviderResult,
        data: { success: false, error: "Provider details not provided." }
      } as ServerMessage<{ success: boolean; error?: string }>)
      return
    }

    const { apiKey, modelName } = provider

    const tokenJs = new TokenJS({
      baseURL: this._buildProviderBaseUrl(provider),
      apiKey: apiKey
    })

    const requestBody: CompletionNonStreaming<LLMProvider> = {
      messages: [{ role: "user", content: "hi" }],
      model: modelName,
      provider: this._getProviderTypeForFluency(provider),
      max_tokens: 5
    }

    try {
      await tokenJs.chat.completions.create(requestBody)
      this._webView?.postMessage({
        type: PROVIDER_EVENT_NAME.testProviderResult,
        data: { success: true }
      } as ServerMessage<{ success: boolean; error?: string }>)
    } catch (error) {
      let errorMessage = "An unknown error occurred."
      if (error instanceof Error) {
        errorMessage = error.message
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((error as any).response?.data?.error?.message) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          errorMessage = (error as any).response.data.error.message
        }
      } else if (typeof error === "string") {
        errorMessage = error
      }
      this._webView?.postMessage({
        type: PROVIDER_EVENT_NAME.testProviderResult,
        data: { success: false, error: errorMessage }
      } as ServerMessage<{ success: boolean; error?: string }>)
    }
  }
}
