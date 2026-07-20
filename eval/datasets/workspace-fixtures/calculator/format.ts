// calculator/format.ts — Result formatting utilities

export interface FormatOptions {
  precision?: number
  locale?: string
  currency?: string
}

const DEFAULT_OPTIONS: FormatOptions = {
  precision: 2,
  locale: "en-US"
}

export function formatResult(value: number, opts?: FormatOptions): string {
  const resolved = { ...DEFAULT_OPTIONS, ...opts }

  if (resolved.currency) {
    return new Intl.NumberFormat(resolved.locale, {
      style: "currency",
      currency: resolved.currency,
      minimumFractionDigits: resolved.precision,
      maximumFractionDigits: resolved.precision
    }).format(value)
  }

  return new Intl.NumberFormat(resolved.locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: resolved.precision
  }).format(value)
}
