import { NextRequest, NextResponse } from "next/server"
import { juryCookieHeader, juryNetworkPrincipal, redeemJuryCode, seedJury } from "@/lib/jury"
import { agentCorsHeaders, agentOptionsResponse, readVisitorFromRequest } from "@/lib/agent-access"
import { addNetworkMember } from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    let body: { code?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    await seedJury().catch(() => {})

    const result = await redeemJuryCode(typeof body.code === "string" ? body.code : "")
    if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 401, headers: cors })
    }

    const jurorPrincipal = juryNetworkPrincipal(result.juror.slug)
    let membership = await addNetworkMember({
        network: "jury",
        principal: jurorPrincipal,
        kind: "juror",
    })

    // If an issued agent is already in this tab, bind them onto the jury ring too.
    const visitor = readVisitorFromRequest(req)
    let agentMembership = null
    if (visitor?.identifier) {
        agentMembership = await addNetworkMember({
            network: "jury",
            principal: visitor.identifier,
            kind: "agent",
        }).catch(() => null)
    }

    const res = NextResponse.json(
        {
            success: true,
            slug: result.juror.slug,
            href: `/jury/${result.juror.slug}`,
            name: result.juror.name,
            network: "jury",
            membership,
            agent_membership: agentMembership,
            hint: "Desk code accepted — you are on the jury trust ring.",
        },
        { headers: cors }
    )
    res.headers.append(
        "Set-Cookie",
        juryCookieHeader(result.juror.slug, req.nextUrl.protocol === "https:")
    )
    return res
}
