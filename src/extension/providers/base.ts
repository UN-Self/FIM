import * as vscode from "vscode"

import {
  ACTIVE_FIM_PROVIDER_STORAGE_KEY,
  DEFAULT_PROVIDER_FORM_VALUES,
  EVENT_NAME,
  FIM_COMMAND_NAME,
  PROVIDER_EVENT_NAME
} from "../../common/constants"
import type { FimProvider } from "../../common/deepseek"
import { logger } from "../../common/logger"
import { getConfigKey, SETTING_DEFS } from "../../common/settings-schema"
import {
  ClientMessage,
  LanguageType,
  ServerMessage,
  ThemeType
} from "../../common/types"
import { getMessagesForConfigUpdate } from "../config-messages"
import { FileTreeProvider } from "../tree"
import {
  getLanguage,
  getTheme
} from "../utils"

export class BaseProvider {
  private _fileTreeProvider: FileTreeProvider
  public context: vscode.ExtensionContext
  public webView?: vscode.Webview

  private _sidebarReadyHandler?: () => void

  public registerSidebarReadyHandler(handler: () => void) {
    this._sidebarReadyHandler = handler
  }

  constructor(
    context: vscode.ExtensionContext,
    _statusBar: vscode.StatusBarItem
  ) {
    void _statusBar
    this.context = context
    this._fileTreeProvider = new FileTreeProvider()
  }

  public registerWebView(webView: vscode.Webview) {
    this.webView = webView
    this.registerEventListeners()
    this.ensureDeepSeekProvider()
    logger.log("Webview registered successfully")
  }

  private registerEventListeners() {
    vscode.window.onDidChangeActiveColorTheme(this.handleThemeChange)

    const eventHandlers: Record<
      string,
      ((message: ClientMessage) => void | Promise<void>) | undefined
    > = {
      [EVENT_NAME.fimGetConfigValue]: this.getConfigurationValue,
      [EVENT_NAME.fimGetAllConfigValues]: this.getAllConfigValues,
      [EVENT_NAME.fimGetWorkspaceContext]: this.getFimWorkspaceContext,
      [EVENT_NAME.fimGlobalContext]: this.getGlobalContext,
      [EVENT_NAME.fimHideBackButton]: this.fimHideBackButton,
      [EVENT_NAME.fimNotification]: this.sendNotification,
      [EVENT_NAME.fimSendLanguage]: this.getCurrentLanguage,
      [EVENT_NAME.fimSendTheme]: this.getTheme,
      [EVENT_NAME.fimSetConfigValue]: this.setConfigurationValue,
      [EVENT_NAME.fimSetGlobalContext]: this.setGlobalContext,
      [EVENT_NAME.fimSetTab]: this.setTab,
      [EVENT_NAME.fimSetWorkspaceContext]: this.setWorkspaceContext,
      [EVENT_NAME.fimFileListRequest]: this.fileListRequest,
      [EVENT_NAME.fimGetLocale]: this.sendLocaleToWebView,
      [EVENT_NAME.fimStopGeneration]: this.destroyStream,
      [EVENT_NAME.fimSidebarReady]: this._sidebarReadyHandler,
      [PROVIDER_EVENT_NAME.addProvider]: this.updateFimProvider,
      [PROVIDER_EVENT_NAME.getActiveFimProvider]: this.getActiveFimProvider,
      [PROVIDER_EVENT_NAME.getAllProviders]: this.getAllProviders,
      [PROVIDER_EVENT_NAME.testProvider]: this.testProvider,
      [PROVIDER_EVENT_NAME.updateProvider]: this.updateFimProvider
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.webView?.onDidReceiveMessage((message: any) => {
      const eventHandler = eventHandlers[message.type as string]
      if (eventHandler) eventHandler(message)
    })

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("fim")) return
      if (event.affectsConfiguration("fim.locale")) {
        this.sendLocaleToWebView()
      }
      this.getAllConfigValues()
    })
  }

  private sendLocaleToWebView = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.fimSetLocale,
      data: vscode.workspace.getConfiguration("fim").get("locale") as string
    })
  }

  private handleThemeChange = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.fimSendTheme,
      data: getTheme()
    } as ServerMessage<ThemeType>)
  }

  public destroyStream = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.fimStopGeneration
    })
  }

  private setTab = (message: ClientMessage) => {
    if (typeof message.data !== "string") return
    this.webView?.postMessage({
      type: EVENT_NAME.fimSetTab,
      data: message.data
    } as ServerMessage<string>)
  }

  private getAllConfigValues = () => {
    const config = vscode.workspace.getConfiguration("fim")
    const data: Record<string, unknown> = {}
    for (const def of SETTING_DEFS) {
      const bareKey = getConfigKey(def)
      data[bareKey] = config.get(bareKey)
    }
    // master bar reads "enabled" separately (not in SETTING_DEFS)
    data.enabled = config.get("enabled")
    this.webView?.postMessage({
      type: EVENT_NAME.fimGetAllConfigValues,
      data
    } as ServerMessage)
  }

  private getConfigurationValue = (message: ClientMessage) => {
    if (!message.key) return
    const config = vscode.workspace.getConfiguration("fim")
    this.webView?.postMessage({
      type: EVENT_NAME.fimGetConfigValue,
      data: config.get(message.key)
    } as ServerMessage<string>)
  }

  private fileListRequest = async (message: ClientMessage) => {
    if (message.type === EVENT_NAME.fimFileListRequest) {
      const files = await this._fileTreeProvider?.getAllFiles()
      this.webView?.postMessage({
        type: EVENT_NAME.fimFileListResponse,
        data: files
      })
    }
  }

  private setConfigurationValue = async (message: ClientMessage) => {
    if (!message.key) return
    const config = vscode.workspace.getConfiguration("fim")
    const inspection = config.inspect(message.key)
    const target = inspection?.workspaceFolderValue !== undefined
      ? vscode.ConfigurationTarget.WorkspaceFolder
      : inspection?.workspaceValue !== undefined
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global
    try {
      await config.update(message.key, message.data, target)
      const persistedConfig = vscode.workspace.getConfiguration("fim")
      const value = persistedConfig.get(message.key)
      const success = value === message.data
      this.webView?.postMessage({
        type: EVENT_NAME.fimSetConfigValueResult,
        data: {
          error: success
            ? undefined
            : "The persisted value is overridden by another configuration scope",
          key: message.key,
          success,
          value
        }
      })
      if (success) {
        getMessagesForConfigUpdate(message.key, value).forEach(
          (serverMessage) => this.webView?.postMessage(serverMessage)
        )
      }
    } catch (error) {
      this.webView?.postMessage({
        type: EVENT_NAME.fimSetConfigValueResult,
        data: {
          error: error instanceof Error ? error.message : String(error),
          key: message.key,
          success: false,
          value: config.get(message.key)
        }
      })
    }
  }

  private sendNotification = (message: ClientMessage) => {
    vscode.window.showInformationMessage(message.data as string)
  }

  private getGlobalContext = (message: ClientMessage) => {
    const storedData = this.context?.globalState.get(
      `${EVENT_NAME.fimGlobalContext}-${message.key}`
    )
    this.webView?.postMessage({
      type: `${EVENT_NAME.fimGlobalContext}-${message.key}`,
      data: storedData
    })
  }

  private getTheme = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.fimSendTheme,
      data: getTheme()
    } as ServerMessage<ThemeType>)
  }

  private getCurrentLanguage = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.fimSendLanguage,
      data: getLanguage()
    } as ServerMessage<LanguageType>)
  }

  private setGlobalContext = (message: ClientMessage) => {
    this.context?.globalState.update(
      `${EVENT_NAME.fimGlobalContext}-${message.key}`,
      message.data
    )
  }

  private getFimWorkspaceContext = (message: ClientMessage) => {
    const storedData = this.context?.workspaceState.get(
      `${EVENT_NAME.fimGetWorkspaceContext}-${message.key}`
    )
    this.webView?.postMessage({
      type: `${EVENT_NAME.fimGetWorkspaceContext}-${message.key}`,
      data: storedData
    } as ServerMessage)
  }

  private setWorkspaceContext = <T>(message: ClientMessage<T>) => {
    const data = message.data
    this.context.workspaceState.update(
      `${EVENT_NAME.fimGetWorkspaceContext}-${message.key}`,
      data
    )
    this.webView?.postMessage({
      type: `${EVENT_NAME.fimGetWorkspaceContext}-${message.key}`,
      data
    })
  }

  private fimHideBackButton() {
    vscode.commands.executeCommand(FIM_COMMAND_NAME.hideBackButton)
  }

  private ensureDeepSeekProvider() {
    const provider = this.context.globalState.get<FimProvider>(
      ACTIVE_FIM_PROVIDER_STORAGE_KEY
    )
    if (provider) return provider

    this.context.globalState.update(
      ACTIVE_FIM_PROVIDER_STORAGE_KEY,
      DEFAULT_PROVIDER_FORM_VALUES
    )
    return DEFAULT_PROVIDER_FORM_VALUES
  }

  private getActiveFimProvider = () => {
    const provider = this.ensureDeepSeekProvider()
    this.webView?.postMessage({
      type: PROVIDER_EVENT_NAME.getActiveFimProvider,
      data: provider
    } as ServerMessage<FimProvider>)
  }

  private getAllProviders = () => {
    const provider = this.ensureDeepSeekProvider()
    this.webView?.postMessage({
      type: PROVIDER_EVENT_NAME.getAllProviders,
      data: { [provider.id]: provider }
    } as ServerMessage<Record<string, FimProvider>>)
  }

  private updateFimProvider = async (message: ClientMessage) => {
    const provider = {
      ...DEFAULT_PROVIDER_FORM_VALUES,
      ...(message.data as Partial<FimProvider>),
      label: "DeepSeek",
      provider: DEFAULT_PROVIDER_FORM_VALUES.provider,
      type: "fim"
    }
    try {
      await this.context.globalState.update(
        ACTIVE_FIM_PROVIDER_STORAGE_KEY,
        provider
      )
      this.getActiveFimProvider()
      this.getAllProviders()
      this.webView?.postMessage({
        type: PROVIDER_EVENT_NAME.updateProviderResult,
        data: { success: true }
      })
    } catch (error) {
      this.webView?.postMessage({
        type: PROVIDER_EVENT_NAME.updateProviderResult,
        data: {
          error: error instanceof Error ? error.message : String(error),
          success: false
        }
      })
    }
  }

  private testProvider = async (message: ClientMessage) => {
    const provider = {
      ...DEFAULT_PROVIDER_FORM_VALUES,
      ...(message.data as Partial<FimProvider>)
    }
    const url = `${provider.apiProtocol}://${provider.apiHostname}${
      provider.apiPort ? `:${provider.apiPort}` : ""
    }${provider.apiPath || ""}`

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(provider.apiKey
            ? { authorization: `Bearer ${provider.apiKey}` }
            : {})
        },
        body: JSON.stringify(
          provider.apiPath?.includes("/chat/completions")
            ? {
                max_tokens: 1,
                model: provider.modelName,
                messages: [{ role: "user", content: "hi" }],
                stream: false
              }
            : {
                max_tokens: 1,
                model: provider.modelName,
                prompt: "hi",
                stream: false
              }
        )
      })

      this.webView?.postMessage({
        type: PROVIDER_EVENT_NAME.testProviderResult,
        data: response.ok
          ? { success: true }
          : { success: false, error: await response.text() }
      } as ServerMessage<{ success: boolean; error?: string }>)
    } catch (error) {
      this.webView?.postMessage({
        type: PROVIDER_EVENT_NAME.testProviderResult,
        data: {
          success: false,
          error: error instanceof Error ? error.message : String(error)
        }
      } as ServerMessage<{ success: boolean; error?: string }>)
    }
  }
}
