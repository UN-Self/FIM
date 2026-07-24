import * as vscode from "vscode"

export enum LogLevel {
  Error = 0,
  Warn = 1,
  Info = 2,
  Debug = 3,
  Trace = 4
}

const LEVEL_BY_NAME: Record<string, LogLevel> = {
  error: LogLevel.Error,
  warn: LogLevel.Warn,
  warning: LogLevel.Warn,
  info: LogLevel.Info,
  debug: LogLevel.Debug,
  trace: LogLevel.Trace
}

export const parseLogLevel = (name?: string): LogLevel => {
  if (!name) return LogLevel.Info
  return LEVEL_BY_NAME[name.trim().toLowerCase()] ?? LogLevel.Info
}

/** Precedence: explicit setting > env > default Info. */
export const resolveLevel = (setting?: string, env?: string): LogLevel =>
  setting ? parseLogLevel(setting) : parseLogLevel(env)

/** Deep-clone a value, replacing Authorization headers and apiKey fields. */
export const redactSecrets = <T>(value: T): T => {
  if (!value || typeof value !== "object") return value
  if (Array.isArray(value)) {
    return (value as unknown[]).map((item) => redactSecrets(item)) as unknown as T
  }
  const source = value as Record<string, unknown>
  const clone: Record<string, unknown> = { ...source }
  for (const key of Object.keys(clone)) {
    const lower = key.toLowerCase()
    const current = clone[key]
    if (lower === "authorization" && typeof current === "string") {
      clone[key] = "Bearer <redacted>"
    } else if (lower === "apikey") {
      clone[key] = "<redacted>"
    } else if (current && typeof current === "object") {
      clone[key] = redactSecrets(current)
    }
  }
  return clone as T
}

export class Logger {
  private static instance: Logger
  private outputChannel: vscode.OutputChannel
  private level: LogLevel

  private static colorCodes: Record<string, number> = {
    Default: 0,
    FetchError: 91,
    Abort: 90,
    Timeout: 33
  }

  private constructor() {
    this.outputChannel = vscode.window.createOutputChannel("FIM")
    this.level = parseLogLevel(process.env.FIM_LOG_LEVEL)
  }

  public static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger()
    }
    return Logger.instance
  }

  public setLevel(level: LogLevel): void {
    this.level = level
  }

  public getLevel(): LogLevel {
    return this.level
  }

  private shouldEmit(method: LogLevel): boolean {
    return method <= this.level
  }

  private static consoleTag(level: LogLevel): string {
    switch (level) {
      case LogLevel.Error:
        return "[fim:ERROR]"
      case LogLevel.Warn:
        return "[fim:WARN]"
      case LogLevel.Debug:
        return "[fim:DEBUG]"
      case LogLevel.Trace:
        return "[fim:TRACE]"
      default:
        return "[fim]"
    }
  }

  private static channelTag(level: LogLevel): string {
    switch (level) {
      case LogLevel.Error:
        return "[ERROR]"
      case LogLevel.Warn:
        return "[WARN]"
      case LogLevel.Debug:
        return "[DEBUG]"
      case LogLevel.Trace:
        return "[TRACE]"
      default:
        return "[INFO]"
    }
  }

  private emit(level: LogLevel, message: string): void {
    if (!this.shouldEmit(level)) return
    const tag = Logger.consoleTag(level)
    if (level === LogLevel.Error) {
      console.error(`${tag} ${message}`)
    } else {
      console.log(`${tag} ${message}`)
    }
    this.outputChannel.appendLine(`${Logger.channelTag(level)} ${message}`)
  }

  public log = (message: string): void => this.emit(LogLevel.Info, message)
  public info = (message: string): void => this.emit(LogLevel.Info, message)
  public warn = (message: string): void => this.emit(LogLevel.Warn, message)
  public debug = (message: string): void => this.emit(LogLevel.Debug, message)
  public trace = (message: string): void => this.emit(LogLevel.Trace, message)

  public error = (error: Error | string): void => {
    const errorMessage = error instanceof Error ? error.message : error
    this.emit(LogLevel.Error, errorMessage)
  }

  public logError(errorType: string, message: string, error: Error | string) {
    if (!this.shouldEmit(LogLevel.Error)) return
    const colorCode = Logger.colorCodes[errorType] || Logger.colorCodes.Default
    const formattedErrorMessage = this.formatErrorMessage(
      colorCode,
      message,
      error
    )
    console.error(formattedErrorMessage)

    const errorName = error instanceof Error ? error.name : "Unknown Error"
    const errorMessage = error instanceof Error ? error.message : error
    this.outputChannel.appendLine(`[ERROR_${errorType}] ${message}`)
    this.outputChannel.appendLine(`  Error Type: ${errorName}`)
    this.outputChannel.appendLine(`  Error Message: ${errorMessage}`)
  }

  private formatErrorMessage(
    colorCode: number,
    message: string,
    error: Error | string
  ) {
    const errorName = error instanceof Error ? error.name : "Unknown Error"
    const errorMessage = error instanceof Error ? error.message : error
    const coloredMessage = `\x1b[${colorCode}m [ERROR_fim] \x1b[32m Message: ${message} \n \x1b[${colorCode}m Error Type: ${errorName} \n  Error Message: ${errorMessage} \n \x1b[31m`
    return coloredMessage
  }
}

export const logger = Logger.getInstance()
