import { NextRequest, NextResponse } from "next/server"
import {
    googleAuthConfigured,
    googleAuthorizeUrl,
    mintOAuthState,
} from "@/lib/human-couple"

export const dynamic = "force-dynamic"

const STATE_COOKIE = "geodesics_oauth_state"

export async function GET(req: NextRequest) {
    if (!googleAuthConfigured()) {
        return NextResponse.json(
            {
                error: "Google auth not configured",
                hint: "Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (+ GEODESICS_AUTH_SECRET).",
            },
            { status: 503 }
        )
    }

    const origin = req.nextUrl.origin
    const state = mintOAuthState()
    const url = googleAuthorizeUrl({ origin, state })
    const secure = req.nextUrl.protocol === "https:"
    const res = NextResponse.redirect(url)
    res.headers.append(
        "Set-Cookie",
        `${STATE_COOKIE}=${state}; Path=/; HttpOnly; SameSite=Lax; Max-Age=600${secure ? "; Secure" : ""}`
    )
    return res
}
