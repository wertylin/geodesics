import { NextRequest, NextResponse } from "next/server"
import { initiateAgent } from "@/lib/agent-identity"
import { agentCorsHeaders, agentOptionsResponse } from "@/lib/agent-access"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

function initiateAllowed(req: NextRequest): boolean {
    const key = process.env.GEODESICS_INITIATE_KEY?.trim()
    if (!key) return process.env.NODE_ENV !== "production"
    const given = req.headers.get("x-geodesics-initiate") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
    return given === key
}

export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    if (!initiateAllowed(req)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403, headers: cors })
    }

    let body: { identifier?: string; display_name?: string; email?: string; rotate_secret?: boolean }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    try {
        const result = await initiateAgent({
            identifier: typeof body.identifier === "string" ? body.identifier : "",
            displayName: typeof body.display_name === "string" ? body.display_name : undefined,
            email: typeof body.email === "string" ? body.email : undefined,
            rotateSecret: body.rotate_secret === true,
        })
        return NextResponse.json(
            {
                success: true,
                created: result.created,
                secret: result.secret,
                agent: result.agent,
                hint: result.secret
                    ? "Store the secret now. It will not be shown again."
                    : "Existing principal, secret unchanged. Pass rotate_secret: true to mint a new one.",
            },
            { headers: cors }
        )
    } catch (error) {
        const status = typeof error === "object" && error && "status" in error ? Number(error.status) : 500
        return NextResponse.json(
            { error: error instanceof Error ? error.message : "Initiate failed" },
            { status: Number.isFinite(status) ? status : 500, headers: cors }
        )
    }
}
