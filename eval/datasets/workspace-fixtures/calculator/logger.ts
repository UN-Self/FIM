// calculator/logger.ts — Simple tagged logger

export class Logger {
  constructor(private tag: string) {}

  log(message: string): void {
    console.log(`[${this.tag}] ${message}`)
  }

  error(message: string): void {
    console.error(`[${this.tag}] ERROR: ${message}`)
  }

  warn(message: string): void {
    console.warn(`[${this.tag}] WARN: ${message}`)
  }
}
