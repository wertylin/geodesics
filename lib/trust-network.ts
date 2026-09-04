import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto"
import { ensureSchema, hasDatabase, sql } from "@/lib/db"
import { authSecret } from "@/lib/secrets"
import {
    TRUST_RINGS,
    isBuiltinTrustNetworkId,
    isNetworkIdFormat,
    isTrustNetworkId,
    type BuiltinTrustNetworkId,
    type TrustNetworkId,
    type TrustRingDef,
} from "@/lib/trust-rings"

export type { TrustNetworkId, BuiltinTrustNetworkId }
export { isTrustNetworkId, isBuiltinTrustNetworkId, isNetworkIdFormat }

export type TrustNetwork = {
    id: TrustNetworkId
    label: string
    blurb: string
    /** Invite key configured (env or DB). Empty = network closed. */
    configured: boolean
    kind: "system" | "human"
    owner_principal?: string
}

export type NetworkMember = {
    network: TrustNetworkId
    principal: string
    kind: "agent" | "juror" | "host" | "human"
    joined_at: string
}

export type HumanNetworkRow = {
    id: string
    label: string
    kind: "human"
    owner_principal: string
    invite_hash: string
    created_at: string
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

function envInvite(network: BuiltinTrustNetworkId): string | undefined {
    const row = NETWORKS.find((n) => n.id === network)
    if (!row) return undefined
    const v = process.env[row.envKey]?.trim()
    return v || undefined
}

function mapMemberRow(row: Record<string, unknown>): NetworkMember {
    return {
        network: String(row.network),
        principal: String(row.principal),
        kind: String(row.kind) as NetworkMember["kind"],
        joined_at:
            row.joined_at instanceof Date
                ? row.joined_at.toISOString()
                : new Date(String(row.joined_at)).toISOString(),
    }
}

async function ensureNetworksTables() {
    if (!hasDatabase()) return
    await ensureSchema()
    await sql()`
        CREATE TABLE IF NOT EXISTS networks (
            id TEXT PRIMARY KEY,
            label TEXT NOT NULL,
            kind TEXT NOT NULL DEFAULT 'human',
            owner_principal TEXT NOT NULL,
            invite_hash TEXT NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `
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

export function listBuiltinTrustNetworks(): TrustNetwork[] {
    return NETWORKS.map((n) => ({
        id: n.id,
        label: n.label,
        blurb: n.blurb,
        configured: Boolean(envInvite(n.id)),
        kind: "system" as const,
    }))
}

/** @deprecated use listAllTrustNetworks — builtins only */
export function listTrustNetworks(): TrustNetwork[] {
    return listBuiltinTrustNetworks()
}

export async function listHumanNetworks(): Promise<TrustNetwork[]> {
    if (!hasDatabase()) return []
    try {
        await ensureNetworksTables()
        const rows = await sql()`
            SELECT id, label, owner_principal, created_at
            FROM networks
            WHERE kind = 'human'
            ORDER BY created_at DESC
            LIMIT 200
        `
        return rows.map((row) => ({
            id: String(row.id),
            label: String(row.label),
            blurb: "human trust network",
            configured: true,
            kind: "human" as const,
            owner_principal: String(row.owner_principal),
        }))
    } catch {
        return []
    }
}

export async function listAllTrustNetworks(): Promise<TrustNetwork[]> {
    const human = await listHumanNetworks()
    return [...listBuiltinTrustNetworks(), ...human]
}

export async function getHumanNetwork(id: string): Promise<HumanNetworkRow | null> {
    if (!hasDatabase() || !id.trim()) return null
    try {
        await ensureNetworksTables()
        const rows = await sql()`
            SELECT id, label, kind, owner_principal, invite_hash, created_at
            FROM networks
            WHERE id = ${id.trim().toLowerCase()}
            LIMIT 1
        `
        const row = rows[0]
        if (!row) return null
        return {
            id: String(row.id),
            label: String(row.label),
            kind: "human",
            owner_principal: String(row.owner_principal),
            invite_hash: String(row.invite_hash),
            created_at:
                row.created_at instanceof Date
                    ? row.created_at.toISOString()
                    : new Date(String(row.created_at)).toISOString(),
        }
    } catch {
        return null
    }
}

export async function addNetworkMember(opts: {
    network: TrustNetworkId
    principal: string
    kind: NetworkMember["kind"]
}): Promise<NetworkMember> {
    const principal = opts.principal.trim().toLowerCase()
    if (principal.length < 2) throw Object.assign(new Error("principal is required"), { status: 400 })
    if (!hasDatabase()) throw Object.assign(new Error("database unavailable"), { status: 503 })
    await ensureNetworksTables()
    const rows = await sql()`
        INSERT INTO network_members (network, principal, kind)
        VALUES (${opts.network}, ${principal}, ${opts.kind})
        ON CONFLICT (network, principal) DO UPDATE SET kind = EXCLUDED.kind
        RETURNING network, principal, kind, joined_at
    `
    return mapMemberRow(rows[0] as Record<string, unknown>)
}

export async function listNetworkMembers(network?: TrustNetworkId): Promise<NetworkMember[]> {
    if (!hasDatabase()) return []
    try {
        await ensureNetworksTables()
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
        return rows.map((row) => mapMemberRow(row as Record<string, unknown>))
    } catch {
        return []
    }
}

export async function networksForPrincipal(principal: string): Promise<TrustNetworkId[]> {
    if (!hasDatabase() || !principal.trim()) return []
    try {
        await ensureNetworksTables()
        const rows = await sql()`
            SELECT network FROM network_members WHERE principal = ${principal.trim().toLowerCase()}
        `
        return rows.map((r) => String(r.network))
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

export function memberKindForAuth(authType: string | undefined | null): NetworkMember["kind"] {
    return authType === "human_couple" ? "human" : "agent"
}

/**
 * When a human↔agent couple bonds (or human creates a network), mirror the agent
 * onto every network the human already belongs to.
 */
export async function syncLinkedAgentOntoHumanNetworks(opts: {
    humanPrincipal: string
    agent: string
}): Promise<TrustNetworkId[]> {
    const human = opts.humanPrincipal.trim().toLowerCase()
    const agent = opts.agent.trim().toLowerCase()
    if (!human || !agent) return []
    const nets = await networksForPrincipal(human)
    for (const network of nets) {
        await addNetworkMember({ network, principal: agent, kind: "agent" }).catch(() => {})
    }
    return nets
}

/** Also add linked agent when a human joins / creates a single network. */
export async function assignCoupleToNetwork(opts: {
    network: TrustNetworkId
    humanPrincipal: string
    linkedAgent?: string | null
}): Promise<NetworkMember[]> {
    const out: NetworkMember[] = []
    out.push(
        await addNetworkMember({
            network: opts.network,
            principal: opts.humanPrincipal,
            kind: "human",
        })
    )
    const agent = opts.linkedAgent?.trim().toLowerCase()
    if (agent) {
        out.push(await addNetworkMember({ network: opts.network, principal: agent, kind: "agent" }))
    }
    return out
}

export async function createHumanTrustNetwork(opts: {
    ownerPrincipal: string
    label?: string
    linkedAgent?: string | null
}): Promise<{ network: TrustNetwork; invite: string; members: NetworkMember[] }> {
    if (!hasDatabase()) throw Object.assign(new Error("database unavailable"), { status: 503 })
    const owner = opts.ownerPrincipal.trim().toLowerCase()
    if (!owner.startsWith("human:")) {
        throw Object.assign(new Error("Only authenticated humans can start a trust network"), { status: 403 })
    }
    const pepper = authSecret()
    if (!pepper) throw Object.assign(new Error("GEODESICS_AUTH_SECRET is not set"), { status: 503 })

    const slug = randomBytes(8).toString("base64url").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 12)
    const id = `hn_${slug || randomBytes(6).toString("hex")}`
    const label = (opts.label?.trim() || "human trust network").slice(0, 80)
    const invite = `net_${randomBytes(18).toString("base64url")}`
    const invite_hash = hashInvite(id, invite)
    if (!invite_hash) throw Object.assign(new Error("GEODESICS_AUTH_SECRET is not set"), { status: 503 })

    await ensureNetworksTables()
    await sql()`
        INSERT INTO networks (id, label, kind, owner_principal, invite_hash)
        VALUES (${id}, ${label}, 'human', ${owner}, ${invite_hash})
    `

    const members = await assignCoupleToNetwork({
        network: id,
        humanPrincipal: owner,
        linkedAgent: opts.linkedAgent,
    })

    return {
        network: {
            id,
            label,
            blurb: "human trust network",
            configured: true,
            kind: "human",
            owner_principal: owner,
        },
        invite,
        members,
    }
}

export async function joinNetworkWithKey(opts: {
    network: TrustNetworkId
    key: string
    principal: string
    kind?: NetworkMember["kind"]
}): Promise<NetworkMember> {
    const network = opts.network.trim().toLowerCase()
    if (!isNetworkIdFormat(network)) {
        throw Object.assign(new Error("Invalid network id"), { status: 400 })
    }

    const incoming = hashInvite(network, opts.key)
    if (!incoming) {
        throw Object.assign(new Error("GEODESICS_AUTH_SECRET is not set"), { status: 503 })
    }

    let expected: string | undefined

    if (isBuiltinTrustNetworkId(network)) {
        const invite = envInvite(network)
        if (!invite) {
            throw Object.assign(new Error(`Network "${network}" is not open`), { status: 404 })
        }
        expected = hashInvite(network, invite)
    } else {
        const row = await getHumanNetwork(network)
        if (!row) {
            throw Object.assign(new Error(`Network "${network}" is not open`), { status: 404 })
        }
        expected = row.invite_hash
    }

    if (!expected) {
        throw Object.assign(new Error("GEODESICS_AUTH_SECRET is not set"), { status: 503 })
    }
    const a = Buffer.from(expected)
    const b = Buffer.from(incoming)
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
        throw Object.assign(new Error("Invalid network key"), { status: 401 })
    }
    return addNetworkMember({
        network,
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
