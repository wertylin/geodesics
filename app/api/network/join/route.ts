import { NextRequest, NextResponse } from "next/server"
import { requireVisitor, agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
import {
    juryCookieHeader,
    juryNetworkPrincipal,
    matchJuryCode,
    seedJury,
} from "@/lib/jury"
import {
    addNetworkMember,
    isBuiltinTrustNetworkId,
    isNetworkIdFormat,
    joinNetworkWithKey,
    listAllTrustNetworks,
    memberKindForAuth,
    networksForPrincipal,
    networksOwnedBy,
    seedTrustNetworkHosts,
} from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    await Promise.all([seedTrustNetworkHosts().catch(() => {}), seedJury().catch(() => {})])
    const networks = await listAllTrustNetworks()
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) {
        return NextResponse.json({ networks, member: null, memberships: [] }, { headers: cors })
    }
    const [memberships, owned] = await Promise.all([
        networksForPrincipal(gate.visitor.identifier),
        gate.visitor.auth_type === "human_couple"
            ? networksOwnedBy(gate.visitor.identifier)
            : Promise.resolve([]),
    ])
    return NextResponse.json(
        {
            networks,
            member: gate.visitor.identifier,
            memberships,
            owned: owned.map((n) => n.id),
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
    if (!isNetworkIdFormat(network)) {
        return NextResponse.json(
            { error: 'network must be "jury", "moltbook", or a human network id (hn_…)' },
            { status: 400, headers: cors }
        )
    }

    await Promise.all([seedTrustNetworkHosts().catch(() => {}), seedJury().catch(() => {})])

    const kind = memberKindForAuth(gate.visitor.auth_type)

    try {
        const member = await joinNetworkWithKey({
            network,
            key,
            principal: gate.visitor.identifier,
            kind,
        })
        // Human joins → also seat their linked agent on the same ring.
        if (kind === "human" && gate.visitor.linked_agent) {
            await addNetworkMember({
                network,
                principal: gate.visitor.linked_agent,
                kind: "agent",
            }).catch(() => {})
        }
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
        // Jury ring: desk codes are also valid invites (per-juror).
        if (isBuiltinTrustNetworkId(network) && network === "jury") {
            const desk = await matchJuryCode(key)
            if (desk.ok) {
                await addNetworkMember({
                    network: "jury",
                    principal: juryNetworkPrincipal(desk.juror.slug),
                    kind: "juror",
                })
                const member = await addNetworkMember({
                    network: "jury",
                    principal: gate.visitor.identifier,
                    kind,
                })
                if (kind === "human" && gate.visitor.linked_agent) {
                    await addNetworkMember({
                        network: "jury",
                        principal: gate.visitor.linked_agent,
                        kind: "agent",
                    }).catch(() => {})
                }
                const memberships = await networksForPrincipal(gate.visitor.identifier)
                const res = NextResponse.json(
                    {
                        success: true,
                        member,
                        memberships,
                        juror: { slug: desk.juror.slug, name: desk.juror.name },
                        hint: "Desk code accepted — on the jury trust ring. You can leave trails now.",
                    },
                    { headers: cors }
                )
                res.headers.append(
                    "Set-Cookie",
                    juryCookieHeader(desk.juror.slug, req.nextUrl.protocol === "https:")
                )
                return res
            }
        }
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Join failed" },
            { status: Number.isFinite(status) ? status : 500, headers: cors }
        )
    }
}
