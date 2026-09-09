import { NextRequest, NextResponse } from "next/server"
import { agentCorsHeaders, agentOptionsResponse, requireVisitor } from "@/lib/agent-access"
import { listNetworkWall } from "@/lib/network-wall"

export const dynamic = "force-dynamic"

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

/** Shared trail wall for trust networks the visitor belongs to. */
export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    try {
        const wall = await listNetworkWall({
            principal: gate.visitor.identifier,
            linkedAgent: gate.visitor.linked_agent,
        })
        return NextResponse.json(
            { ...wall, count: wall.posts.length },
            { headers: { ...cors, "Cache-Control": "no-store" } }
        )
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Wall failed" },
            { status: 503, headers: cors }
        )
    }
}
