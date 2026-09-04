import type { AgentLedgerAction, AgentLedgerEntry } from "@/lib/agent-ledger"

export const AGENT_ACTIVITY_EVENT = "geodesics-agent-activity"
export const AGENT_ACTIVITY_BROADCAST = "geodesics-agent-activity"

export type ActivityPhase = "start" | "result"
export type ActivityStatus = "running" | "ok" | "err"

/** Public, redacted activity line — safe for everyone to observe. */
export type ActivityEvent = {
    id: string
    ts: string
    actor: string
    action: AgentLedgerAction
    tool?: string
    status: ActivityStatus
    duration_ms?: number
    phase?: ActivityPhase
    preview?: string
}

export function activityStatus(entry: Pick<AgentLedgerEntry, "ok" | "phase">): ActivityStatus {
    if (entry.phase === "start") return "running"
    return entry.ok ? "ok" : "err"
}

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi

/** Strip emails / long human ids from anything that hits the public feed. */
export function redactPublicText(raw: string | undefined | null): string | undefined {
    if (!raw) return undefined
    return raw
        .replace(EMAIL_RE, "[redacted]")
        .replace(/\bhuman:[a-zA-Z0-9_-]{8,}\b/g, (m) => `${m.slice(0, 12)}…`)
        .slice(0, 160)
}

function publicActor(actor: string): string {
    if (actor.startsWith("human:") && actor.length > 14) {
        return `${actor.slice(0, 12)}…`
    }
    return actor || "anonymous"
}

export function toPublicActivity(entry: AgentLedgerEntry): ActivityEvent {
    return {
        id: entry.id,
        ts: entry.ts,
        actor: publicActor(entry.actor || "anonymous"),
        action: entry.action,
        tool: entry.tool,
        status: activityStatus(entry),
        duration_ms: entry.duration_ms,
        phase: entry.phase,
        preview: redactPublicText(entry.preview),
    }
}

export function formatActivityTime(ts: string): string {
    try {
        const d = new Date(ts)
        if (Number.isNaN(d.getTime())) return "--:--:--"
        // UTC — avoid SSR/client locale timezone mismatch
        return d.toISOString().slice(11, 19)
    } catch {
        return "--:--:--"
    }
}

/** openclaw · geodesics_agent_login → ok · 08:28:32 */
export function formatActivityLine(ev: ActivityEvent): string {
    const verb = ev.tool ?? ev.action.replace(/^webmcp\./, "").replace(/^agent\./, "")
    const mark = ev.status === "running" ? "…" : ev.status
    return `${ev.actor} · ${verb} → ${mark} · ${formatActivityTime(ev.ts)}`
}

export function publishActivityLocal(entry: AgentLedgerEntry): void {
    if (typeof window === "undefined") return
    const ev = toPublicActivity(entry)
    try {
        window.dispatchEvent(new CustomEvent<ActivityEvent>(AGENT_ACTIVITY_EVENT, { detail: ev }))
    } catch {
        /* ignore */
    }
    try {
        const ch = new BroadcastChannel(AGENT_ACTIVITY_BROADCAST)
        ch.postMessage(ev)
        ch.close()
    } catch {
        /* ignore */
    }
}
