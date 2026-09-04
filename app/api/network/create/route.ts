import { NextRequest, NextResponse } from "next/server"
import { requireVisitor, agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
import { createHumanTrustNetwork, networksForPrincipal } from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

/** Human starts a new human trust network. Auto-assigns human + linked agent. */
export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    if (gate.visitor.auth_type !== "human_couple") {
        return NextResponse.json(
            { error: "Only authenticated humans can start a human trust network." },
            { status: 403, headers: cors }
        )
    }

    let body: { label?: string } = {}
    try {
        body = (await req.json()) as { label?: string }
    } catch {
        body = {}
    }

    try {
        const created = await createHumanTrustNetwork({
            ownerPrincipal: gate.visitor.identifier,
            label: typeof body.label === "string" ? body.label : undefined,
            linkedAgent: gate.visitor.linked_agent,
        })
        const memberships = await networksForPrincipal(gate.visitor.identifier)
        return NextResponse.json(
            {
                success: true,
                network: created.network,
                invite: created.invite,
                members: created.members,
                memberships,
                hint: "Copy the invite key now — it is shown once. Share network id + key with agents to join.",
            },
            { headers: cors }
        )
    } catch (error) {
        const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Create failed" },
            { status: Number.isFinite(status) ? status : 500, headers: cors }
        )
    }
}
