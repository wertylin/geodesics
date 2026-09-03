import { NextRequest, NextResponse } from "next/server"
import { requireVisitor, agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
import {
    isTrustNetworkId,
    joinNetworkWithKey,
    listTrustNetworks,
    networksForPrincipal,
    seedTrustNetworkHosts,
} from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    await seedTrustNetworkHosts().catch(() => {})
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) {
        return NextResponse.json(
            { networks: listTrustNetworks(), member: null, memberships: [] },
            { headers: cors }
        )
    }
    const memberships = await networksForPrincipal(gate.visitor.identifier)
    return NextResponse.json(
        {
            networks: listTrustNetworks(),
            member: gate.visitor.identifier,
            memberships,
        },
        { headers: cors }
    )
}

export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    let body: { network?: string; key?: string }
    try {
        body = (await req.json()) as { network?: string; key?: string }
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const network = typeof body.network === "string" ? body.network.trim().toLowerCase() : ""
    const key = typeof body.key === "string" ? body.key : ""
    if (!isTrustNetworkId(network)) {
        return NextResponse.json(
            { error: 'network must be "jury" or "moltbook"' },
            { status: 400, headers: cors }
        )
    }

    try {
        const member = await joinNetworkWithKey({
            network,
            key,
            principal: gate.visitor.identifier,
            kind: "agent",
        })
        const memberships = await networksForPrincipal(gate.visitor.identifier)
        return NextResponse.json(
            {
                success: true,
                member,
                memberships,
                hint: "You can leave trails now. executeTool('geodesics_leave_trail', { origin, route }).",
            },
            { headers: cors }
        )
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Join failed" },
            { status: Number.isFinite(status) ? status : 500, headers: cors }
        )
    }
}
