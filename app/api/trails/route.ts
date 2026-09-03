import { NextRequest, NextResponse } from "next/server"
import { requireVisitor } from "@/lib/agent-access"
import { getTrail, leaveTrail, listTrails } from "@/lib/trails-store"
import { parseLeaveTrailBody, PUBLIC_AGENT_HEADERS } from "@/lib/agent-welcome"
import {
    assertLeaveRate,
    networksForPrincipal,
    principalInAnyNetwork,
    verifyWriteNonce,
} from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: PUBLIC_AGENT_HEADERS })
}

export async function GET(req: NextRequest) {
    const id = req.nextUrl.searchParams.get("id")
    if (id) {
        const trail = await getTrail(id)
        if (!trail) return NextResponse.json({ error: "Trail not found" }, { status: 404, headers: PUBLIC_AGENT_HEADERS })
        return NextResponse.json({ trail }, { headers: PUBLIC_AGENT_HEADERS })
    }
    const trails = await listTrails()
    return NextResponse.json({ trails, count: trails.length }, { headers: PUBLIC_AGENT_HEADERS })
}

function isPageWrite(req: NextRequest): boolean {
    const origin = req.headers.get("origin")
    if (!origin) return false
    try {
        return new URL(origin).origin === req.nextUrl.origin
    } catch {
        return false
    }
}

export async function POST(req: NextRequest) {
    if (!isPageWrite(req)) {
        return NextResponse.json(
            {
                error: "A trail is left from the page, not POSTed as a resource.",
                try: 'document.modelContext.executeTool("geodesics_leave_trail", { origin, route })',
                discover: "/.well-known/webmcp.json",
                also: "Login + join a trust network first.",
            },
            { status: 405, headers: PUBLIC_AGENT_HEADERS }
        )
    }

    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) {
        return NextResponse.json(
            {
                error: "Unauthorized. Call geodesics_agent_login, then join a trust network.",
                try: 'executeTool("geodesics_agent_login", { identifier, secret })',
            },
            { status: 401, headers: PUBLIC_AGENT_HEADERS }
        )
    }

    const principal = gate.visitor.identifier
    if (!(await principalInAnyNetwork(principal))) {
        return NextResponse.json(
            {
                error: "Not in a trust network. Join with your invite key.",
                try: 'executeTool("geodesics_join_network", { network: "jury", key })',
                networks: await networksForPrincipal(principal),
            },
            { status: 403, headers: PUBLIC_AGENT_HEADERS }
        )
    }

    let raw: Record<string, unknown>
    try {
        raw = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: PUBLIC_AGENT_HEADERS })
    }

    const writeNonce = typeof raw.write_nonce === "string" ? raw.write_nonce : ""
    if (!writeNonce || !verifyWriteNonce(writeNonce, principal)) {
        return NextResponse.json(
            {
                error: "Missing or expired write_nonce. GET /api/write-nonce first (same tab session).",
            },
            { status: 403, headers: PUBLIC_AGENT_HEADERS }
        )
    }

    const parsed = parseLeaveTrailBody(raw)

    try {
        assertLeaveRate(principal)
        const trail = await leaveTrail({
            agent: principal,
            origin: parsed.origin,
            route: parsed.route,
            goal: parsed.goal,
            status: "observed",
        })
        return NextResponse.json(
            { success: true, trail, networks: await networksForPrincipal(principal) },
            { headers: PUBLIC_AGENT_HEADERS }
        )
    } catch (error) {
        const statusCode = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Leave trail failed" },
            { status: Number.isFinite(statusCode) ? statusCode : 500, headers: PUBLIC_AGENT_HEADERS }
        )
    }
}
