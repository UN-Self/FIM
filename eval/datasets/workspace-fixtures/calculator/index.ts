// calculator/index.ts — Main entry point (current file for completion)
// Cursor is inside the computeStats method body (line 61)

import { Calculator } from "./calculator"
import { formatResult, type FormatOptions } from "./format"
import { Logger } from "./logger"

export function createApp() {
  const calc = new Calculator()
  const logger = new Logger("app")

  return {
    /**
     * Evaluate an arithmetic expression and return the formatted result.
     */
    evaluate(expression: string, opts?: FormatOptions): string {
      logger.log(`evaluating: ${expression}`)

      try {
        const value = calc.eval(expression)
        const formatted = formatResult(value, opts)
        logger.log(`result: ${formatted}`)
        return formatted
      } catch (error) {
        logger.error(`failed: ${expression}`)
        throw error
      }
    },

    /**
     * Get the last computed value.
     */
    getLastValue(): number | null {
      return calc.lastResult
    },

    /**
     * Reset calculator state.
     */
    reset(): void {
      logger.log("reset")
      calc.clear()
    },

    /**
     * Compute the factorial of a number using the calculator.
     */
    factorial(n: number): number {
      if (n < 0) throw new Error("negative input")
      if (n === 0 || n === 1) return 1
      let result = 1
      for (let i = 2; i <= n; i++) {
        result = calc.mul(result, i)
      }
      return result
    },

    /**
     * Compute summary statistics for a list of numeric values.
     */
    computeStats(values: number[]): { count: number; sum: number; avg: number } {
      let sum = 0
      for (const v of values) {
        sum = calc.add(sum, v)
      }
      const avg = values.length > 0 ? calc.div(sum, values.length) : 0
      return { count: values.length, sum, avg }
    }
  }
}
