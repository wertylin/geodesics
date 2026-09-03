import { NextRequest, NextResponse } from "next/server"
import { listIssuedAgents } from "@/lib/agent-identity"
import { agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function GET(req: NextRequest) {
    const issued = await listIssuedAgents()
    return NextResponse.json(
        {
            issued_principals: issued,
            note: "Secrets are never listed.",
        },
        { headers: agentCorsHeaders(req) }
    )
}
