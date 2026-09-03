import { NextResponse } from "next/server"
import { AGENT_WELCOME, PUBLIC_AGENT_HEADERS } from "@/lib/agent-welcome"

export const dynamic = "force-dynamic"

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: PUBLIC_AGENT_HEADERS })
}

export function GET() {
    return NextResponse.json(AGENT_WELCOME, { headers: PUBLIC_AGENT_HEADERS })
}
