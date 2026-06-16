import * as vscode from "vscode"

import {
  ACTIVE_CHAT_PROVIDER_STORAGE_KEY,
  ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY,
  ACTIVE_FIM_PROVIDER_STORAGE_KEY
} from "../common/constants"

import { FimProvider } from "./provider-manager"
import { getIsOpenAICompatible } from "./utils"

export class Base {
  public config = vscode.workspace.getConfiguration("fim")
  public context?: vscode.ExtensionContext

  constructor(context: vscode.ExtensionContext) {
    this.context = context

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("fim")) {
        return
      }
      this.updateConfig()
    })
  }

  public getFimProvider = () => {
    const provider = this.context?.globalState.get<FimProvider>(
      ACTIVE_FIM_PROVIDER_STORAGE_KEY
    )
    return provider
  }

  public getProviderBaseUrl = (provider: FimProvider) => {
    if (getIsOpenAICompatible(provider)) {
      return `${provider.apiProtocol}://${provider.apiHostname}${
        provider.apiPort ? `:${provider.apiPort}` : ""
      }${provider.apiPath ? provider.apiPath : ""}`
    } else {
      return ""
    }
  }

  public getProvider = () => {
    const provider = this.context?.globalState.get<FimProvider>(
      ACTIVE_CHAT_PROVIDER_STORAGE_KEY
    )
    return provider
  }

  public getEmbeddingProvider = () => {
    const provider = this.context?.globalState.get<FimProvider>(
      ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY
    )
    return provider
  }

  public updateConfig() {
    this.config = vscode.workspace.getConfiguration("fim")
  }
}
