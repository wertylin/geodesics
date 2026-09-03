import { randomBytes, scrypt, timingSafeEqual } from "crypto"
import { promises as fs } from "fs"
import path from "path"
import { promisify } from "util"

const scryptAsync = promisify(scrypt)
const SCRYPT_KEYLEN = 64
const STORE_PATH = path.join(process.cwd(), "data", "issued-agents.json")

export type IssuedAgentPublic = {
    identifier: string
    display_name: string | null
    email: string | null
    initiated_by: string
}

type IssuedAgentRecord = IssuedAgentPublic & {
    secret_hash: string
    status: "active" | "disabled"
}

type AgentStore = { agents: IssuedAgentRecord[] }

const g = globalThis as typeof globalThis & { __geodesicsAgents?: AgentStore }

function defaultOpenclawSecret(): string {
    return process.env.GEODESICS_OPENCLAW_SECRET?.trim() || ""
}

function envExtraAgents(): Array<{ identifier: string; secret: string; display_name?: string; email?: string }> {
    const raw = process.env.GEODESICS_ISSUED_AGENTS?.trim()
    if (!raw) return []
    try {
        const parsed = JSON.parse(raw) as unknown
        if (!Array.isArray(parsed)) return []
        return parsed.flatMap((row) => {
            if (!row || typeof row !== "object") return []
            const identifier = typeof (row as { identifier?: string }).identifier === "string"
                ? (row as { identifier: string }).identifier
                : ""
            const secret = typeof (row as { secret?: string }).secret === "string"
                ? (row as { secret: string }).secret
                : ""
            if (!identifier || !secret) return []
            return [
                {
                    identifier,
                    secret,
                    display_name:
                        typeof (row as { display_name?: string }).display_name === "string"
                            ? (row as { display_name: string }).display_name
                            : undefined,
                    email: typeof (row as { email?: string }).email === "string"
                        ? (row as { email: string }).email
                        : undefined,
                },
            ]
        })
    } catch {
        return []
    }
}

async function hashSecret(secret: string): Promise<string> {
    const salt = randomBytes(16)
    const derived = (await scryptAsync(secret, salt, SCRYPT_KEYLEN)) as Buffer
    return `${salt.toString("hex")}:${derived.toString("hex")}`
}

async function verifySecret(secret: string, stored: string): Promise<boolean> {
    const [saltHex, hashHex] = stored.split(":")
    if (!saltHex || !hashHex) return false
    const salt = Buffer.from(saltHex, "hex")
    const expected = Buffer.from(hashHex, "hex")
    const derived = (await scryptAsync(secret, salt, expected.length)) as Buffer
    if (derived.length !== expected.length) return false
    return timingSafeEqual(derived, expected)
}

async function readFileStore(): Promise<IssuedAgentRecord[]> {
    try {
        const raw = await fs.readFile(STORE_PATH, "utf8")
        const parsed = JSON.parse(raw) as AgentStore
        return Array.isArray(parsed.agents) ? parsed.agents : []
    } catch {
        return []
    }
}

async function writeFileStore(agents: IssuedAgentRecord[]) {
    try {
        await fs.mkdir(path.dirname(STORE_PATH), { recursive: true })
        await fs.writeFile(STORE_PATH, JSON.stringify({ agents }, null, 2), "utf8")
    } catch {
        /* ephemeral on serverless */
    }
}

function toPublic(row: IssuedAgentRecord): IssuedAgentPublic {
    return {
        identifier: row.identifier,
        display_name: row.display_name,
        email: row.email,
        initiated_by: row.initiated_by,
    }
}

async function ensureStore(): Promise<AgentStore> {
    if (g.__geodesicsAgents) return g.__geodesicsAgents

    const agents = await readFileStore()
    const byId = new Map(agents.map((a) => [a.identifier.toLowerCase(), a]))

    const seeds = envExtraAgents()
    const openclaw = defaultOpenclawSecret()
    if (openclaw) {
        seeds.unshift({
            identifier: "openclaw",
            secret: openclaw,
            display_name: "OpenClaw",
            email: "openclaw@geodesics.local",
        })
    }

    for (const seed of seeds) {
        const key = seed.identifier.trim().toLowerCase()
        if (byId.has(key)) continue
        byId.set(key, {
            identifier: key,
            display_name: seed.display_name ?? key,
            email: seed.email ?? `${key}@geodesics.local`,
            initiated_by: "geodesics",
            secret_hash: await hashSecret(seed.secret),
            status: "active",
        })
    }

    const store: AgentStore = { agents: Array.from(byId.values()) }
    g.__geodesicsAgents = store
    if (store.agents.length) await writeFileStore(store.agents)
    return store
}

export async function listIssuedAgents(): Promise<IssuedAgentPublic[]> {
    const store = await ensureStore()
    return store.agents.filter((a) => a.status === "active").map(toPublic)
}

export async function verifyAgentLogin(opts: {
    identifier: string
    secret: string
}): Promise<{ ok: true; agent: IssuedAgentPublic } | { ok: false; error: string }> {
    const identifier = opts.identifier.trim().toLowerCase()
    const secret = opts.secret.trim()
    if (!identifier) return { ok: false, error: "identifier is required" }
    if (!secret) return { ok: false, error: "secret is required — issued principal, not self-asserted" }

    const store = await ensureStore()
    const row = store.agents.find(
        (a) => a.identifier.toLowerCase() === identifier || (a.email ?? "").toLowerCase() === identifier
    )
    if (!row) {
        return {
            ok: false,
            error: "Unknown agent. GET /api/agent/issued, or POST /api/agent/initiate to mint one.",
        }
    }
    if (row.status !== "active") return { ok: false, error: "Agent is not active" }
    const matches = await verifySecret(secret, row.secret_hash)
    if (!matches) return { ok: false, error: "Invalid secret" }
    return { ok: true, agent: toPublic(row) }
}

export async function initiateAgent(opts: {
    identifier: string
    displayName?: string
    email?: string
    rotateSecret?: boolean
}): Promise<{ created: boolean; secret?: string; agent: IssuedAgentPublic }> {
    const identifier = opts.identifier.trim().toLowerCase()
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(identifier)) {
        throw Object.assign(new Error("identifier must be a lowercase slug"), { status: 400 })
    }

    const store = await ensureStore()
    const existing = store.agents.find((a) => a.identifier === identifier)
    const displayName = opts.displayName?.trim() || identifier
    const email = (opts.email ?? `${identifier}@geodesics.local`).trim().toLowerCase()

    if (existing && !opts.rotateSecret) {
        existing.display_name = displayName
        existing.email = email
        await writeFileStore(store.agents)
        return { created: false, agent: toPublic(existing) }
    }

    const secret = randomBytes(18).toString("base64url")
    const secretHash = await hashSecret(secret)
    if (existing) {
        existing.secret_hash = secretHash
        existing.display_name = displayName
        existing.email = email
        existing.status = "active"
        await writeFileStore(store.agents)
        return { created: false, secret, agent: toPublic(existing) }
    }

    const row: IssuedAgentRecord = {
        identifier,
        display_name: displayName,
        email,
        initiated_by: "geodesics",
        secret_hash: secretHash,
        status: "active",
    }
    store.agents.push(row)
    await writeFileStore(store.agents)
    return { created: true, secret, agent: toPublic(row) }
}
