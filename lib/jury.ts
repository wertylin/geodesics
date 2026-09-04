import { createHash, timingSafeEqual } from "crypto"
import { hasDatabase, sql } from "@/lib/db"
import { authSecret } from "@/lib/secrets"
import { addNetworkMember } from "@/lib/trust-network"

export type Juror = {
    slug: string
    shortcut: string
    name: string
    title: string
    org: string
    kicker: string
    lens: JurorLens
}

export type JurorLens =
    | "chrome"
    | "edge"
    | "next"
    | "http"
    | "mcpb"
    | "applied"
    | "browser-agent"

export const JURORS: Juror[] = [
    {
        slug: "sarah-drasner",
        shortcut: "sdr",
        name: "Sarah Drasner",
        title: "Distinguished Engineer, Chrome",
        org: "Google",
        kicker: "THE PAGE IS THE SERVER",
        lens: "chrome",
    },
    {
        slug: "andrew-galloni",
        shortcut: "ag",
        name: "Andrew Galloni",
        title: "VP of Research & Innovation",
        org: "Cloudflare",
        kicker: "A TRAIL IS A ROUTE, NOT A SITEMAP",
        lens: "edge",
    },
    {
        slug: "jude-gao",
        shortcut: "jg",
        name: "Jude Gao",
        title: "Technical Staff · Next.js Core Team",
        org: "Vercel",
        kicker: "THE MAP IS THE ROUTER",
        lens: "next",
    },
    {
        slug: "ilya-grigorik",
        shortcut: "ig",
        name: "Ilya Grigorik",
        title: "Distinguished Engineer",
        org: "Shopify",
        kicker: "HTTP WAS THE FIRST GEODESIC",
        lens: "http",
    },
    {
        slug: "alex-nahas",
        shortcut: "an",
        name: "Alex Nahas",
        title: "Creator of MCP-B",
        org: "MCP-B",
        kicker: "THE BROWSER IS THE MCP HOST",
        lens: "mcpb",
    },
    {
        slug: "sean-roberts",
        shortcut: "sr",
        name: "Sean Roberts",
        title: "VP of Applied AI",
        org: "Netlify",
        kicker: "SHIP THE PATH, NOT THE PITCH",
        lens: "applied",
    },
    {
        slug: "justin-rushing",
        shortcut: "jr",
        name: "Justin Rushing",
        title: "Browser Agent Lead",
        org: "OpenAI",
        kicker: "THE AGENT IS A GUEST ON THIS ORIGIN",
        lens: "browser-agent",
    },
]

export const JURY_COOKIE = "geodesics_jury"

function juryCodeMap(): Record<string, string> {
    const raw = process.env.GEODESICS_JURY?.trim()
    if (!raw) return {}
    const out: Record<string, string> = {}
    for (const part of raw.split(/[,;\n]+/)) {
        const cut = part.trim()
        if (!cut) continue
        const eq = cut.indexOf("=")
        if (eq < 1) continue
        const shortcut = cut.slice(0, eq).trim().toLowerCase()
        const code = cut.slice(eq + 1).trim()
        if (shortcut && code) out[shortcut] = code
    }
    return out
}

function envCode(juror: Juror): string | undefined {
    const fromMap = juryCodeMap()[juror.shortcut]
    if (fromMap) return fromMap
    const fromKey = process.env[`GEODESICS_JURY_${juror.shortcut.toUpperCase()}`]?.trim()
    return fromKey || undefined
}

function normalizeCode(code: string): string {
    return code
        .trim()
        .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, "-")
        .replace(/\s+/g, "")
        .toUpperCase()
}

function looksLikeStoredHash(code: string): boolean {
    return /^[0-9A-F]{64}$/i.test(code.trim())
}

function hashCode(code: string): string | undefined {
    const pepper = authSecret()
    if (!pepper) return undefined
    return createHash("sha256").update(`${pepper}:${normalizeCode(code)}`).digest("hex")
}

function hashesEqual(a: string, b: string): boolean {
    const left = Buffer.from(a)
    const right = Buffer.from(b)
    if (left.length !== right.length) return false
    return timingSafeEqual(left, right)
}

export function getJuror(slug: string): Juror | undefined {
    return JURORS.find((j) => j.slug === slug)
}

export async function seedJury() {
    if (!hasDatabase()) return
    if (!authSecret()) return
    const db = sql()
    for (const juror of JURORS) {
        const code = envCode(juror)
        if (!code) continue
        const codeHash = hashCode(code)
        if (!codeHash) continue
        await db`
            INSERT INTO jury (slug, name, title, org, code_hash)
            VALUES (${juror.slug}, ${juror.name}, ${juror.title}, ${juror.org}, ${codeHash})
            ON CONFLICT (slug) DO UPDATE SET
                name = EXCLUDED.name,
                title = EXCLUDED.title,
                org = EXCLUDED.org,
                code_hash = EXCLUDED.code_hash
        `
        // Desk code holders are pre-allowed on the jury trust ring.
        await addNetworkMember({
            network: "jury",
            principal: juryNetworkPrincipal(juror.slug),
            kind: "juror",
        }).catch(() => {})
    }
}

export function juryNetworkPrincipal(slug: string): string {
    return `jury:${slug.trim().toLowerCase()}`
}

/** Match a desk code to a seeded juror (does not mutate). */
export async function matchJuryCode(
    code: string
): Promise<{ ok: true; juror: Juror } | { ok: false; error: string }> {
    if (looksLikeStoredHash(code)) {
        return { ok: false, error: "That's the stored hash, not the desk code." }
    }
    const normalized = normalizeCode(code)
    if (!normalized) return { ok: false, error: "code is required" }
    if (!hasDatabase()) return { ok: false, error: "database unavailable" }
    const incoming = hashCode(normalized)
    if (!incoming) return { ok: false, error: "GEODESICS_AUTH_SECRET is not set" }

    const rows = await sql()`SELECT slug, code_hash FROM jury`
    const match = rows.find((row) => hashesEqual(String(row.code_hash), incoming))
    if (!match) return { ok: false, error: "Unknown code." }
    const juror = getJuror(String(match.slug))
    if (!juror) return { ok: false, error: "Unknown code." }
    return { ok: true, juror }
}

export async function redeemJuryCode(
    code: string
): Promise<{ ok: true; juror: Juror } | { ok: false; error: string }> {
    const matched = await matchJuryCode(code)
    if (!matched.ok) return matched

    await sql()`UPDATE jury SET last_seen = NOW() WHERE slug = ${matched.juror.slug}`
    return matched
}

export async function recordJuryVisit(slug: string, ua?: string | null) {
    if (!hasDatabase()) return
    await sql()`INSERT INTO jury_visits (slug, ua) VALUES (${slug}, ${ua ?? null})`
}

export function juryCookieHeader(slug: string, secure: boolean): string {
    const maxAge = 60 * 60 * 24 * 30
    return `${JURY_COOKIE}=${slug}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${
        secure ? "; Secure" : ""
    }`
}
