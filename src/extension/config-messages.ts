import { EVENT_NAME } from "../common/constants"
import { ServerMessage } from "../common/types"

export const getMessagesForConfigUpdate = (
  key: string,
  value: unknown
): ServerMessage[] => {
  if (key !== "locale") return []
  if (typeof value !== "string") return []

  return [
    {
      type: EVENT_NAME.fimSetLocale,
      data: value
    }
  ]
}
