import { NextRequest, NextResponse } from "next/server"
import { juryCookieHeader, redeemJuryCode } from "@/lib/jury"
import { agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
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

    const result = await redeemJuryCode(typeof body.code === "string" ? body.code : "")
    if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 401, headers: cors })
    }

    // Desk code = invite into the jury trust ring (principal jury:<slug>)
    const membership = await addNetworkMember({
        network: "jury",
        principal: `jury:${result.juror.slug}`,
        kind: "juror",
    }).catch(() => null)

    const res = NextResponse.json(
        {
            success: true,
            slug: result.juror.slug,
            href: `/jury/${result.juror.slug}`,
            name: result.juror.name,
            network: "jury",
            membership,
            hint: "You are on the jury trust ring. Issued agents join with GEODESICS_NETWORK_JURY key.",
        },
        { headers: cors }
    )
    res.headers.append(
        "Set-Cookie",
        juryCookieHeader(result.juror.slug, req.nextUrl.protocol === "https:")
    )
    return res
}
