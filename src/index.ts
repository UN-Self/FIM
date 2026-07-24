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
  FIM_COMMAND_NAME,
  WEBUI_TABS
} from "./common/constants"
import { logger, resolveLevel } from "./common/logger"
import { ServerMessage } from "./common/types"
import { setContext } from "./extension/context"
import { EngineAdapter, isEngineEnabled } from "./extension/engine-adapter"
import { FileInteractionCache } from "./extension/file-interaction"
import { CompletionProvider } from "./extension/providers/completion"
import { SidebarProvider } from "./extension/providers/sidebar"
import { delayExecution } from "./extension/utils"
import { getLineBreakCount } from "./webview/utils"

// Module-level reference so deactivate() can clean up the engine.
let _engineAdapter: EngineAdapter | null = null

export async function activate(context: ExtensionContext) {
  setContext(context)
  const config = workspace.getConfiguration("fim")

  const applyLogLevel = () => {
    // Re-fetch on each call so a live `fim.logLevel` change applies without a window reload.
    const cfg = workspace.getConfiguration("fim")
    logger.setLevel(
      resolveLevel(cfg.get<string>("logLevel"), process.env.FIM_LOG_LEVEL)
    )
  }
  applyLogLevel()

  const statusBarItem = window.createStatusBarItem(StatusBarAlignment.Right)

  logger.log("Fim completion extension starting")

  const fileInteractionCache = new FileInteractionCache()
  const sidebarProvider = new SidebarProvider(statusBarItem, context)

  const completionProvider = new CompletionProvider(
    statusBarItem,
    fileInteractionCache,
    context
  )

  // ---- Engine lifecycle (opt-in, gated by FIM_USE_ENGINE or fim.useEngine) ----
  // The engine adapter bridges VS Code <-> Engine core. It is the ONLY place
  // that imports from both "vscode" and @fim/engine-ts.
  // Initialization failure is non-fatal — the extension falls back to the
  // existing completion path.
  if (isEngineEnabled(config)) {
    try {
      _engineAdapter = new EngineAdapter({
        debounceWait: config.get<number>("debounceWait", 300),
        timeoutMs: 60_000,
        // Phase 3-4 not yet integrated — these stay off until eval v2 validates them
        enableIntentPlanner: false
      })
      completionProvider.setEngineAdapter(_engineAdapter)
      logger.log("Engine path enabled")
    } catch (error) {
      logger.error(`Failed to initialize engine adapter: ${error}`)
    }
  }

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
      completionProvider.abortCompletion()
      sidebarProvider.destroyStream()
    }),
    commands.registerCommand(FIM_COMMAND_NAME.manageProviders, async () => {
      await showSidebarTab(
        sidebarProvider,
        EXTENSION_CONTEXT_NAME.fimManageProviders,
        WEBUI_TABS.providers
      )
    }),
    commands.registerCommand(FIM_COMMAND_NAME.hideBackButton, () => {
      commands.executeCommand(
        "setContext",
        EXTENSION_CONTEXT_NAME.fimManageProviders,
        false
      )
    }),
    commands.registerCommand(FIM_COMMAND_NAME.settings, () => {
      vscode.commands.executeCommand("workbench.view.extension.fim-sidebar-view")
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
    workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("fim.logLevel")) applyLogLevel()
    }),
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
  if (_engineAdapter) {
    _engineAdapter.cancel()
  }
  logger.log("Fim completion extension deactivated")
}
