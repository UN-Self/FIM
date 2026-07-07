import * as vscode from "vscode"

import {
  EVENT_NAME,
  FIM_COMMAND_NAME
} from "../../common/constants"
import { logger } from "../../common/logger"
import { getConfigKey, SETTING_DEFS } from "../../common/settings-schema"
import {
  ApiModel,
  ClientMessage,
  LanguageType,
  ServerMessage,
  ThemeType
} from "../../common/types"
import { getMessagesForConfigUpdate } from "../config-messages"
import { OllamaService } from "../ollama"
import { ProviderManager } from "../provider-manager"
import { SessionManager } from "../session-manager"
import { FileTreeProvider } from "../tree"
import {
  getLanguage,
  getTheme
} from "../utils"

export class BaseProvider {
  private _fileTreeProvider: FileTreeProvider
  private _ollamaService: OllamaService | undefined
  private _sessionManager: SessionManager | undefined
  public context: vscode.ExtensionContext
  public webView?: vscode.Webview

  private _sidebarReadyHandler?: () => void

  public registerSidebarReadyHandler(handler: () => void) {
    this._sidebarReadyHandler = handler
  }

  constructor(
    context: vscode.ExtensionContext,
    _statusBar: vscode.StatusBarItem,
    sessionManager?: SessionManager
  ) {
    this.context = context
    this._fileTreeProvider = new FileTreeProvider()
    this._ollamaService = new OllamaService()
    this._sessionManager = sessionManager
  }

  public registerWebView(webView: vscode.Webview) {
    this.webView = webView
    this.initializeServices()
    this.registerEventListeners()
    logger.log("Webview registered successfully")
  }

  private initializeServices() {
    if (!this.webView) return

    new ProviderManager(this.context, this.webView)

    logger.log("Provider management initialized successfully")
  }

  private registerEventListeners() {
    vscode.window.onDidChangeActiveColorTheme(this.handleThemeChange)

    const eventHandlers: Record<
      string,
      ((message: ClientMessage) => void | Promise<void>) | undefined
    > = {
      [EVENT_NAME.fimFetchOllamaModels]: this.fetchOllamaModels,
      [EVENT_NAME.fimGetConfigValue]: this.getConfigurationValue,
      [EVENT_NAME.fimGetAllConfigValues]: this.getAllConfigValues,
      [EVENT_NAME.fimGetWorkspaceContext]: this.getFimWorkspaceContext,
      [EVENT_NAME.fimGlobalContext]: this.getGlobalContext,
      [EVENT_NAME.fimHideBackButton]: this.fimHideBackButton,
      [EVENT_NAME.fimNotification]: this.sendNotification,
      [EVENT_NAME.fimSendLanguage]: this.getCurrentLanguage,
      [EVENT_NAME.fimSendTheme]: this.getTheme,
      [EVENT_NAME.fimSessionContext]: this.getSessionContext,
      [EVENT_NAME.fimSetConfigValue]: this.setConfigurationValue,
      [EVENT_NAME.fimSetGlobalContext]: this.setGlobalContext,
      [EVENT_NAME.fimSetTab]: this.setTab,
      [EVENT_NAME.fimSetWorkspaceContext]: this.setWorkspaceContext,
      [EVENT_NAME.fimFileListRequest]: this.fileListRequest,
      [EVENT_NAME.fimGetLocale]: this.sendLocaleToWebView,
      [EVENT_NAME.fimStopGeneration]: this.destroyStream,
      [EVENT_NAME.fimSidebarReady]: this._sidebarReadyHandler
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.webView?.onDidReceiveMessage((message: any) => {
      const eventHandler = eventHandlers[message.type as string]
      if (eventHandler) eventHandler(message)
    })

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("fim")) return
      this.sendLocaleToWebView()
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

  private setTab = (tab: ClientMessage) => {
    this.webView?.postMessage({
      type: EVENT_NAME.fimSetTab,
      data: tab
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

  private setConfigurationValue = (message: ClientMessage) => {
    if (!message.key) return
    const config = vscode.workspace.getConfiguration("fim")
    config.update(message.key, message.data, vscode.ConfigurationTarget.Global)
    getMessagesForConfigUpdate(message.key, message.data).forEach(
      (serverMessage) => this.webView?.postMessage(serverMessage)
    )
  }

  private fetchOllamaModels = async () => {
    try {
      const models = await this._ollamaService?.fetchModels()
      if (!models?.length) {
        return
      }
      this.webView?.postMessage({
        type: EVENT_NAME.fimFetchOllamaModels,
        data: models
      } as ServerMessage<ApiModel[]>)
    } catch {
      return
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

  private getSessionContext = (data: ClientMessage) => {
    if (!data.key) return undefined
    return this.webView?.postMessage({
      type: `${EVENT_NAME.fimSessionContext}-${data.key}`,
      data: this._sessionManager?.get(data.key)
    })
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
}
