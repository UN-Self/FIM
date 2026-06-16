import * as fs from "fs"
import * as os from "os"
import * as path from "path"
import {
  commands,
  ExtensionContext,
  languages,
  StatusBarAlignment,
  window,
  workspace
} from "vscode"
import * as vscode from "vscode"

import {
  EVENT_NAME,
  EXTENSION_CONTEXT_NAME,
  EXTENSION_NAME,
  FIM_COMMAND_NAME,
  WEBUI_TABS
} from "./common/constants"
import { logger } from "./common/logger"
import { ServerMessage } from "./common/types"
import { setContext } from "./extension/context"
import { EmbeddingDatabase } from "./extension/embeddings"
import { FileInteractionCache } from "./extension/file-interaction"
import { CompletionProvider } from "./extension/providers/completion"
import { SidebarProvider } from "./extension/providers/sidebar"
import { SessionManager } from "./extension/session-manager"
import { TemplateProvider } from "./extension/template-provider"
import { delayExecution, sanitizeWorkspaceName } from "./extension/utils"
import { getLineBreakCount } from "./webview/utils"

export async function activate(context: ExtensionContext) {
  setContext(context)
  const config = workspace.getConfiguration("fim")
  const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right)

  logger.log("Fim completion extension starting")

  const templateDir = path.join(os.homedir(), ".fim/templates")
  const templateProvider = new TemplateProvider(templateDir)
  const fileInteractionCache = new FileInteractionCache()
  const sessionManager = new SessionManager()

  const db = await createEmbeddingDatabase(context)

  const sidebarProvider = new SidebarProvider(
    statusBarItem,
    context,
    templateDir,
    db,
    sessionManager
  )

  const completionProvider = new CompletionProvider(
    statusBarItem,
    fileInteractionCache,
    templateProvider,
    context
  )

  templateProvider.init()

  context.subscriptions.push(
    languages.registerInlineCompletionItemProvider(
      { pattern: "**" },
      completionProvider
    ),
    commands.registerCommand(FIM_COMMAND_NAME.enable, () => {
      statusBarItem.show()
    }),
    commands.registerCommand(FIM_COMMAND_NAME.disable, () => {
      statusBarItem.hide()
    }),
    commands.registerCommand(FIM_COMMAND_NAME.stopGeneration, () => {
      completionProvider.onError()
      sidebarProvider.destroyStream()
    }),
    commands.registerCommand(FIM_COMMAND_NAME.manageProviders, async () => {
      await showSidebarTab(
        sidebarProvider,
        EXTENSION_CONTEXT_NAME.fimManageProviders,
        WEBUI_TABS.providers
      )
    }),
    commands.registerCommand(FIM_COMMAND_NAME.manageTemplates, async () => {
      await showSidebarTab(
        sidebarProvider,
        EXTENSION_CONTEXT_NAME.fimManageTemplates,
        WEBUI_TABS.settings
      )
    }),
    commands.registerCommand(FIM_COMMAND_NAME.embeddings, async () => {
      await showSidebarTab(
        sidebarProvider,
        EXTENSION_CONTEXT_NAME.fimEmbeddingsTab,
        WEBUI_TABS.embeddings
      )
    }),
    commands.registerCommand(FIM_COMMAND_NAME.hideBackButton, () => {
      commands.executeCommand(
        "setContext",
        EXTENSION_CONTEXT_NAME.fimManageTemplates,
        false
      )
      commands.executeCommand(
        "setContext",
        EXTENSION_CONTEXT_NAME.fimManageProviders,
        false
      )
      commands.executeCommand(
        "setContext",
        EXTENSION_CONTEXT_NAME.fimEmbeddingsTab,
        false
      )
    }),
    commands.registerCommand(FIM_COMMAND_NAME.settings, () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        EXTENSION_NAME
      )
    }),
    workspace.onDidCloseTextDocument((document) => {
      const filePath = document.uri.fsPath
      fileInteractionCache.endSession()
      fileInteractionCache.delete(filePath)
    }),
    workspace.onDidOpenTextDocument((document) => {
      const filePath = document.uri.fsPath
      fileInteractionCache.startSession(filePath)
      fileInteractionCache.incrementVisits()
    }),
    workspace.onDidChangeTextDocument((e) => {
      const changes = e.contentChanges[0]
      if (!changes) return
      const lastCompletion = completionProvider.lastCompletionText
      const isLastCompletionMultiline = getLineBreakCount(lastCompletion) > 1
      completionProvider.setAcceptedLastCompletion(
        !!(
          changes.text &&
          lastCompletion &&
          changes.text === lastCompletion &&
          isLastCompletionMultiline
        )
      )
      const currentLine = changes.range.start.line
      const currentCharacter = changes.range.start.character
      fileInteractionCache.incrementStrokes(currentLine, currentCharacter)
    }),
    window.registerWebviewViewProvider("fim.sidebar", sidebarProvider),
    statusBarItem
  )

  window.onDidChangeTextEditorSelection(() => {
    completionProvider.abortCompletion()
    delayExecution(() => {
      completionProvider.setAcceptedLastCompletion(false)
    }, 200)
  })

  if (config.get("enabled")) statusBarItem.show()

  statusBarItem.text = "$(code)"

  logger.log("Fim completion extension activation complete")
}

async function createEmbeddingDatabase(context: ExtensionContext) {
  const workspaceName = sanitizeWorkspaceName(workspace.name)
  if (!workspaceName) return undefined

  const dbDir = path.join(os.homedir(), ".fim/embeddings")
  const dbPath = path.join(dbDir, workspaceName)

  if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true })

  const db = new EmbeddingDatabase(dbPath, context)
  await db.connect()
  return db
}

async function showSidebarTab(
  sidebarProvider: SidebarProvider,
  contextName: string,
  tab: string
) {
  await commands.executeCommand(FIM_COMMAND_NAME.focusSidebar)
  await commands.executeCommand("setContext", contextName, true)
  await sidebarProvider.waitForSidebarReady()
  sidebarProvider.webView?.postMessage({
    type: EVENT_NAME.fimSetTab,
    data: tab
  } as ServerMessage<string>)
}

export function deactivate() {
  logger.log("Fim completion extension deactivated")
}
