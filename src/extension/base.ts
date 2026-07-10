import * as vscode from "vscode"

import {
  ACTIVE_FIM_PROVIDER_STORAGE_KEY
} from "../common/constants"
import {
  DEFAULT_PROVIDER_FORM_VALUES,
  FimProvider
} from "../common/deepseek"

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
    return provider || DEFAULT_PROVIDER_FORM_VALUES
  }

  public getProviderBaseUrl = (provider: FimProvider) => {
    return `${provider.apiProtocol}://${provider.apiHostname}${
      provider.apiPort ? `:${provider.apiPort}` : ""
    }${provider.apiPath ? provider.apiPath : ""}`
  }

  public updateConfig() {
    this.config = vscode.workspace.getConfiguration("fim")
  }
}
