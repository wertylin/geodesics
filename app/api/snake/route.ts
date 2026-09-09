import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { PUBLIC_AGENT_HEADERS } from "@/lib/agent-welcome"
import { listSnakeLeaderboard, SNAKE_PLAYER_COOKIE, submitSnakeScore } from "@/lib/snake-leaderboard"

export const dynamic = "force-dynamic"

function playerCookie(value: string, secure: boolean): string {
    return `${SNAKE_PLAYER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${
        secure ? "; Secure" : ""
    }`
}

function readPlayer(req: NextRequest): string {
    return req.cookies.get(SNAKE_PLAYER_COOKIE)?.value ?? ""
}

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: PUBLIC_AGENT_HEADERS })
}

export async function GET(req: NextRequest) {
    const limit = Number(req.nextUrl.searchParams.get("limit") ?? "10")
    const rows = await listSnakeLeaderboard(Number.isFinite(limit) ? limit : 10)
    return NextResponse.json(
        { scores: rows, count: rows.length },
        { headers: { ...PUBLIC_AGENT_HEADERS, "Cache-Control": "private, max-age=15, stale-while-revalidate=60" } }
    )
}

export async function POST(req: NextRequest) {
    let body: { score?: number; name?: string }
    try {
        body = (await req.json()) as { score?: number; name?: string }
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: PUBLIC_AGENT_HEADERS })
    }

    const score = Number(body.score)
    if (!Number.isFinite(score) || score < 0) {
        return NextResponse.json({ error: "score required" }, { status: 400, headers: PUBLIC_AGENT_HEADERS })
    }

    let playerId = readPlayer(req)
    const minted = !playerId
    if (!playerId) playerId = randomBytes(12).toString("base64url")

    const name = typeof body.name === "string" ? body.name : "anon"
    const result = await submitSnakeScore(playerId, name, score)
    const scores = await listSnakeLeaderboard(10)

    const res = NextResponse.json({ ok: true, ...result, scores }, { headers: PUBLIC_AGENT_HEADERS })
    if (minted) {
        res.headers.append("Set-Cookie", playerCookie(playerId, req.nextUrl.protocol === "https:"))
    }
    return res
}
