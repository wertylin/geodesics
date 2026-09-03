export type TrailStatus = "verified" | "observed" | "changed"

export type Trail = {
    id: string
    agent: string
    origin: string
    route: string
    status: TrailStatus
    age: string
    goal?: string
    discovered_at?: string
}

const LOOPBACK_HOST =
    /^(localhost|\.localhost$|127(?:\.\d+){3}|0\.0\.0\.0|\[?::1\]?|::ffff:127(?:\.\d+){3})$/i

export function hostFromOrigin(raw: string): string {
    const s = raw.trim()
    if (!s) return ""
    try {
        const u = s.includes("://") ? new URL(s) : new URL(`https://${s}`)
        return u.hostname.replace(/^\[|\]$/g, "").toLowerCase()
    } catch {
        return s.split("/")[0].split(":")[0].replace(/^\[|\]$/g, "").toLowerCase()
    }
}

export function isLoopbackOrigin(raw: string): boolean {
    const host = hostFromOrigin(raw)
    if (!host) return true
    if (host === "localhost" || host.endsWith(".localhost")) return true
    return LOOPBACK_HOST.test(host)
}

export function assertPublicOrigin(raw: string) {
    if (isLoopbackOrigin(raw)) {
        throw Object.assign(new Error("Loopback origins (localhost, 127.0.0.1, ::1) cannot be registered."), {
            status: 400,
        })
    }
}

export function formatTrailAge(iso?: string): string {
    if (!iso) return "just now"
    const ms = Date.now() - new Date(iso).getTime()
    if (!Number.isFinite(ms) || ms < 60_000) return "just now"
    const hours = Math.floor(ms / 3_600_000)
    if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}
