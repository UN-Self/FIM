require("./stub/register")
import * as fs from "fs"
import * as path from "path"

import { NoopContextCollector } from "./adapters/context/noop"
import { CodeGraphContextCollector, closeCodeGraphInstances } from "./adapters/context/codegraph"
import { DeepSeekIntentPlanner } from "./adapters/intent/deepseek"
import { NoopIntentDetector } from "./adapters/intent/noop"
import { AdapterMatrix } from "./adapters/types"
import { runChain, runChainV2 } from "./chain"
import { loadConfig } from "./config"
import { loadSamples } from "./datasets/loader"
import { loadWorkspaceFixtures } from "./datasets/workspace-loader"
import { evalGraph, evalContext, evalPlanning, computeSuffixAlignment, computeDuplicationRate, checkBracketBalance, GraphMetrics, ContextMetrics, PlanningMetrics } from "./metrics"
import { probeCompletion, probeContext, probeIntent, probePrompt } from "./probes"

async function main() {
  const config = loadConfig()
  if (!config.deepseek.apiKey) {
    console.error("ERROR: DEEPSEEK_API_KEY env not set")
    process.exit(1)
  }

  // Load workspace fixtures (Phase 6)
  const fixtureData = loadWorkspaceFixtures()
  if (fixtureData.fixtures.length > 0) {
    console.log(`loaded ${fixtureData.fixtures.length} workspace fixtures`)
  }

  // Build a lookup: sampleId → WorkspaceFixture
  const fixtureMap = new Map(
    fixtureData.fixtures.map((f) => [`ws-${f.workspace}`, f])
  )

  // ---- Build matrices -------------------------------------------------------
  const matrices: AdapterMatrix[] = []

  if (config.matrices.includes("baseline")) {
    matrices.push({
      label: "baseline-fim",
      contextAdapter: NoopContextCollector,
      intentAdapter: NoopIntentDetector
    })
  }
  if (config.matrices.includes("codegraph")) {
    matrices.push({
      label: "codegraph-context-fim",
      contextAdapter: new CodeGraphContextCollector(config.codegraph.maxNodes),
      intentAdapter: NoopIntentDetector
    })
  }
  if (config.matrices.includes("codegraph-planner")) {
    matrices.push({
      label: "codegraph-planner-fim",
      contextAdapter: new CodeGraphContextCollector(config.codegraph.maxNodes),
      intentAdapter: new DeepSeekIntentPlanner(config.planner)
    })
  }
  // Phase 6: codegraph-planner-direct-writer matrix
  // DirectWriter is not yet implemented in engine-ts; this matrix uses the
  // same planner pipeline but marks itself for future Direct Writer evaluation.
  if (config.matrices.includes("codegraph-planner-direct-writer")) {
    matrices.push({
      label: "codegraph-planner-direct-writer",
      contextAdapter: new CodeGraphContextCollector(config.codegraph.maxNodes),
      intentAdapter: new DeepSeekIntentPlanner(config.planner)
    })
  }

  const samples = loadSamples(config.dataset, fixtureData.samples)
  const chainLabel = config.useEngineChain ? "ChainV2" : "ChainV1"
  console.log(
    `loaded ${samples.length} samples, ${matrices.length} matrices [${chainLabel}]`
  )

  // ---- Run chains -----------------------------------------------------------
  const results: any[] = []
  const v2MetricsResults: Array<{
    sampleId: string
    matrixLabel: string
    graph?: GraphMetrics
    context?: ContextMetrics
    planning: PlanningMetrics
    hasCompletion: boolean
    syntaxPass: boolean
    suffixAlignmentScore: number
    duplicationRate: number
    totalLatencyMs: number
  }> = []

  for (const sample of samples) {
    for (const matrix of matrices) {
      process.stdout.write(`  ${sample.id} [${matrix.label}]... `)
      try {
        // Select chain version
        const chainResult = config.useEngineChain
          ? await runChainV2(sample, matrix, config)
          : await runChain(sample, matrix, config)

        const artifacts = chainResult.artifacts
        const completion = artifacts.completion
        const completionProbe = await probeCompletion(
          completion.text,
          artifacts.model.error,
          artifacts.model.latencyMs,
          artifacts.prefixSuffix.prefix,
          artifacts.prefixSuffix.suffix,
          sample.filePath,
          sample.languageId,
          config
        )

        results.push({
          sampleId: sample.id,
          matrixLabel: matrix.label,
          contextProbe: probeContext(artifacts.context),
          intentProbe: probeIntent(
            artifacts.intent,
            sample.expectedIntent
          ),
          promptProbe: {
            ...probePrompt(artifacts.prompt.prompt),
            suffixLength: artifacts.prompt.suffix.length,
            suffixPreview: artifacts.prompt.suffix.slice(0, 80)
          },
          completionProbe
        })

        // Compute V2 metrics when using ChainV2
        if (config.useEngineChain) {
          const fixture = fixtureMap.get(sample.id)
          const assembly = artifacts.assembly
          const evidence = (assembly?.evidence ?? []) as any[]
          const chunks = (assembly?.chunks ?? []) as any[]
          const plan = artifacts.intentPlan
          const validation = artifacts.planValidation

          const graph = assembly && fixture
            ? evalGraph(evidence, fixture.expectedGraphEvidence, 0, [])
            : undefined
          const context = assembly && fixture
            ? evalContext(chunks, assembly.tokenEstimate, fixture.expectedGraphEvidence)
            : undefined
          const planning = evalPlanning(
            plan, validation ? { valid: validation.valid, errors: validation.errors } : undefined,
            sample.expectedIntent
          )
          const hasCompletion = artifacts.completion.text.trim().length > 0
          const syntaxPass = checkBracketBalance(artifacts.completion.text)
          const suffixAlignmentScore = computeSuffixAlignment(artifacts.completion.text.trimEnd(), artifacts.prompt.suffix)
          const duplicationRate = computeDuplicationRate(artifacts.completion.text, artifacts.prompt.suffix)

          v2MetricsResults.push({
            sampleId: sample.id, matrixLabel: matrix.label,
            graph, context, planning,
            hasCompletion, syntaxPass, suffixAlignmentScore, duplicationRate,
            totalLatencyMs: artifacts.model.latencyMs
          })
        }

        console.log(
          `L1=${completionProbe.layer1.hasCompletion ? "Y" : "N"} ` +
          `L2=${completionProbe.layer2.syntaxValid ? "Y" : "N"} ` +
          `L3=${completionProbe.layer3.judged ? completionProbe.layer3.score : "skip"}`
        )
      } catch (e) {
        console.log(`FAIL: ${(e as Error).message}`)
        results.push({ sampleId: sample.id, matrixLabel: matrix.label, error: (e as Error).message })
      }
    }
  }

  // ---- Aggregate reports ----------------------------------------------------
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-")
  const reportDir = path.resolve(__dirname, "..", "..", "reports")
  if (!fs.existsSync(reportDir)) fs.mkdirSync(reportDir, { recursive: true })

  // L1/L2/L3 summary (unchanged)
  const summary = matrices.map((m) => {
    const matrixResults = results.filter((r) => r.matrixLabel === m.label && !r.error)
    const total = matrixResults.length || 1
    const l1Pass = matrixResults.filter((r) => r.completionProbe?.layer1.hasCompletion).length
    const noCompletion = total - l1Pass
    const completions = matrixResults.filter((r) => r.completionProbe?.layer1.hasCompletion)
    const l2Total = completions.length || 1
    const l2Pass = completions.filter((r) => r.completionProbe?.layer2.syntaxValid).length
    const judged = completions.filter((r) => r.completionProbe?.layer3.judged)
    const l3Avg = judged.length
      ? judged.reduce((s, r) => s + r.completionProbe.layer3.score, 0) / judged.length
      : 0
    const latencies = matrixResults.map((r) => r.completionProbe?.layer1.latencyMs || 0)
    const avgLatency = latencies.reduce((s, l) => s + l, 0) / total
    const intentResults = matrixResults.filter((r) => r.intentProbe?.expectedIntent)
    const intentMatches = intentResults.filter((r) => r.intentProbe.matchesExpected).length
    const avgContextTokens = matrixResults.reduce(
      (sum, result) => sum + (result.contextProbe?.tokenEstimate || 0),
      0
    ) / total
    return {
      matrix: m.label,
      l1Rate: `${Math.round((l1Pass / total) * 100)}%`,
      l2Rate: `${Math.round((l2Pass / l2Total) * 100)}%`,
      l3Avg: l3Avg.toFixed(1),
      noCompletion,
      avgLatencyMs: Math.round(avgLatency),
      intentRate: intentResults.length
        ? `${Math.round((intentMatches / intentResults.length) * 100)}%`
        : "n/a",
      avgContextTokens: Math.round(avgContextTokens),
      samples: matrixResults.length
    }
  })

  // V2 metrics summary (Phase 6) — uses layer4_graph, layer5_context, layer6_planning
  let v2Summary: any[] = []
  if (config.useEngineChain) {
    v2Summary = matrices.map((m) => {
      const mResults = v2MetricsResults.filter((r) => r.matrixLabel === m.label)
      const total = mResults.length || 1

      const avgIntentF1 = mResults.reduce((s, r) => s + r.planning.intentF1, 0) / total
      const intentMatches = mResults.filter((r) => r.planning.intentMatch).length
      const avgCalibration = mResults.reduce((s, r) => s + r.planning.calibrationError, 0) / total
      const fallbackCount = mResults.filter((r) => r.planning.invalidPlanFallback).length

      const hasCompletionCount = mResults.filter((r) => r.hasCompletion).length
      const syntaxPassCount = mResults.filter((r) => r.syntaxPass).length
      const avgSuffixAlignment = mResults.reduce((s, r) => s + r.suffixAlignmentScore, 0) / total
      const avgDuplication = mResults.reduce((s, r) => s + r.duplicationRate, 0) / total

      const avgLatency = mResults.reduce((s, r) => s + r.totalLatencyMs, 0) / total
      const acceptanceRate = mResults.filter((r) => r.hasCompletion).length / total

      const graphResults = mResults.filter((r) => r.graph)
      const contextResults = mResults.filter((r) => r.context)
      const avgFreshness = graphResults.length
        ? graphResults.reduce((s, r) => s + r.graph!.freshnessRatio, 0) / graphResults.length
        : undefined
      const avgSymbolRecall = contextResults.length
        ? contextResults.reduce((s, r) => s + r.context!.symbolRecall, 0) / contextResults.length
        : undefined
      const avgFileRecall = contextResults.length
        ? contextResults.reduce((s, r) => s + r.context!.fileRecall, 0) / contextResults.length
        : undefined

      return {
        matrix: m.label,
        // Planning
        intentF1: avgIntentF1.toFixed(3),
        intentMatches: `${intentMatches}/${total}`,
        calibrationError: avgCalibration.toFixed(3),
        fallbackCount,
        // Writer
        hasCompletion: hasCompletionCount,
        syntaxPass: syntaxPassCount,
        suffixAlignment: avgSuffixAlignment.toFixed(3),
        duplicationRate: avgDuplication.toFixed(3),
        // Product
        avgLatencyMs: Math.round(avgLatency),
        acceptanceRate: `${Math.round(acceptanceRate * 100)}%`,
        // Graph (only for codegraph matrices)
        ...(avgFreshness !== undefined ? { freshnessRatio: avgFreshness.toFixed(3) } : {}),
        // Context (only for codegraph matrices)
        ...(avgSymbolRecall !== undefined ? { symbolRecall: avgSymbolRecall.toFixed(3) } : {}),
        ...(avgFileRecall !== undefined ? { fileRecall: avgFileRecall.toFixed(3) } : {}),
        samples: total
      }
    })
  }

  // ---- Write reports --------------------------------------------------------

  // JSON report
  const reportJson: any = {
    timestamp,
    chainVersion: config.useEngineChain ? "v2" : "v1",
    results,
    summary
  }
  if (config.useEngineChain) {
    reportJson.v2Metrics = v2MetricsResults
    reportJson.v2Summary = v2Summary
  }
  fs.writeFileSync(
    path.join(reportDir, `${timestamp}.json`),
    JSON.stringify(reportJson, null, 2)
  )

  // Markdown report
  const mdLines: string[] = [
    `# Eval Report ${timestamp}`,
    `Chain: ${chainLabel}`,
    "",
    "## L1/L2/L3 Metrics",
    "",
    "| matrix | L1 Rate | L2 Rate | L3 Avg | No Compl | Intent | Ctx Tokens | Avg Latency | Samples |",
    "|--------|---------|---------|--------|----------|--------|------------|-------------|---------|",
    ...summary.map((s) =>
      `| ${s.matrix} | ${s.l1Rate} | ${s.l2Rate} | ${s.l3Avg} | ${s.noCompletion} | ${s.intentRate} | ${s.avgContextTokens} | ${s.avgLatencyMs}ms | ${s.samples} |`
    )
  ]

  if (config.useEngineChain && v2Summary.length > 0) {
    mdLines.push(
      "",
      "## V2 Metrics (Phase 6)",
      "",
      "| matrix | Intent F1 | Intent Hits | Calib Err | Fallbacks | Has Compl | Syntax Pass | Suffix Align | Dup Rate | Avg Lat | Accept | Samples |",
      "|--------|-----------|-------------|-----------|-----------|-----------|-------------|--------------|----------|---------|--------|---------|",
      ...v2Summary.map((s) => {
        const cols = [
          s.matrix, s.intentF1, s.intentMatches, s.calibrationError,
          s.fallbackCount, s.hasCompletion, s.syntaxPass,
          s.suffixAlignment, s.duplicationRate,
          `${s.avgLatencyMs}ms`, s.acceptanceRate, s.samples
        ]
        return `| ${cols.join(" | ")} |`
      })
    )

    // Graph/Context details for matrices that have them
    const graphMatrices = v2Summary.filter((s) => s.freshnessRatio !== undefined)
    if (graphMatrices.length > 0) {
      mdLines.push(
        "",
        "### Graph Metrics",
        "",
        "| matrix | Freshness | Symbol Recall | File Recall | Samples |",
        "|--------|-----------|---------------|-------------|---------|",
        ...graphMatrices.map((s) =>
          `| ${s.matrix} | ${s.freshnessRatio} | ${s.symbolRecall} | ${s.fileRecall} | ${s.samples} |`
        )
      )
    }
  }

  fs.writeFileSync(path.join(reportDir, `${timestamp}.md`), mdLines.join("\n"))

  // Cleanup
  closeCodeGraphInstances()
  console.log(`\nreport: ${path.join(reportDir, `${timestamp}.md`)}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
