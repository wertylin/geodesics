import { NextRequest, NextResponse } from "next/server"
import { toPublicActivity, type ActivityEvent } from "@/lib/agent-activity"
import { agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
import {
    AGENT_EXPERIMENT_ID,
    newLedgerEntryId,
    redactLedgerArgs,
    type AgentLedgerAction,
    type AgentLedgerEntry,
    type AgentLedgerPhase,
} from "@/lib/agent-ledger"
import { appendLedger, readLedger, subscribeLedger } from "@/lib/agent-ledger-store"

export const dynamic = "force-dynamic"

const ACTIONS = new Set<AgentLedgerAction>([
    "agent.login",
    "agent.login_failed",
    "agent.session",
    "webmcp.tool",
    "webmcp.navigate",
])

const PHASES = new Set<AgentLedgerPhase>(["start", "result"])

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

function publicHeaders(req: NextRequest): Record<string, string> {
    return {
        ...agentCorsHeaders(req),
        "Cache-Control": "no-store",
    }
}

export async function GET(req: NextRequest) {
    const cors = publicHeaders(req)
    const wantStream =
        req.nextUrl.searchParams.get("stream") === "1" ||
        (req.headers.get("accept") ?? "").includes("text/event-stream")

    if (!wantStream) {
        const limit = Number(req.nextUrl.searchParams.get("limit") ?? "60")
        const entries = (await readLedger(Number.isFinite(limit) ? limit : 60)).map(toPublicActivity)
        return NextResponse.json(
            { experiment: AGENT_EXPERIMENT_ID, count: entries.length, entries },
            { headers: cors }
        )
    }

    const encoder = new TextEncoder()
    let closed = false
    let unsub: (() => void) | null = null
    let heartbeat: ReturnType<typeof setInterval> | null = null

    const stream = new ReadableStream<Uint8Array>({
        async start(controller) {
            const push = (line: string) => {
                if (closed) return
                try {
                    controller.enqueue(encoder.encode(line))
                } catch {
                    closed = true
                }
            }
            const send = (ev: ActivityEvent) => {
                push(`data: ${JSON.stringify(ev)}\n\n`)
            }

            push(`event: hello\ndata: ${JSON.stringify({ ok: true, experiment: AGENT_EXPERIMENT_ID })}\n\n`)

            const recent = await readLedger(40)
            for (const entry of [...recent].reverse()) {
                send(toPublicActivity(entry))
            }

            unsub = subscribeLedger((entry) => send(toPublicActivity(entry)))
            heartbeat = setInterval(() => push(`: ping\n\n`), 15_000)
        },
        cancel() {
            closed = true
            unsub?.()
            unsub = null
            if (heartbeat) clearInterval(heartbeat)
            heartbeat = null
        },
    })

    return new Response(stream, {
        headers: {
            ...cors,
            "Content-Type": "text/event-stream; charset=utf-8",
            "Cache-Control": "no-cache, no-transform",
            Connection: "keep-alive",
            "X-Accel-Buffering": "no",
        },
    })
}

export async function POST(req: NextRequest) {
    const cors = publicHeaders(req)
    let body: Partial<AgentLedgerEntry>
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const action = body.action
    if (!action || !ACTIONS.has(action)) {
        return NextResponse.json({ error: "Invalid action" }, { status: 400, headers: cors })
    }

    const actor =
        typeof body.actor === "string" && body.actor.trim() ? body.actor.trim().slice(0, 64) : "anonymous"

    const phase =
        typeof body.phase === "string" && PHASES.has(body.phase as AgentLedgerPhase)
            ? (body.phase as AgentLedgerPhase)
            : undefined

    const entry: AgentLedgerEntry = {
        id: typeof body.id === "string" ? body.id : newLedgerEntryId(),
        ts: typeof body.ts === "string" ? body.ts : new Date().toISOString(),
        experiment: AGENT_EXPERIMENT_ID,
        actor,
        host_agent: "geodesics",
        action,
        tool: typeof body.tool === "string" ? body.tool.slice(0, 120) : undefined,
        ok: body.ok !== false,
        duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
        args: redactLedgerArgs(body.args),
        preview: typeof body.preview === "string" ? body.preview.slice(0, 480) : undefined,
        view: typeof body.view === "string" ? body.view.slice(0, 80) : undefined,
        phase,
    }

    await appendLedger(entry)
    return NextResponse.json({ ok: true, entry: toPublicActivity(entry) }, { headers: cors })
}
