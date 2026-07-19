export const EVENT_NAME = {
  fimGetLocale: "fim-get-locale",
  fimAcceptSolution: "fim-accept-solution",
  fimAddMessage: "fim-add-message",
  fimChat: "fim-chat",
  fimChatMessage: "fim-chat-message",
  fimClickSuggestion: "fim-click-suggestion",
  fimConnectedToSymmetry: "fim-connected-to-symmetry",
  fimConnectSymmetry: "fim-connect-symmetry",
  fimDisconnectedFromSymmetry: "fim-disconnected-from-symmetry",
  fimDisconnectSymmetry: "fim-disconnect-symmetry",
  fimEmbedDocuments: "fim-embed-documents",
  fimEnableModelDownload: "fim-enable-model-download",
  fimFileListRequest: "fim-file-list-request",
  fimFileListResponse: "fim-file-list-response",
  fimGetConfigValue: "fim-get-config-value",
  fimGetAllConfigValues: "fim-get-all-config-values",
  fimGetGitChanges: "fim-get-git-changes",
  fimGetWorkspaceContext: "fim-workspace-context",
  fimGithhubReview: "fim-githhub-review",
  fimGlobalContext: "fim-global-context",
  fimHideBackButton: "fim-hide-back-button",
  fimNewConversation: "fim-new-conversation",
  fimNewDocument: "fim-new-document",
  fimNotification: "fim-notification",
  fimOnCompletion: "fim-on-completion",
  fimOnLoading: "fim-on-loading",
  fimOpenDiff: "fim-open-diff",
  fimOpenFile: "fim-open-file",
  fimRerankThresholdChanged: "fim-rerank-threshold-changed",
  fimSendLanguage: "fim-send-language",
  fimSendLoader: "fim-send-loader",
  fimSendRequestBody: "fim-send-request-body",
  fimSendSymmetryMessage: "fim-send-symmetry-message",
  fimSendSystemMessage: "fim-send-system-message",
  fimSendTheme: "fim-send-theme",
  fimSessionContext: "fim-session-context",
  fimSetConfigValue: "fim-set-config-value",
  fimSetConfigValueResult: "fim-set-config-value-result",
  fimSidebarReady: "fim-sidebar-ready",
  fimSetGlobalContext: "fim-set-global-context",
  fimSetLocale: "fim-set-locale",
  fimSetSessionContext: "fim-set-session-context",
  fimSetTab: "fim-set-tab",
  fimSetWorkspaceContext: "fim-set-workspace-context",
  fimStartSymmetryProvider: "fim-start-symmetry-provider",
  fimStopGeneration: "fim-stop-generation",
  fimStopSymmetryProvider: "fim-stop-symmetry-provider",
  fimSymmetryModels: "fim-symmetry-models",
  fimGetSymmetryModels: "fim-get-symmetry-models",
  fimTextSelection: "fim-text-selection",
  fimGetModels: "fim-get-models",
  fimUpdateContextItems: "fim-update-context-items",
  fimGetContextItems: "fim-get-context-items",
  fimRemoveContextItem: "fim-remove-context-item"
}

export const CONVERSATION_EVENT_NAME = {
  clearAllConversations: "fim.clear-all-conversations",
  getActiveConversation: "fim.get-active-conversation",
  getConversations: "fim.get-conversations",
  removeConversation: "fim.remove-conversation",
  saveConversation: "fim.save-conversation",
  saveLastConversation: "fim.save-last-conversation",
  setActiveConversation: "fim.set-active-conversation"
}

export const PROVIDER_EVENT_NAME = {
  addProvider: "fim.add-provider",
  copyProvider: "fim.copy-provider",
  focusProviderTab: "fim.focus-provider-tab",
  getActiveChatProvider: "fim.get-active-provider",
  getActiveEmbeddingsProvider: "fim.get-active-embeddings-provider",
  getActiveFimProvider: "fim.get-active-fim-provider",
  getAllProviders: "fim.get-providers",
  removeProvider: "fim.remove-provider",
  resetProvidersToDefaults: "fim.reset-providers-to-defaults",
  exportProviders: "fim.export-providers",
  importProviders: "fim.import-providers",
  setActiveChatProvider: "fim.set-active-chat-provider",
  setActiveEmbeddingsProvider: "fim.set-active-embeddings-provider",
  setActiveFimProvider: "fim.set-active-fim-provider",
  updateProvider: "fim.update-provider",
  testProvider: "fim.test-provider",
  testProviderResult: "fim.test-provider-result",
  updateProviderResult: "fim.update-provider-result"
}

export const GITHUB_EVENT_NAME = {
  getPullRequests: "github.getPullRequests",
  getPullRequestReview: "github.getPullRequestReview"
}

export const SYMMETRY_EMITTER_KEY = {
  inference: "inference"
}
