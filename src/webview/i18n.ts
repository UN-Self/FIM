import { initReactI18next } from "react-i18next"
import i18n from "i18next"

import en from "./assets/locales/en.json"
import zhCN from "./assets/locales/zh-CN.json"

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN }
  },
  detection: {
    order: ["localStorage"],
    availableLanguages: ["en", "zh-CN"]
  }
})

export default i18n
