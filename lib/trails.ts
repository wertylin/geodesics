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

export function formatTrailAge(iso?: string): string {
    if (!iso) return "just now"
    const ms = Date.now() - new Date(iso).getTime()
    if (!Number.isFinite(ms) || ms < 60_000) return "just now"
    const hours = Math.floor(ms / 3_600_000)
    if (hours < 1) return `${Math.max(1, Math.floor(ms / 60_000))}m ago`
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
}
