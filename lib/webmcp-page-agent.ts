/**
 * In-page WebMCP Page Agent.
 * Dual path:
 *  1) Browser WebMCP: document|navigator.modelContext.getTools / executeTool
 *  2) Local registry: always available without Chrome origin trial
 */

import { previewLedgerResult, reportAgentLedger } from "@/lib/agent-ledger"
import { readVisitorAgentSession } from "@/lib/agent-session"

export type WebMcpToolTextResult = {
    content: Array<{ type: "text"; text: string }>
}

export type WebMcpPageToolDef = {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    annotations?: Record<string, unknown>
    execute: (input: Record<string, unknown>) => WebMcpToolTextResult | Promise<WebMcpToolTextResult> | unknown
}

export type WebMcpListedTool = {
    name: string
    description: string
    inputSchema: Record<string, unknown>
    annotations?: Record<string, unknown>
    source: "browser" | "local"
    browserHandle?: unknown
}

type ModelContextAPI = {
    registerTool?: (tool: {
        name: string
        description: string
        inputSchema: Record<string, unknown>
        annotations?: Record<string, unknown>
        execute: (input: Record<string, unknown>) => unknown
    }) => void | Promise<void>
    unregisterTool?: (name: string) => void
    getTools?: (opts?: { fromOrigins?: string[] }) => Promise<
        Array<{
            name: string
            description?: string
            inputSchema?: string | Record<string, unknown>
            annotations?: Record<string, unknown>
            origin?: string
        }>
    >
    executeTool?: (tool: unknown, argsJson: string, opts?: { signal?: AbortSignal }) => Promise<unknown>
}

declare global {
    interface Window {
        __geodesicsWebMcpPageRegistry?: Map<string, WebMcpPageToolDef>
        __geodesicsExecuteTool?: (
            name: string,
            args: Record<string, unknown> | string
        ) => Promise<{ ok: boolean; name: string; text: string; raw?: unknown }>
        __geodesicsListTools?: () => Promise<WebMcpListedTool[]>
    }
    interface Document {
        modelContext?: ModelContextAPI
    }
    interface Navigator {
        modelContext?: ModelContextAPI
    }
}

function getRegistry(): Map<string, WebMcpPageToolDef> {
    if (typeof window === "undefined") return new Map()
    if (!window.__geodesicsWebMcpPageRegistry) {
        window.__geodesicsWebMcpPageRegistry = new Map()
    }
    return window.__geodesicsWebMcpPageRegistry
}

export function getWebMcpModelContext(): ModelContextAPI | null {
    if (typeof window === "undefined") return null
    return document.modelContext ?? navigator.modelContext ?? null
}

export function isWebMcpBrowserApiAvailable(): boolean {
    const mc = getWebMcpModelContext()
    return !!(mc && typeof mc.registerTool === "function")
}

export function toWebMcpToolText(payload: unknown): WebMcpToolTextResult {
    const text = typeof payload === "string" ? payload : JSON.stringify(payload ?? null, null, 2)
    return { content: [{ type: "text", text }] }
}

function parseInputSchema(raw: string | Record<string, unknown> | undefined): Record<string, unknown> {
    if (!raw) return { type: "object", properties: {} }
    if (typeof raw === "object") return raw
    try {
        const parsed = JSON.parse(raw) as Record<string, unknown>
        return parsed && typeof parsed === "object" ? parsed : { type: "object", properties: {} }
    } catch {
        return { type: "object", properties: {} }
    }
}

function wrapToolWithLedger(tool: WebMcpPageToolDef): WebMcpPageToolDef {
    return {
        ...tool,
        execute: async (input) => {
            const started = Date.now()
            const actor = readVisitorAgentSession()?.identifier ?? "anonymous"
            try {
                const result = await tool.execute(input ?? {})
                reportAgentLedger({
                    actor,
                    action: "webmcp.tool",
                    tool: tool.name,
                    ok: true,
                    duration_ms: Date.now() - started,
                    args: (input ?? {}) as Record<string, unknown>,
                    preview: previewLedgerResult(result),
                })
                return result
            } catch (error) {
                reportAgentLedger({
                    actor,
                    action: "webmcp.tool",
                    tool: tool.name,
                    ok: false,
                    duration_ms: Date.now() - started,
                    args: (input ?? {}) as Record<string, unknown>,
                    preview: error instanceof Error ? error.message : String(error),
                })
                throw error
            }
        },
    }
}

export function registerPageWebMcpTool(tool: WebMcpPageToolDef, opts?: { mirrorToBrowser?: boolean }): void {
    if (typeof window === "undefined") return
    const wrapped = wrapToolWithLedger(tool)
    getRegistry().set(tool.name, wrapped)

    if (opts?.mirrorToBrowser === false) return
    const mc = getWebMcpModelContext()
    if (!mc?.registerTool) return
    try {
        mc.unregisterTool?.(tool.name)
    } catch {
        /* ignore */
    }
    try {
        void Promise.resolve(
            mc.registerTool({
                name: wrapped.name,
                description: wrapped.description,
                inputSchema: wrapped.inputSchema,
                annotations: wrapped.annotations,
                execute: async (input) => {
                    const result = await wrapped.execute(input ?? {})
                    if (
                        result &&
                        typeof result === "object" &&
                        Array.isArray((result as WebMcpToolTextResult).content)
                    ) {
                        return result
                    }
                    return toWebMcpToolText(result)
                },
            })
        ).catch(() => {
            /* Duplicate tool name / OT shape */
        })
    } catch {
        /* browser API shape may vary during OT */
    }
}

export async function listPageWebMcpTools(): Promise<WebMcpListedTool[]> {
    if (typeof window === "undefined") return []
    const byName = new Map<string, WebMcpListedTool>()

    for (const tool of getRegistry().values()) {
        byName.set(tool.name, {
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
            annotations: tool.annotations,
            source: "local",
        })
    }

    const mc = getWebMcpModelContext()
    if (mc?.getTools) {
        try {
            const browserTools = await mc.getTools()
            for (const t of browserTools ?? []) {
                if (!t?.name) continue
                byName.set(t.name, {
                    name: t.name,
                    description: t.description ?? byName.get(t.name)?.description ?? t.name,
                    inputSchema: parseInputSchema(t.inputSchema) ??
                        byName.get(t.name)?.inputSchema ?? { type: "object", properties: {} },
                    annotations: t.annotations ?? byName.get(t.name)?.annotations,
                    source: "browser",
                    browserHandle: t,
                })
            }
        } catch {
            /* getTools may be unavailable */
        }
    }

    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name))
}

function extractToolResultText(result: unknown): string {
    if (result == null) return "null"
    if (typeof result === "string") return result
    if (typeof result === "object" && Array.isArray((result as WebMcpToolTextResult).content)) {
        return (result as WebMcpToolTextResult).content
            .map((c) => c.text)
            .filter(Boolean)
            .join("\n")
    }
    try {
        return JSON.stringify(result, null, 2)
    } catch {
        return String(result)
    }
}

export async function executePageWebMcpTool(
    name: string,
    args: Record<string, unknown> | string
): Promise<{ ok: boolean; name: string; text: string; raw?: unknown }> {
    const input =
        typeof args === "string"
            ? (() => {
                  try {
                      return JSON.parse(args || "{}") as Record<string, unknown>
                  } catch {
                      return {}
                  }
              })()
            : args ?? {}

    const local = getRegistry().get(name)
    if (!local) {
        return {
            ok: false,
            name,
            text: JSON.stringify({ success: false, error: `Unknown page tool: ${name}` }),
        }
    }

    try {
        const raw = await local.execute(input)
        return { ok: true, name, text: extractToolResultText(raw), raw }
    } catch (error) {
        return {
            ok: false,
            name,
            text: JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : `${name} failed`,
            }),
        }
    }
}
