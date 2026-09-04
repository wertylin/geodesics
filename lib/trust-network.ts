import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"
import { hasDatabase, sql } from "@/lib/db"
import { authSecret } from "@/lib/secrets"
import {
    TRUST_RINGS,
    isTrustNetworkId,
    type TrustNetworkId,
    type TrustRingDef,
} from "@/lib/trust-rings"

export type { TrustNetworkId }
export { isTrustNetworkId }

export type TrustNetwork = {
    id: TrustNetworkId
    label: string
    blurb: string
    /** Invite key configured in env. Empty = network closed. */
    configured: boolean
}

export type NetworkMember = {
    network: TrustNetworkId
    principal: string
    kind: "agent" | "juror" | "host"
    joined_at: string
}

const NETWORKS: TrustRingDef[] = TRUST_RINGS

function normalizeKey(raw: string): string {
    return raw.trim().replace(/\s+/g, "")
}

function hashInvite(network: TrustNetworkId, key: string): string | undefined {
    const pepper = authSecret()
    if (!pepper) return undefined
    return createHash("sha256").update(`${pepper}:network:${network}:${normalizeKey(key)}`).digest("hex")
}

function envInvite(network: TrustNetworkId): string | undefined {
    const row = NETWORKS.find((n) => n.id === network)
    if (!row) return undefined
    const v = process.env[row.envKey]?.trim()
    return v || undefined
}

export function listTrustNetworks(): TrustNetwork[] {
    return NETWORKS.map((n) => ({
        id: n.id,
        label: n.label,
        blurb: n.blurb,
        configured: Boolean(envInvite(n.id)),
    }))
}

async function ensureMembersTable() {
    if (!hasDatabase()) return
    await sql()`
        CREATE TABLE IF NOT EXISTS network_members (
            network TEXT NOT NULL,
            principal TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'agent',
            joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            PRIMARY KEY (network, principal)
        )
    `
}

export async function addNetworkMember(opts: {
    network: TrustNetworkId
    principal: string
    kind: NetworkMember["kind"]
}): Promise<NetworkMember> {
    const principal = opts.principal.trim().toLowerCase()
    if (principal.length < 2) throw Object.assign(new Error("principal is required"), { status: 400 })
    if (!hasDatabase()) throw Object.assign(new Error("database unavailable"), { status: 503 })
    await ensureMembersTable()
    const rows = await sql()`
        INSERT INTO network_members (network, principal, kind)
        VALUES (${opts.network}, ${principal}, ${opts.kind})
        ON CONFLICT (network, principal) DO UPDATE SET kind = EXCLUDED.kind
        RETURNING network, principal, kind, joined_at
    `
    const row = rows[0]
    return {
        network: String(row.network) as TrustNetworkId,
        principal: String(row.principal),
        kind: String(row.kind) as NetworkMember["kind"],
        joined_at:
            row.joined_at instanceof Date
                ? row.joined_at.toISOString()
                : new Date(String(row.joined_at)).toISOString(),
    }
}

export async function listNetworkMembers(network?: TrustNetworkId): Promise<NetworkMember[]> {
    if (!hasDatabase()) return []
    try {
        await ensureMembersTable()
        const rows = network
            ? await sql()`
                SELECT network, principal, kind, joined_at
                FROM network_members
                WHERE network = ${network}
                ORDER BY joined_at ASC
              `
            : await sql()`
                SELECT network, principal, kind, joined_at
                FROM network_members
                ORDER BY network ASC, joined_at ASC
              `
        return rows.map((row) => ({
            network: String(row.network) as TrustNetworkId,
            principal: String(row.principal),
            kind: String(row.kind) as NetworkMember["kind"],
            joined_at:
                row.joined_at instanceof Date
                    ? row.joined_at.toISOString()
                    : new Date(String(row.joined_at)).toISOString(),
        }))
    } catch {
        return []
    }
}

export async function networksForPrincipal(principal: string): Promise<TrustNetworkId[]> {
    if (!hasDatabase() || !principal.trim()) return []
    try {
        await ensureMembersTable()
        const rows = await sql()`
            SELECT network FROM network_members WHERE principal = ${principal.trim().toLowerCase()}
        `
        return rows.map((r) => String(r.network) as TrustNetworkId)
    } catch {
        return []
    }
}

export async function principalInAnyNetwork(principal: string): Promise<boolean> {
    const nets = await networksForPrincipal(principal)
    return nets.length > 0
}

/** Agent ids that belong to at least one trust network. */
export async function networkedAgentIds(): Promise<Set<string>> {
    const members = await listNetworkMembers()
    return new Set(
        members.filter((m) => m.kind === "agent" || m.kind === "host").map((m) => m.principal)
    )
}

export async function joinNetworkWithKey(opts: {
    network: TrustNetworkId
    key: string
    principal: string
    kind?: NetworkMember["kind"]
}): Promise<NetworkMember> {
    const invite = envInvite(opts.network)
    if (!invite) {
        throw Object.assign(new Error(`Network "${opts.network}" is not open`), { status: 404 })
    }
    const expected = hashInvite(opts.network, invite)
    const incoming = hashInvite(opts.network, opts.key)
    if (!expected || !incoming) {
        throw Object.assign(new Error("GEODESICS_AUTH_SECRET is not set"), { status: 503 })
    }
    const a = Buffer.from(expected)
    const b = Buffer.from(incoming)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw Object.assign(new Error("Invalid network key"), { status: 401 })
    }
    return addNetworkMember({
        network: opts.network,
        principal: opts.principal,
        kind: opts.kind ?? "agent",
    })
}

/** Seed host + openclaw into jury when configured. */
export async function seedTrustNetworkHosts() {
    if (!hasDatabase()) return
    const host = process.env.GEODESICS_NETWORK_JURY_HOST?.trim().toLowerCase()
    if (host) {
        await addNetworkMember({ network: "jury", principal: host, kind: "host" }).catch(() => {})
    }
    if (process.env.GEODESICS_OPENCLAW_SECRET?.trim()) {
        await addNetworkMember({ network: "jury", principal: "openclaw", kind: "agent" }).catch(() => {})
    }
}

/* ── write nonce (binds POST to a live tab that fetched it) ── */

const WRITE_TTL_MS = 15 * 60 * 1000

export function mintWriteNonce(principal: string): string {
    const secret = authSecret()
    if (!secret) throw new Error("GEODESICS_AUTH_SECRET is not set")
    const exp = Date.now() + WRITE_TTL_MS
    const nonce = randomBytes(12).toString("base64url")
    const body = `${principal.trim().toLowerCase()}.${exp}.${nonce}`
    const mac = createHmac("sha256", secret).update(`write:${body}`).digest("base64url")
    return `${body}.${mac}`
}

export function verifyWriteNonce(token: string, principal: string): boolean {
    const secret = authSecret()
    if (!secret || !token.includes(".")) return false
    const parts = token.split(".")
    if (parts.length !== 4) return false
    const [p, expRaw, nonce, mac] = parts
    if (p !== principal.trim().toLowerCase()) return false
    const exp = Number(expRaw)
    if (!Number.isFinite(exp) || exp < Date.now()) return false
    const body = `${p}.${expRaw}.${nonce}`
    const expected = createHmac("sha256", secret).update(`write:${body}`).digest("base64url")
    const a = Buffer.from(expected)
    const b = Buffer.from(mac)
    if (a.length !== b.length) return false
    return timingSafeEqual(a, b)
}

/* ── rate limit per principal ── */

const RATE_WINDOW_MS = 60 * 60 * 1000
const RATE_MAX = 20

const g = globalThis as typeof globalThis & {
    __geodesicsLeaveRate?: Map<string, number[]>
}

function rateMap(): Map<string, number[]> {
    if (!g.__geodesicsLeaveRate) g.__geodesicsLeaveRate = new Map()
    return g.__geodesicsLeaveRate
}

export function assertLeaveRate(principal: string) {
    const key = principal.trim().toLowerCase()
    const now = Date.now()
    const map = rateMap()
    const prev = (map.get(key) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
    if (prev.length >= RATE_MAX) {
        throw Object.assign(new Error(`Rate limit: max ${RATE_MAX} trails / hour for this principal`), {
            status: 429,
        })
    }
    prev.push(now)
    map.set(key, prev)
}
