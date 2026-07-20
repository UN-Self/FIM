import path from "path"

import { ContextAdapter, ContextAdapterInput, ContextIR } from "../types"

interface CodeGraphInstance {
  buildContext(
    query: string,
    options: { maxNodes: number; includeCode: boolean; format: "markdown" }
  ): Promise<string>
  close(): void
  indexAll(options?: { onProgress?: () => void }): Promise<void>
}

interface CodeGraphModule {
  init(workspaceRoot: string): Promise<CodeGraphInstance>
  open(workspaceRoot: string): Promise<CodeGraphInstance>
}

const instances = new Map<string, Promise<CodeGraphInstance>>()

function getCodeGraphModule(): CodeGraphModule {
  try {
    // The vendor is optional outside the CodeGraph matrices.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const loaded = require("@colbymchenry/codegraph")
    return (loaded.default || loaded) as CodeGraphModule
  } catch {
    throw new Error(
      "CodeGraph is not installed. Run `npm install` in eval before using CodeGraph matrices."
    )
  }
}

async function getGraph(workspaceRoot: string): Promise<CodeGraphInstance> {
  const existing = instances.get(workspaceRoot)
  if (existing) return existing

  const graph = (async () => {
    const CodeGraph = getCodeGraphModule()
    try {
      const opened = await CodeGraph.open(workspaceRoot)
      await opened.indexAll()
      return opened
    } catch {
      const created = await CodeGraph.init(workspaceRoot)
      await created.indexAll()
      return created
    }
  })()
  instances.set(workspaceRoot, graph)
  return graph
}

export class CodeGraphContextCollector implements ContextAdapter {
  public readonly name = "codegraph"

  constructor(private readonly maxNodes: number) {}

  async collect(input: ContextAdapterInput): Promise<ContextIR> {
    const graph = await getGraph(input.workspaceRoot)
    const relativePath = path.relative(input.workspaceRoot, input.filePath)
    const query = [
      `Complete code at cursor in ${relativePath}.`,
      "Return the relevant symbols, callers, callees, types, and implementation code.",
      `Code before cursor:\n${input.prefixSuffix.prefix.slice(-2000)}`,
      `Code after cursor:\n${input.prefixSuffix.suffix.slice(0, 600)}`
    ].join("\n\n")
    const text = await graph.buildContext(query, {
      maxNodes: this.maxNodes,
      includeCode: true,
      format: "markdown"
    })

    return {
      chunks: text.trim()
        ? [
            {
              filePath: input.workspaceRoot,
              text,
              reason: "CodeGraph relevant code subgraph"
            }
          ]
        : [],
      tokenEstimate: Math.ceil(text.length / 4),
      source: "codegraph"
    }
  }
}

export function closeCodeGraphInstances() {
  for (const graph of instances.values()) {
    void graph.then((instance) => instance.close())
  }
  instances.clear()
}
