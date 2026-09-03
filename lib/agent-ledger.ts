export const AGENT_EXPERIMENT_ID = "geodesics-webmcp"

export type AgentLedgerAction =
    | "agent.login"
    | "agent.login_failed"
    | "agent.session"
    | "webmcp.tool"
    | "webmcp.navigate"

export type AgentLedgerEntry = {
    id: string
    ts: string
    experiment: string
    actor: string
    host_agent: string
    action: AgentLedgerAction
    tool?: string
    ok: boolean
    duration_ms?: number
    args?: Record<string, unknown>
    preview?: string
    view?: string
}

const SECRET_KEYS = /^(secret|password|token|api[_-]?key|authorization)$/i

export function redactLedgerArgs(input: Record<string, unknown> | undefined): Record<string, unknown> {
    if (!input) return {}
    const out: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(input)) {
        out[key] = SECRET_KEYS.test(key)
            ? typeof value === "string" && value.length > 0
                ? "[redacted]"
                : ""
            : value
    }
    return out
}

export function previewLedgerResult(result: unknown, max = 480): string {
    if (result == null) return ""
    if (typeof result === "string") return result.slice(0, max)
    if (typeof result === "object" && Array.isArray((result as { content?: Array<{ text?: string }> }).content)) {
        return (result as { content: Array<{ text?: string }> }).content
            .map((c) => c.text ?? "")
            .join("\n")
            .slice(0, max)
    }
    try {
        return JSON.stringify(result).slice(0, max)
    } catch {
        return String(result)
    }
}

export function newLedgerEntryId(): string {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
        return crypto.randomUUID()
    }
    return `led_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`
}

export function reportAgentLedger(
    partial: Omit<AgentLedgerEntry, "id" | "ts" | "experiment" | "host_agent"> & {
        host_agent?: string
        experiment?: string
    }
): void {
    if (typeof window === "undefined") return
    const entry: AgentLedgerEntry = {
        id: newLedgerEntryId(),
        ts: new Date().toISOString(),
        experiment: partial.experiment ?? AGENT_EXPERIMENT_ID,
        host_agent: partial.host_agent ?? "geodesics",
        actor: partial.actor,
        action: partial.action,
        tool: partial.tool,
        ok: partial.ok,
        duration_ms: partial.duration_ms,
        args: redactLedgerArgs(partial.args),
        preview: partial.preview?.slice(0, 480),
        view: partial.view,
    }
    void fetch("/api/agent/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(entry),
        keepalive: true,
    }).catch(() => {
        /* telemetry must not break tools */
    })
}
