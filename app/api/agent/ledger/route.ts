import { NextRequest, NextResponse } from "next/server"
import {
    AGENT_EXPERIMENT_ID,
    newLedgerEntryId,
    redactLedgerArgs,
    type AgentLedgerAction,
    type AgentLedgerEntry,
    type AgentLedgerPhase,
} from "@/lib/agent-ledger"
import { appendLedger, readLedger } from "@/lib/agent-ledger-store"
import { agentCorsHeaders, agentOptionsResponse, requireVisitor } from "@/lib/agent-access"

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

export async function GET(req: NextRequest) {
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate
    const cors = agentCorsHeaders(req)
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "80")
    const entries = await readLedger(Number.isFinite(limit) ? limit : 80)
    return NextResponse.json(
        { experiment: AGENT_EXPERIMENT_ID, count: entries.length, entries },
        { headers: cors }
    )
}

export async function POST(req: NextRequest) {
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate
    const cors = agentCorsHeaders(req)

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

    const phase =
        typeof body.phase === "string" && PHASES.has(body.phase as AgentLedgerPhase)
            ? (body.phase as AgentLedgerPhase)
            : undefined

    await appendLedger({
        id: typeof body.id === "string" ? body.id : newLedgerEntryId(),
        ts: typeof body.ts === "string" ? body.ts : new Date().toISOString(),
        experiment: AGENT_EXPERIMENT_ID,
        actor: gate.visitor.identifier,
        host_agent: "geodesics",
        action,
        tool: typeof body.tool === "string" ? body.tool : undefined,
        ok: body.ok !== false,
        duration_ms: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
        args: redactLedgerArgs(body.args),
        preview: typeof body.preview === "string" ? body.preview.slice(0, 480) : undefined,
        view: typeof body.view === "string" ? body.view : undefined,
        phase,
    })

    return NextResponse.json({ ok: true }, { headers: cors })
}
