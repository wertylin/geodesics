import { createHmac, timingSafeEqual } from "crypto"
import { NextRequest, NextResponse } from "next/server"
import type { VisitorAgentSession } from "@/lib/agent-session"
import { authSecret } from "@/lib/secrets"

export const VISITOR_COOKIE = "geodesics_visitor"
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7

export type AgentSurface = { kind: "visitor"; visitor: VisitorAgentSession }

function cookieSecret(): string | undefined {
    return authSecret()
}

function b64url(buf: Buffer): string {
    return buf.toString("base64url")
}

function signVisitor(session: VisitorAgentSession, exp: number): string {
    const secret = cookieSecret()
    if (!secret) throw new Error("GEODESICS_AUTH_SECRET is not set")
    const payload = b64url(Buffer.from(JSON.stringify({ ...session, exp }), "utf8"))
    const mac = createHmac("sha256", secret).update(payload).digest()
    return `${payload}.${b64url(mac)}`
}

export function parseVisitorToken(raw: string | undefined | null): VisitorAgentSession | null {
    const secret = cookieSecret()
    if (!secret || !raw || !raw.includes(".")) return null
    const [payload, mac] = raw.split(".")
    if (!payload || !mac) return null
    const expected = createHmac("sha256", secret).update(payload).digest()
    const given = Buffer.from(mac, "base64url")
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
    try {
        const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as VisitorAgentSession & {
            exp?: number
        }
        if (typeof data.exp === "number" && data.exp * 1000 < Date.now()) return null
        if (typeof data.identifier !== "string" || !data.identifier) return null
        return {
            identifier: data.identifier,
            display_name: data.display_name ?? null,
            email: data.email ?? null,
            initiated_by: data.initiated_by ?? "geodesics",
        }
    } catch {
        return null
    }
}

export function visitorCookieHeader(session: VisitorAgentSession, req: NextRequest): string {
    const exp = Math.floor(Date.now() / 1000) + COOKIE_MAX_AGE
    const token = signVisitor(session, exp)
    const secure = req.nextUrl.protocol === "https:"
    return `${VISITOR_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${COOKIE_MAX_AGE}${
        secure ? "; Secure" : ""
    }`
}

export function visitorCookieClearHeader(): string {
    return `${VISITOR_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`
}

export function readVisitorFromRequest(req: NextRequest): VisitorAgentSession | null {
    return parseVisitorToken(req.cookies.get(VISITOR_COOKIE)?.value)
}

export function requireVisitor(req: NextRequest): AgentSurface | NextResponse {
    const visitor = readVisitorFromRequest(req)
    if (visitor) return { kind: "visitor", visitor }
    return NextResponse.json({ error: "Unauthorized. Call geodesics_agent_login first." }, {
        status: 401,
        headers: agentCorsHeaders(req),
    })
}

const ORIGIN_OK = /^http:\/\/(localhost|127\.0\.0\.1):\d+$/i

export function agentCorsHeaders(req: NextRequest): Record<string, string> {
    const origin = req.headers.get("origin") ?? ""
    const extra = (process.env.GEODESICS_CORS_ORIGINS ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Accept",
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
    }
    if (ORIGIN_OK.test(origin) || extra.includes(origin)) {
        headers["Access-Control-Allow-Origin"] = origin
    }
    return headers
}

export function agentOptionsResponse(req: NextRequest) {
    return new NextResponse(null, { status: 204, headers: agentCorsHeaders(req) })
}
