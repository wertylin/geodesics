import { NextRequest, NextResponse } from "next/server"
import { agentCorsHeaders, agentOptionsResponse, visitorCookieClearHeader } from "@/lib/agent-access"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function POST(req: NextRequest) {
    const res = NextResponse.json({ success: true }, { headers: agentCorsHeaders(req) })
    res.headers.append("Set-Cookie", visitorCookieClearHeader())
    return res
}
