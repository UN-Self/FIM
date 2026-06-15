import * as vscode from "vscode"

import {
  EVENT_NAME,
  TWINNY_COMMAND_NAME
} from "../../common/constants"
import { logger } from "../../common/logger"
import {
  ApiModel,
  ClientMessage,
  LanguageType,
  ServerMessage,
  ThemeType
} from "../../common/types"
import { EmbeddingDatabase } from "../embeddings"
import { OllamaService } from "../ollama"
import { ProviderManager } from "../provider-manager"
import { SessionManager } from "../session-manager"
import { TemplateProvider } from "../template-provider"
import { FileTreeProvider } from "../tree"
import {
  getLanguage,
  getTheme
} from "../utils"

export class BaseProvider {
  private _embeddingDatabase: EmbeddingDatabase | undefined
  private _fileTreeProvider: FileTreeProvider
  private _ollamaService: OllamaService | undefined
  private _sessionManager: SessionManager | undefined
  private _templateDir: string | undefined
  private _templateProvider: TemplateProvider
  public context: vscode.ExtensionContext
  public webView?: vscode.Webview

  private _sidebarReadyHandler?: () => void

  public registerSidebarReadyHandler(handler: () => void) {
    this._sidebarReadyHandler = handler
  }

  constructor(
    context: vscode.ExtensionContext,
    templateDir: string,
    _statusBar: vscode.StatusBarItem,
    db?: EmbeddingDatabase,
    sessionManager?: SessionManager
  ) {
    this.context = context
    this._fileTreeProvider = new FileTreeProvider()
    this._embeddingDatabase = db
    this._ollamaService = new OllamaService()
    this._sessionManager = sessionManager
    this._templateDir = templateDir
    this._templateProvider = new TemplateProvider(templateDir)
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
      [EVENT_NAME.twinnyEmbedDocuments]: this.embedDocuments,
      [EVENT_NAME.twinnyFetchOllamaModels]: this.fetchOllamaModels,
      [EVENT_NAME.twinnyGetConfigValue]: this.getConfigurationValue,
      [EVENT_NAME.twinnyGetWorkspaceContext]: this.getTwinnyWorkspaceContext,
      [EVENT_NAME.twinnyGlobalContext]: this.getGlobalContext,
      [EVENT_NAME.twinnyHideBackButton]: this.twinnyHideBackButton,
      [EVENT_NAME.twinnyListTemplates]: this.listTemplates,
      [EVENT_NAME.twinnyNotification]: this.sendNotification,
      [EVENT_NAME.twinnySendLanguage]: this.getCurrentLanguage,
      [EVENT_NAME.twinnySendTheme]: this.getTheme,
      [EVENT_NAME.twinnySessionContext]: this.getSessionContext,
      [EVENT_NAME.twinnySetConfigValue]: this.setConfigurationValue,
      [EVENT_NAME.twinnySetGlobalContext]: this.setGlobalContext,
      [EVENT_NAME.twinnySetTab]: this.setTab,
      [EVENT_NAME.twinnySetWorkspaceContext]: this.setWorkspaceContext,
      [EVENT_NAME.twinnyFileListRequest]: this.fileListRequest,
      [EVENT_NAME.twinnyEditDefaultTemplates]: this.editDefaultTemplates,
      [EVENT_NAME.twinntGetLocale]: this.sendLocaleToWebView,
      [EVENT_NAME.twinnyStopGeneration]: this.destroyStream,
      [EVENT_NAME.twinnySidebarReady]: this._sidebarReadyHandler,
      [TWINNY_COMMAND_NAME.settings]: this.openSettings
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.webView?.onDidReceiveMessage((message: any) => {
      const eventHandler = eventHandlers[message.type as string]
      if (eventHandler) eventHandler(message)
    })

    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("twinny")) return
      this.sendLocaleToWebView()
    })
  }

  private sendLocaleToWebView = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.twinnySetLocale,
      data: vscode.workspace.getConfiguration("twinny").get("locale") as string
    })
  }

  private handleThemeChange = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.twinnySendTheme,
      data: getTheme()
    } as ServerMessage<ThemeType>)
  }

  public editDefaultTemplates = async () => {
    if (!this._templateDir) return
    await vscode.commands.executeCommand(
      "vscode.openFolder",
      vscode.Uri.file(this._templateDir),
      true
    )
  }

  public destroyStream = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.twinnyStopGeneration
    })
  }

  private openSettings = () => {
    vscode.commands.executeCommand(TWINNY_COMMAND_NAME.settings)
  }

  private setTab = (tab: ClientMessage) => {
    this.webView?.postMessage({
      type: EVENT_NAME.twinnySetTab,
      data: tab
    } as ServerMessage<string>)
  }

  private embedDocuments = async () => {
    const dirs = vscode.workspace.workspaceFolders
    if (!dirs?.length) {
      vscode.window.showErrorMessage("No workspace loaded.")
      return
    }
    if (!this._embeddingDatabase) return
    for (const dir of dirs) {
      await this._embeddingDatabase.injestDocuments(dir.uri.fsPath)
    }
  }

  private getConfigurationValue = (message: ClientMessage) => {
    if (!message.key) return
    const config = vscode.workspace.getConfiguration("twinny")
    this.webView?.postMessage({
      type: EVENT_NAME.twinnyGetConfigValue,
      data: config.get(message.key)
    } as ServerMessage<string>)
  }

  private fileListRequest = async (message: ClientMessage) => {
    if (message.type === EVENT_NAME.twinnyFileListRequest) {
      const files = await this._fileTreeProvider?.getAllFiles()
      this.webView?.postMessage({
        type: EVENT_NAME.twinnyFileListResponse,
        data: files
      })
    }
  }

  private setConfigurationValue = (message: ClientMessage) => {
    if (!message.key) return
    const config = vscode.workspace.getConfiguration("twinny")
    config.update(message.key, message.data, vscode.ConfigurationTarget.Global)
  }

  private fetchOllamaModels = async () => {
    try {
      const models = await this._ollamaService?.fetchModels()
      if (!models?.length) {
        return
      }
      this.webView?.postMessage({
        type: EVENT_NAME.twinnyFetchOllamaModels,
        data: models
      } as ServerMessage<ApiModel[]>)
    } catch {
      return
    }
  }

  private listTemplates = () => {
    const templates = this._templateProvider.listTemplates()
    this.webView?.postMessage({
      type: EVENT_NAME.twinnyListTemplates,
      data: templates
    } as ServerMessage<string[]>)
  }

  private sendNotification = (message: ClientMessage) => {
    vscode.window.showInformationMessage(message.data as string)
  }

  private getGlobalContext = (message: ClientMessage) => {
    const storedData = this.context?.globalState.get(
      `${EVENT_NAME.twinnyGlobalContext}-${message.key}`
    )
    this.webView?.postMessage({
      type: `${EVENT_NAME.twinnyGlobalContext}-${message.key}`,
      data: storedData
    })
  }

  private getTheme = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.twinnySendTheme,
      data: getTheme()
    } as ServerMessage<ThemeType>)
  }

  private getCurrentLanguage = () => {
    this.webView?.postMessage({
      type: EVENT_NAME.twinnySendLanguage,
      data: getLanguage()
    } as ServerMessage<LanguageType>)
  }

  private getSessionContext = (data: ClientMessage) => {
    if (!data.key) return undefined
    return this.webView?.postMessage({
      type: `${EVENT_NAME.twinnySessionContext}-${data.key}`,
      data: this._sessionManager?.get(data.key)
    })
  }

  private setGlobalContext = (message: ClientMessage) => {
    this.context?.globalState.update(
      `${EVENT_NAME.twinnyGlobalContext}-${message.key}`,
      message.data
    )
  }

  private getTwinnyWorkspaceContext = (message: ClientMessage) => {
    const storedData = this.context?.workspaceState.get(
      `${EVENT_NAME.twinnyGetWorkspaceContext}-${message.key}`
    )
    this.webView?.postMessage({
      type: `${EVENT_NAME.twinnyGetWorkspaceContext}-${message.key}`,
      data: storedData
    } as ServerMessage)
  }

  private setWorkspaceContext = <T>(message: ClientMessage<T>) => {
    const data = message.data
    this.context.workspaceState.update(
      `${EVENT_NAME.twinnyGetWorkspaceContext}-${message.key}`,
      data
    )
    this.webView?.postMessage({
      type: `${EVENT_NAME.twinnyGetWorkspaceContext}-${message.key}`,
      data
    })
  }

  private twinnyHideBackButton() {
    vscode.commands.executeCommand(TWINNY_COMMAND_NAME.hideBackButton)
  }
}
