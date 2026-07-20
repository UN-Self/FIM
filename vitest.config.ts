import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "src/test/__mocks__/vscode.ts"),
      "@fim/protocol": path.resolve(__dirname, "packages/protocol/dist")
    }
  },
  test: {
    globals: false,
    include: ["src/test/**/*.test.ts"],
    environment: "node",
    mockReset: false,
    restoreMocks: false
  }
})
