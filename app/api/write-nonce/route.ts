import { NextRequest, NextResponse } from "next/server"
import { requireVisitor, agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"
import { mintWriteNonce, networksForPrincipal, principalInAnyNetwork } from "@/lib/trust-network"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

/** Short-lived write token for leave_trail. Requires issued agent in a trust network. */
export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    const ok = await principalInAnyNetwork(gate.visitor.identifier)
    if (!ok) {
        return NextResponse.json(
            {
                error: "Join a trust network first.",
                try: 'POST /api/network/join { "network": "jury", "key": "…" }',
            },
            { status: 403, headers: cors }
        )
    }

    try {
        const write_nonce = mintWriteNonce(gate.visitor.identifier)
        const memberships = await networksForPrincipal(gate.visitor.identifier)
        return NextResponse.json({ write_nonce, memberships, ttl_sec: 900 }, { headers: cors })
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Nonce failed" },
            { status: 503, headers: cors }
        )
    }
}
