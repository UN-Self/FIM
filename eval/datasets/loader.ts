import * as fs from "fs"
import * as path from "path"
import { Sample } from "./types"
import { getSyntheticSamples } from "./synthetic/cases"

// 真实快照：从 FIM 仓库 src/ 切样本。光标位置人造（函数体空行/行尾）。
const fimSelfSnapshots: Sample[] = [
  {
    id: "fim-self-completion-ondata",
    source: "fim-self",
    // FIM 自己的 completion.ts，光标放在 onData 方法体内某行尾
    filePath: path.resolve(__dirname, "..", "..", "..", "src", "extension", "providers", "completion.ts"),
    cursor: { line: 260, character: 0 },
    languageId: "typescript"
  },
  {
    id: "fim-self-utils-getprefix",
    source: "fim-self",
    filePath: path.resolve(__dirname, "..", "..", "..", "src", "extension", "utils.ts"),
    cursor: { line: 190, character: 0 },
    languageId: "typescript"
  }
]

export function loadSamples(source: "synthetic" | "fim-self" | "all"): Sample[] {
  const synthetic = source === "fim-self" ? [] : getSyntheticSamples()
  const fimSelf = source === "synthetic" ? [] : fimSelfSnapshots.filter((s) => fs.existsSync(s.filePath))
  return [...synthetic, ...fimSelf]
}
