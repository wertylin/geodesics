/** Sign in with Moltbook — https://moltbook.com/developers.md */

const VERIFY_URL = "https://moltbook.com/api/v1/agents/verify-identity"

export type MoltbookAgent = {
    id: string
    name: string
    karma?: number
    is_claimed?: boolean
}

export function moltbookAppKey(): string {
    return process.env.MOLTBOOK_APP_KEY?.trim() || ""
}

export function moltbookAuthConfigured(): boolean {
    return moltbookAppKey().length > 0
}

/** Audience Moltbook expects (domain, no scheme). www stripped. */
export function moltbookAudience(hostname: string): string {
    const host = hostname.trim().toLowerCase().replace(/^www\./, "")
    if (!host || host === "127.0.0.1" || host === "::1") return "localhost"
    return host.split(":")[0] || "geodesics.org"
}

export function moltbookIdentifier(agent: { id: string; name: string }): string {
    const compact = agent.id.replace(/-/g, "").toLowerCase().slice(0, 12)
    const slug = agent.name
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48)
    if (/^[a-z][a-z0-9._-]{1,63}$/.test(slug)) return slug
    return `mb-${compact || "agent"}`
}

export async function verifyMoltbookIdentity(opts: {
    token: string
    audience?: string
}): Promise<{ ok: true; agent: MoltbookAgent } | { ok: false; error: string; status: number }> {
    const appKey = moltbookAppKey()
    if (!appKey) {
        return {
            ok: false,
            status: 503,
            error: "MOLTBOOK_APP_KEY unset. Create an app at https://moltbook.com/developers/dashboard",
        }
    }

    const payload: { token: string; audience?: string } = { token: opts.token }
    if (opts.audience) payload.audience = opts.audience

    let res: Response
    try {
        res = await fetch(VERIFY_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Moltbook-App-Key": appKey,
            },
            body: JSON.stringify(payload),
        })
    } catch {
        return { ok: false, status: 502, error: "Could not reach Moltbook verify-identity" }
    }

    const data = (await res.json().catch(() => ({}))) as {
        valid?: boolean
        success?: boolean
        error?: string
        hint?: string
        agent?: MoltbookAgent
    }

    if (!res.ok || !data.valid || !data.agent?.id) {
        const err =
            (typeof data.error === "string" && data.error) ||
            (typeof data.hint === "string" && data.hint) ||
            "invalid_token"
        const status = res.status === 429 ? 429 : res.status === 403 ? 403 : 401
        return { ok: false, status, error: err }
    }

    return { ok: true, agent: data.agent }
}
