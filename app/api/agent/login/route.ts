import { NextRequest, NextResponse } from "next/server"
import { agentCorsHeaders, agentOptionsResponse, visitorCookieHeader } from "@/lib/agent-access"
import { verifyAgentLogin } from "@/lib/agent-identity"
import { AGENT_EXPERIMENT_ID, newLedgerEntryId } from "@/lib/agent-ledger"
import { appendLedger } from "@/lib/agent-ledger-store"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    let body: { identifier?: string; secret?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const result = await verifyAgentLogin({
        identifier: typeof body.identifier === "string" ? body.identifier : "",
        secret: typeof body.secret === "string" ? body.secret : "",
    })

    if (!result.ok) {
        await appendLedger({
            id: newLedgerEntryId(),
            ts: new Date().toISOString(),
            experiment: AGENT_EXPERIMENT_ID,
            actor: typeof body.identifier === "string" ? body.identifier.trim() || "anonymous" : "anonymous",
            host_agent: "geodesics",
            action: "agent.login_failed",
            ok: false,
            preview: result.error,
        })
        return NextResponse.json({ success: false, error: result.error }, { status: 401, headers: cors })
    }

    await appendLedger({
        id: newLedgerEntryId(),
        ts: new Date().toISOString(),
        experiment: AGENT_EXPERIMENT_ID,
        actor: result.agent.identifier,
        host_agent: "geodesics",
        action: "agent.login",
        ok: true,
        args: { identifier: result.agent.identifier },
        preview: `login ${result.agent.identifier}`,
    })

    const res = NextResponse.json(
        {
            success: true,
            mode: "agent",
            agent: result.agent,
            next: [
                "geodesics_list_trails",
                "geodesics_leave_trail",
                "geodesics_open_map",
                "geodesics_list_agent_surface",
            ],
            hint: "Session cookie set. Drive the page with WebMCP, not curl.",
        },
        { headers: cors }
    )
    res.headers.append("Set-Cookie", visitorCookieHeader(result.agent, req))
    return res
}
