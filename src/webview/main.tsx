import { useEffect, useState } from "react"

import "./i18n"

import { EVENT_NAME, WEBUI_TABS } from "../common/constants"
import { ServerMessage } from "../common/types"

import { useLocale } from "./hooks/useLocale"
import { EmbeddingOptions } from "./embedding-options"
import { Providers } from "./providers"
import { Settings } from "./settings"

const tabs: Record<string, JSX.Element> = {
  [WEBUI_TABS.settings]: <Settings />,
  [WEBUI_TABS.providers]: <Providers />,
  [WEBUI_TABS.embeddings]: <EmbeddingOptions />
}

export const Main = () => {
  const [tab, setTab] = useState<string | undefined>(WEBUI_TABS.settings)
  const { locale, renderKey } = useLocale()

  const handler = (event: MessageEvent) => {
    const message: ServerMessage<string | undefined> = event.data
    if (message?.type === EVENT_NAME.fimSetTab) {
      setTab(message?.data)
    }
    return () => window.removeEventListener("message", handler)
  }
  useEffect(() => {
    window.addEventListener("message", handler)
  }, [])

  if (!tab) {
    return null
  }

  const element: JSX.Element = tabs[tab]

  return (
    <div key={renderKey} data-locale={locale}>
      {element}
    </div>
  )
}
