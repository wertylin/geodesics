import { NextRequest, NextResponse } from "next/server"
import { visitorCookieHeader } from "@/lib/agent-access"
import { AGENT_EXPERIMENT_ID, newLedgerEntryId } from "@/lib/agent-ledger"
import { appendLedger } from "@/lib/agent-ledger-store"
import {
    exchangeGoogleCode,
    fetchGoogleProfile,
    googleAuthConfigured,
    sessionFromHuman,
    upsertHumanFromGoogle,
    verifyOAuthState,
} from "@/lib/human-couple"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "geodesics_oauth_state"

function failRedirect(origin: string, reason: string) {
    const url = new URL("/", origin)
    url.searchParams.set("auth_error", reason)
    return NextResponse.redirect(url)
}

export async function GET(req: NextRequest) {
    const origin = req.nextUrl.origin
    if (!googleAuthConfigured()) {
        return failRedirect(origin, "google_not_configured")
    }

    const code = req.nextUrl.searchParams.get("code")
    const state = req.nextUrl.searchParams.get("state")
    const cookieState = req.cookies.get(STATE_COOKIE)?.value
    const oauthError = req.nextUrl.searchParams.get("error")

    if (oauthError) return failRedirect(origin, oauthError)
    if (!code) return failRedirect(origin, "missing_code")
    if (!state || !cookieState || state !== cookieState || !verifyOAuthState(state)) {
        return failRedirect(origin, "bad_state")
    }

    try {
        const { access_token } = await exchangeGoogleCode({ code, origin })
        const profile = await fetchGoogleProfile(access_token)
        if (profile.email_verified === false) {
            return failRedirect(origin, "email_unverified")
        }
        const human = await upsertHumanFromGoogle(profile)
        const session = sessionFromHuman(human)

        await appendLedger({
            id: newLedgerEntryId(),
            ts: new Date().toISOString(),
            experiment: AGENT_EXPERIMENT_ID,
            actor: session.identifier,
            host_agent: "geodesics",
            action: "agent.login",
            ok: true,
            args: { auth_type: "human_couple" },
            preview: "google couple login",
        })

        const dest = new URL("/auth/callback", origin)
        dest.searchParams.set("auth_type", "human_couple")
        const secure = req.nextUrl.protocol === "https:"
        const res = NextResponse.redirect(dest)
        res.headers.append("Set-Cookie", visitorCookieHeader(session, req))
        res.headers.append(
            "Set-Cookie",
            `${STATE_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`
        )
        return res
    } catch (err) {
        const msg = err instanceof Error ? err.message : "oauth_failed"
        return failRedirect(origin, encodeURIComponent(msg.slice(0, 80)))
    }
}
