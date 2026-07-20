// calculator/calculator.ts — Core calculator engine

export class Calculator {
  private _lastResult: number | null = null

  get lastResult(): number | null {
    return this._lastResult
  }

  add(a: number, b: number): number {
    this._lastResult = a + b
    return this._lastResult
  }

  sub(a: number, b: number): number {
    this._lastResult = a - b
    return this._lastResult
  }

  mul(a: number, b: number): number {
    this._lastResult = a * b
    return this._lastResult
  }

  div(a: number, b: number): number {
    if (b === 0) throw new Error("division by zero")
    this._lastResult = a / b
    return this._lastResult
  }

  eval(expression: string): number {
    // Simple two-operand evaluator: "a op b"
    const parts = expression.trim().split(/\s+/)
    if (parts.length !== 3) {
      throw new Error(`invalid expression: "${expression}"`)
    }
    const a = parseFloat(parts[0])
    const op = parts[1]
    const b = parseFloat(parts[2])

    switch (op) {
      case "+": return this.add(a, b)
      case "-": return this.sub(a, b)
      case "*": return this.mul(a, b)
      case "/": return this.div(a, b)
      default: throw new Error(`unknown operator: ${op}`)
    }
  }

  clear(): void {
    this._lastResult = null
  }
}
