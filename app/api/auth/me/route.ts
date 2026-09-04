import { NextRequest, NextResponse } from "next/server"
import {
    agentCorsHeaders,
    agentOptionsResponse,
    readVisitorFromRequest,
    VISITOR_COOKIE,
    visitorCookieClearHeader,
    visitorCookieHeader,
} from "@/lib/agent-access"
import { getHumanByGoogleSub, googleAuthConfigured, publicSession, sessionFromHuman } from "@/lib/human-couple"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    let visitor = readVisitorFromRequest(req)
    let setCookie: string | null = null

    // Stale / pre-rotation cookie present but invalid → wipe it so clients stop replaying it.
    const raw = req.cookies.get(VISITOR_COOKIE)?.value
    if (raw && !visitor) {
        setCookie = visitorCookieClearHeader()
    }

    // Refresh linked_agent from store for human couples (agent may have claimed invite).
    if (visitor?.auth_type === "human_couple" && visitor.google_sub) {
        const human = await getHumanByGoogleSub(visitor.google_sub)
        if (human) {
            const fresh = sessionFromHuman(human)
            if (fresh.linked_agent !== visitor.linked_agent) {
                visitor = fresh
                setCookie = visitorCookieHeader(fresh, req)
            } else {
                visitor = fresh
            }
        }
    }

    const res = NextResponse.json(
        {
            authenticated: Boolean(visitor),
            google_configured: googleAuthConfigured(),
            auth_types: ["external_agent", "human_couple"],
            session: visitor ? publicSession(visitor) : null,
        },
        { headers: { ...cors, "Cache-Control": "no-store" } }
    )
    if (setCookie) res.headers.append("Set-Cookie", setCookie)
    return res
}
