export const ACTIVE_CONVERSATION_STORAGE_KEY = "fim.active-conversation"
export const ACTIVE_CHAT_PROVIDER_STORAGE_KEY = "fim.active-chat-provider"
export const ACTIVE_EMBEDDINGS_PROVIDER_STORAGE_KEY =
  "fim.active-embeddings-provider"
export const ACTIVE_FIM_PROVIDER_STORAGE_KEY = "fim.active-fim-provider"
export const CONVERSATION_STORAGE_KEY = "fim.conversations"
export const INFERENCE_PROVIDERS_STORAGE_KEY = "fim.inference-providers"

export const GLOBAL_STORAGE_KEY = {
  autoConnectSymmetryProvider: "fim.autoConnectSymmetryProvider",
  selectedModel: "fim.selectedModel"
}

export const WORKSPACE_STORAGE_KEY = {
  autoScroll: "autoScroll",
  chatMessage: "chatMessage",
  contextItems: "contextItems", // Renamed from contextFiles
  downloadCancelled: "downloadCancelled",
  selectedTemplates: "selectedTemplates",
  selection: "selection",
  showEmbeddingOptions: "showEmbeddingOptions",
  showProviders: "showProviders",
  reviewOwner: "reviewOwner",
  reviewRepo: "reviewRepo"
}

export const EXTENSION_SETTING_KEY = {
  apiProvider: "apiProvider",
  apiProviderFim: "apiProviderFim",
  chatModelName: "chatModelName",
  fimModelName: "fimModelName"
}
