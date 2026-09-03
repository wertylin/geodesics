import { randomBytes } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import { FOLLOWER_COOKIE, listExplorers, toggleFollow } from "@/lib/explorers"
import { PUBLIC_AGENT_HEADERS } from "@/lib/agent-welcome"

export const dynamic = "force-dynamic"

function followerCookie(value: string, secure: boolean): string {
    return `${FOLLOWER_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 365}${
        secure ? "; Secure" : ""
    }`
}

function readFollower(req: NextRequest): string {
    return req.cookies.get(FOLLOWER_COOKIE)?.value ?? ""
}

export function OPTIONS() {
    return new NextResponse(null, { status: 204, headers: PUBLIC_AGENT_HEADERS })
}

export async function GET(req: NextRequest) {
    const follower = readFollower(req)
    const explorers = await listExplorers(follower || null)
    const res = NextResponse.json({ explorers, count: explorers.length }, { headers: PUBLIC_AGENT_HEADERS })
    if (!follower) {
        res.headers.append("Set-Cookie", followerCookie(randomBytes(16).toString("base64url"), req.nextUrl.protocol === "https:"))
    }
    return res
}

export async function POST(req: NextRequest) {
    let body: { explorer?: string; agent?: string }
    try {
        body = (await req.json()) as { explorer?: string; agent?: string }
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: PUBLIC_AGENT_HEADERS })
    }
    const explorer = typeof body.explorer === "string" ? body.explorer : body.agent
    let follower = readFollower(req)
    const minted = !follower
    if (!follower) follower = randomBytes(16).toString("base64url")

    try {
        const result = await toggleFollow(explorer ?? "", follower)
        const explorers = await listExplorers(follower)
        const res = NextResponse.json({ success: true, explorer, ...result, explorers }, { headers: PUBLIC_AGENT_HEADERS })
        if (minted) {
            res.headers.append(
                "Set-Cookie",
                followerCookie(follower, req.nextUrl.protocol === "https:")
            )
        }
        return res
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Follow failed" },
            { status: Number.isFinite(status) ? status : 500, headers: PUBLIC_AGENT_HEADERS }
        )
    }
}
