import { NextRequest, NextResponse } from "next/server"
import { setVisitorCookie } from "@/lib/agent-access"
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

function ephemeralFromProfile(profile: Awaited<ReturnType<typeof fetchGoogleProfile>>) {
    const now = new Date().toISOString()
    return {
        google_sub: profile.sub,
        email: profile.email,
        display_name: profile.name ?? null,
        picture: profile.picture ?? null,
        linked_agent: null,
        couple_key_hash: null,
        created_at: now,
        last_login: now,
    }
}

function raceMs<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
    return new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error(label)), ms)
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

        // Local/dev: DB pool can hang for minutes — don't block Google login on it.
        let human = ephemeralFromProfile(profile)
        try {
            human = await raceMs(upsertHumanFromGoogle(profile), 10_000, "db_timeout")
        } catch (err) {
            const msg = err instanceof Error ? err.message : "db_error"
            console.error("[google] human upsert failed, using ephemeral session:", msg)
            if (!/localhost|127\.0\.0\.1/i.test(origin) && msg === "db_timeout") {
                return failRedirect(origin, "db_timeout")
            }
        }

        const session = sessionFromHuman(human)

        void appendLedger({
            id: newLedgerEntryId(),
            ts: new Date().toISOString(),
            experiment: AGENT_EXPERIMENT_ID,
            actor: session.identifier,
            host_agent: "geodesics",
            action: "agent.login",
            ok: true,
            args: { auth_type: "human_couple" },
            preview: "google couple login",
        }).catch(() => {})

        const dest = new URL("/auth/callback", origin)
        dest.searchParams.set("auth_type", "human_couple")
        const secure = req.nextUrl.protocol === "https:"
        const res = NextResponse.redirect(dest)
        setVisitorCookie(res, session, req)
        res.cookies.set(STATE_COOKIE, "", {
            httpOnly: true,
            sameSite: "lax",
            path: "/",
            maxAge: 0,
            secure,
        })
        return res
    } catch (err) {
        const msg = err instanceof Error ? err.message : "oauth_failed"
        console.error("[google] oauth callback failed:", msg)
        return failRedirect(origin, encodeURIComponent(msg.slice(0, 80)))
    }
}
