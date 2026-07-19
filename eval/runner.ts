import * as fs from "fs"
import * as path from "path"

import { NoopContextCollector } from "./adapters/context/noop"
import { NoopIntentDetector } from "./adapters/intent/noop"
import { AdapterMatrix } from "./adapters/types"
import { runChain } from "./chain"
import { loadConfig } from "./config"
import { loadSamples } from "./datasets/loader"
import { probeCompletion, probeContext, probeIntent, probePrompt } from "./probes"

async function main() {
  const config = loadConfig()
  if (!config.deepseek.apiKey) {
    console.error("ERROR: DEEPSEEK_API_KEY env not set")
    process.exit(1)
  }

  const matrices: AdapterMatrix[] = [
    {
      label: "noop-noop",
      contextAdapter: NoopContextCollector,
      intentAdapter: NoopIntentDetector
    }
  ]

  const samples = loadSamples(config.dataset)
  console.log(`loaded ${samples.length} samples, ${matrices.length} matrices`)

  const results: any[] = []
  for (const sample of samples) {
    for (const matrix of matrices) {
      process.stdout.write(`  ${sample.id} [${matrix.label}]... `)
      try {
        const chainResult = await runChain(sample, matrix, config)
        const completion = chainResult.artifacts.completion
        const completionProbe = await probeCompletion(
          completion.text,
          chainResult.artifacts.model.error,
          chainResult.artifacts.model.latencyMs,
          chainResult.artifacts.prefixSuffix.prefix,
          chainResult.artifacts.prefixSuffix.suffix,
          sample.filePath,
          sample.languageId,
          config
        )
        results.push({
          sampleId: sample.id,
          matrixLabel: matrix.label,
          contextProbe: probeContext(chainResult.artifacts.context),
          intentProbe: probeIntent(chainResult.artifacts.intent),
          promptProbe: probePrompt(chainResult.artifacts.prompt.prompt),
          completionProbe
        })
        console.log(
          `L1=${completionProbe.layer1.hasCompletion ? "✓" : "✗"} ` +
          `L2=${completionProbe.layer2.syntaxValid ? "✓" : "✗"} ` +
          `L3=${completionProbe.layer3.judged ? completionProbe.layer3.score : "skip"}`
        )
      } catch (e) {
        console.log(`FAIL: ${(e as Error).message}`)
        results.push({ sampleId: sample.id, matrixLabel: matrix.label, error: (e as Error).message })
      }
    }
  }

  // 聚合报告
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const reportDir = path.resolve(__dirname, "..", "..", "reports")
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })

  const summary = matrices.map((m) => {
    const matrixResults = results.filter((r) => r.matrixLabel === m.label && !r.error)
    const total = matrixResults.length || 1
    const l1Pass = matrixResults.filter((r) => r.completionProbe?.layer1.hasCompletion).length
    const l2Pass = matrixResults.filter((r) => r.completionProbe?.layer2.syntaxValid).length
    const judged = matrixResults.filter((r) => r.completionProbe?.layer3.judged)
    const l3Avg = judged.length
      ? judged.reduce((s, r) => s + r.completionProbe.layer3.score, 0) / judged.length
      : 0
    const latencies = matrixResults.map((r) => r.completionProbe?.layer1.latencyMs || 0)
    const avgLatency = latencies.reduce((s, l) => s + l, 0) / total
    return {
      matrix: m.label,
      l1Rate: `${Math.round((l1Pass / total) * 100)}%`,
      l2Rate: `${Math.round((l2Pass / total) * 100)}%`,
      l3Avg: l3Avg.toFixed(1),
      avgLatencyMs: Math.round(avgLatency),
      samples: matrixResults.length
    }
  })

  // JSON
  fs.writeFileSync(
    path.join(reportDir, `${timestamp}.json`),
    JSON.stringify({ timestamp, results, summary }, null, 2)
  )

  // Markdown
  const md = [
    `# Eval Report ${timestamp}`,
    ``,
    `| matrix | L1通过率 | L2通过率 | L3均分 | 平均延迟 | 样本数 |`,
    `|--------|---------|---------|--------|---------|--------|`,
    ...summary.map((s) =>
      `| ${s.matrix} | ${s.l1Rate} | ${s.l2Rate} | ${s.l3Avg} | ${s.avgLatencyMs}ms | ${s.samples} |`
    )
  ].join("\n")
  fs.writeFileSync(path.join(reportDir, `${timestamp}.md`), md)

  console.log(`\nreport: ${path.join(reportDir, `${timestamp}.md`)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
