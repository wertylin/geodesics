import { NextRequest, NextResponse } from "next/server"
import { readVisitorFromRequest } from "@/lib/agent-access"
import { getTrail, leaveTrail, listTrails } from "@/lib/trails-store"
import type { TrailStatus } from "@/lib/trails"
import { parseLeaveTrailBody, PUBLIC_AGENT_HEADERS } from "@/lib/agent-welcome"

export const dynamic = "force-dynamic"

const STATUSES = new Set<TrailStatus>(["verified", "observed", "changed"])

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: PUBLIC_AGENT_HEADERS })
}

export async function GET(req: NextRequest) {
    const id = req.nextUrl.searchParams.get("id")
    if (id) {
        const trail = await getTrail(id)
        if (!trail) return NextResponse.json({ error: "Trail not found" }, { status: 404, headers: PUBLIC_AGENT_HEADERS })
        return NextResponse.json({ trail }, { headers: PUBLIC_AGENT_HEADERS })
    }
    const trails = await listTrails()
    return NextResponse.json({ trails, count: trails.length }, { headers: PUBLIC_AGENT_HEADERS })
}

export async function POST(req: NextRequest) {
    let raw: Record<string, unknown>
    try {
        raw = (await req.json()) as Record<string, unknown>
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: PUBLIC_AGENT_HEADERS })
    }

    const parsed = parseLeaveTrailBody(raw)
    const visitor = readVisitorFromRequest(req)
    const status = parsed.status && STATUSES.has(parsed.status as TrailStatus)
        ? (parsed.status as TrailStatus)
        : undefined

    try {
        const trail = await leaveTrail({
            agent: visitor?.identifier || parsed.agent,
            origin: parsed.origin,
            route: parsed.route,
            goal: parsed.goal,
            status,
        })
        return NextResponse.json({ success: true, trail }, { headers: PUBLIC_AGENT_HEADERS })
    } catch (error) {
        const statusCode = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Leave trail failed" },
            { status: Number.isFinite(statusCode) ? statusCode : 500, headers: PUBLIC_AGENT_HEADERS }
        )
    }
}
