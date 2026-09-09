import { NextRequest, NextResponse } from "next/server"
import {
    agentCorsHeaders,
    agentOptionsResponse,
    clearVisitorCookie,
    readVisitorFromRequest,
    setVisitorCookie,
    VISITOR_COOKIE,
} from "@/lib/agent-access"
import { dynamicAuthConfigured } from "@/lib/dynamic-config"
import { getHumanByGoogleSub, googleAuthConfigured, publicSession, sessionFromHuman } from "@/lib/human-couple"

export const dynamic = "force-dynamic"

function raceMs<T>(p: Promise<T>, ms: number): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout")), ms)
        p.then(
            (v) => {
                clearTimeout(t)
                resolve(v)
            },
            (e) => {
                clearTimeout(t)
                reject(e)
            }
        )
    })
}

export function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

export async function GET(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    let visitor = readVisitorFromRequest(req)
    let refreshCookie = false
    let clearCookie = false

    // Stale / pre-rotation cookie present but invalid → wipe it so clients stop replaying it.
    const raw = req.cookies.get(VISITOR_COOKIE)?.value
    if (raw && !visitor) {
        clearCookie = true
    }

    // Refresh linked_agent from store — never block login hydrate on a wedged DB.
    if (visitor?.auth_type === "human_couple" && visitor.google_sub) {
        try {
            const human = await raceMs(getHumanByGoogleSub(visitor.google_sub), 2500)
            if (human) {
                const fresh = sessionFromHuman(human)
                if (fresh.linked_agent !== visitor.linked_agent) {
                    refreshCookie = true
                }
                visitor = fresh
            }
        } catch {
            /* keep cookie session as-is */
        }
    }

    const res = NextResponse.json(
        {
            authenticated: Boolean(visitor),
            google_configured: googleAuthConfigured(),
            dynamic_configured: dynamicAuthConfigured(),
            auth_types: ["external_agent", "human_couple"],
            session: visitor ? publicSession(visitor) : null,
        },
        { headers: { ...cors, "Cache-Control": "no-store" } }
    )
    if (clearCookie) clearVisitorCookie(res)
    else if (refreshCookie && visitor) setVisitorCookie(res, visitor, req)
    return res
}
