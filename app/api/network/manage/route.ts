import { NextRequest, NextResponse } from "next/server"
import { requireVisitor, agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
import {
    isNetworkInitiator,
    listNetworkMembers,
    networksOwnedBy,
    removeNetworkMember,
    rotateHumanNetworkInvite,
    seedTrustNetworkHosts,
    type NetworkMember,
    type TrustNetwork,
} from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

function redactMember(m: NetworkMember): NetworkMember {
    return m
}

/** Initiator desk: owned networks + members. */
export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    if (gate.visitor.auth_type !== "human_couple") {
        return NextResponse.json(
            { error: "Only authenticated humans can manage trust networks." },
            { status: 403, headers: cors }
        )
    }

    await seedTrustNetworkHosts().catch(() => {})
    const owned = await networksOwnedBy(gate.visitor.identifier)
    const networks: Array<TrustNetwork & { members: NetworkMember[]; member_count: number }> = []
    for (const net of owned) {
        const members = (await listNetworkMembers(net.id)).map(redactMember)
        networks.push({ ...net, members, member_count: members.length })
    }

    return NextResponse.json(
        {
            initiator: gate.visitor.identifier,
            networks,
        },
        { headers: cors }
    )
}

/** Admin actions: kick member | rotate human-network invite. */
export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    if (gate.visitor.auth_type !== "human_couple") {
        return NextResponse.json(
            { error: "Only authenticated humans can manage trust networks." },
            { status: 403, headers: cors }
        )
    }

    let body: { action?: string; network?: string; principal?: string } = {}
    try {
        body = (await req.json()) as typeof body
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const action = typeof body.action === "string" ? body.action.trim().toLowerCase() : ""
    const network = typeof body.network === "string" ? body.network.trim().toLowerCase() : ""
    if (!network) {
        return NextResponse.json({ error: "network is required" }, { status: 400, headers: cors })
    }

    const owner = gate.visitor.identifier
    const ok = await isNetworkInitiator(network, owner)
    if (!ok) {
        return NextResponse.json(
            { error: "Not the initiator of this network." },
            { status: 403, headers: cors }
        )
    }

    try {
        if (action === "kick") {
            const principal = typeof body.principal === "string" ? body.principal.trim().toLowerCase() : ""
            if (!principal) {
                return NextResponse.json({ error: "principal is required" }, { status: 400, headers: cors })
            }
            if (principal === owner) {
                return NextResponse.json(
                    { error: "Cannot remove the network initiator." },
                    { status: 400, headers: cors }
                )
            }
            const removed = await removeNetworkMember({ network, principal })
            const members = await listNetworkMembers(network)
            return NextResponse.json(
                { success: true, removed, members, network },
                { headers: cors }
            )
        }

        if (action === "rotate_invite") {
            const rotated = await rotateHumanNetworkInvite({ network, ownerPrincipal: owner })
            return NextResponse.json(
                {
                    success: true,
                    network: rotated.network,
                    invite: rotated.invite,
                    hint: "Copy the invite now — shown once. Previous invite is revoked.",
                },
                { headers: cors }
            )
        }

        return NextResponse.json(
            { error: 'action must be "kick" or "rotate_invite"' },
            { status: 400, headers: cors }
        )
    } catch (error) {
        const status =
            typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Manage failed" },
            { status: Number.isFinite(status) ? status : 500, headers: cors }
        )
    }
}
