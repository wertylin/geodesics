import { createHmac, randomBytes, timingSafeEqual } from "crypto"
import { authSecret } from "@/lib/secrets"
import { ensureSchema, hasDatabase, sql } from "@/lib/db"
import type { VisitorAgentSession } from "@/lib/agent-session"
import { normalizeAuthType } from "@/lib/auth-types"

export type HumanRow = {
    google_sub: string
    email: string
    display_name: string | null
    picture: string | null
    linked_agent: string | null
    couple_key_hash: string | null
    created_at: string
    last_login: string
}

function googleClientId() {
    return process.env.GOOGLE_CLIENT_ID?.trim() || ""
}

function googleClientSecret() {
    return process.env.GOOGLE_CLIENT_SECRET?.trim() || ""
}

export function googleAuthConfigured(): boolean {
    return Boolean(googleClientId() && googleClientSecret() && authSecret())
}

export function googleRedirectUri(origin: string): string {
    const override = process.env.GOOGLE_REDIRECT_URI?.trim()
    if (override) return override
    return `${origin.replace(/\/$/, "")}/api/auth/google/callback`
}

export function googleAuthorizeUrl(opts: { origin: string; state: string }): string {
    const params = new URLSearchParams({
        client_id: googleClientId(),
        redirect_uri: googleRedirectUri(opts.origin),
        response_type: "code",
        scope: "openid email profile",
        state: opts.state,
        access_type: "online",
        prompt: "select_account",
    })
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`
}

export function mintOAuthState(): string {
    const secret = authSecret()
    if (!secret) throw new Error("GEODESICS_AUTH_SECRET is not set")
    const nonce = randomBytes(16).toString("base64url")
    const exp = Date.now() + 10 * 60 * 1000
    const body = `${nonce}.${exp}`
    const mac = createHmac("sha256", secret).update(`oauth:${body}`).digest("base64url")
    return `${body}.${mac}`
}

export function verifyOAuthState(raw: string | undefined | null): boolean {
    const secret = authSecret()
    if (!secret || !raw) return false
    const parts = raw.split(".")
    if (parts.length !== 3) return false
    const [nonce, expStr, mac] = parts
    if (!nonce || !expStr || !mac) return false
    const exp = Number(expStr)
    if (!Number.isFinite(exp) || exp < Date.now()) return false
    const body = `${nonce}.${expStr}`
    const expected = createHmac("sha256", secret).update(`oauth:${body}`).digest("base64url")
    try {
        const a = Buffer.from(expected)
        const b = Buffer.from(mac)
        return a.length === b.length && timingSafeEqual(a, b)
    } catch {
        return false
    }
}

export async function exchangeGoogleCode(opts: {
    code: string
    origin: string
}): Promise<{ access_token: string }> {
    const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            code: opts.code,
            client_id: googleClientId(),
            client_secret: googleClientSecret(),
            redirect_uri: googleRedirectUri(opts.origin),
            grant_type: "authorization_code",
        }),
    })
    const data = (await res.json().catch(() => ({}))) as {
        access_token?: string
        error?: string
        error_description?: string
    }
    if (!res.ok || !data.access_token) {
        throw Object.assign(
            new Error(data.error_description || data.error || "Google token exchange failed"),
            { status: 401 }
        )
    }
    return { access_token: data.access_token }
}

export type GoogleProfile = {
    sub: string
    email: string
    email_verified?: boolean
    name?: string
    picture?: string
}

export async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
    const res = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
    })
    const data = (await res.json().catch(() => ({}))) as Partial<GoogleProfile> & { error?: string }
    if (!res.ok || !data.sub || !data.email) {
        throw Object.assign(new Error(data.error || "Could not load Google profile"), { status: 401 })
    }
    return {
        sub: data.sub,
        email: data.email,
        email_verified: data.email_verified,
        name: data.name,
        picture: data.picture,
    }
}

export function humanPrincipalId(googleSub: string): string {
    return `human:${googleSub}`
}

export async function upsertHumanFromGoogle(profile: GoogleProfile): Promise<HumanRow> {
    if (!hasDatabase()) {
        // Dev fallback without DB — ephemeral couple session still works.
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
    await ensureSchema()
    const rows = await sql()`
        INSERT INTO humans (google_sub, email, display_name, picture, last_login)
        VALUES (
            ${profile.sub},
            ${profile.email},
            ${profile.name ?? null},
            ${profile.picture ?? null},
            NOW()
        )
        ON CONFLICT (google_sub) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            picture = EXCLUDED.picture,
            last_login = NOW()
        RETURNING google_sub, email, display_name, picture, linked_agent, couple_key_hash, created_at, last_login
    `
    const row = rows[0]
    return mapHumanRow(row)
}

function mapHumanRow(row: Record<string, unknown>): HumanRow {
    return {
        google_sub: String(row.google_sub),
        email: String(row.email),
        display_name: row.display_name == null ? null : String(row.display_name),
        picture: row.picture == null ? null : String(row.picture),
        linked_agent: row.linked_agent == null ? null : String(row.linked_agent),
        couple_key_hash: row.couple_key_hash == null ? null : String(row.couple_key_hash),
        created_at:
            row.created_at instanceof Date
                ? row.created_at.toISOString()
                : new Date(String(row.created_at)).toISOString(),
        last_login:
            row.last_login instanceof Date
                ? row.last_login.toISOString()
                : new Date(String(row.last_login)).toISOString(),
    }
}

export function sessionFromHuman(human: HumanRow): VisitorAgentSession {
    return {
        identifier: humanPrincipalId(human.google_sub),
        display_name: human.display_name,
        email: human.email,
        initiated_by: "google",
        auth_type: "human_couple",
        google_sub: human.google_sub,
        linked_agent: human.linked_agent,
    }
}

export function publicSession(session: VisitorAgentSession) {
    return {
        identifier: session.identifier,
        display_name: session.display_name,
        email: session.email,
        initiated_by: session.initiated_by,
        auth_type: normalizeAuthType(session.auth_type),
        google_sub: session.google_sub ?? null,
        linked_agent: session.linked_agent ?? null,
        coupled_human: session.coupled_human ?? null,
    }
}

/* ── couple invite: human mints short-lived inv_… → agent claims with session ── */

const INVITE_TTL_MS = 10 * 60 * 1000

type MemInvite = {
    google_sub: string
    email: string
    display_name: string | null
    invite_hash: string
    exp: number
}

type MemBond = {
    google_sub: string
    email: string
    display_name: string | null
    linked_agent: string
}

const g = globalThis as typeof globalThis & {
    __geodesicsCoupleInvites?: Map<string, MemInvite>
    __geodesicsCoupleBonds?: Map<string, MemBond>
}

function memInvites(): Map<string, MemInvite> {
    if (!g.__geodesicsCoupleInvites) g.__geodesicsCoupleInvites = new Map()
    return g.__geodesicsCoupleInvites
}

function memBonds(): Map<string, MemBond> {
    if (!g.__geodesicsCoupleBonds) g.__geodesicsCoupleBonds = new Map()
    return g.__geodesicsCoupleBonds
}

function hashInvite(invite: string): string {
    const secret = authSecret()
    if (!secret) throw new Error("GEODESICS_AUTH_SECRET is not set")
    return createHmac("sha256", secret).update(`couple-invite:${invite}`).digest("base64url")
}

export function mintCoupleInviteToken(): string {
    return `inv_${randomBytes(18).toString("base64url")}`
}

export async function getHumanByGoogleSub(googleSub: string): Promise<HumanRow | null> {
    if (!googleSub) return null
    if (!hasDatabase()) {
        const bond = memBonds().get(googleSub)
        const now = new Date().toISOString()
        if (bond) {
            return {
                google_sub: bond.google_sub,
                email: bond.email,
                display_name: bond.display_name,
                picture: null,
                linked_agent: bond.linked_agent,
                couple_key_hash: null,
                created_at: now,
                last_login: now,
            }
        }
        return null
    }
    await ensureSchema()
    const rows = await sql()`
        SELECT google_sub, email, display_name, picture, linked_agent, couple_key_hash, created_at, last_login
        FROM humans WHERE google_sub = ${googleSub}
        LIMIT 1
    `
    if (!rows[0]) return null
    return mapHumanRow(rows[0] as Record<string, unknown>)
}

/** Human mints a short-lived invite to hand to their agent. No agent secret involved. */
export async function mintCoupleInvite(opts: {
    googleSub: string
    email: string
    displayName: string | null
}): Promise<{ invite: string; expires_in_sec: number }> {
    const invite = mintCoupleInviteToken()
    const invite_hash = hashInvite(invite)
    const exp = Date.now() + INVITE_TTL_MS

    if (!hasDatabase()) {
        // one active invite per human
        for (const [k, v] of memInvites()) {
            if (v.google_sub === opts.googleSub) memInvites().delete(k)
        }
        memInvites().set(invite_hash, {
            google_sub: opts.googleSub,
            email: opts.email,
            display_name: opts.displayName,
            invite_hash,
            exp,
        })
        return { invite, expires_in_sec: Math.floor(INVITE_TTL_MS / 1000) }
    }

    await ensureSchema()
    // Defensive: HMR can leave ensureSchema cached before couple_invites existed.
    await sql()`
        CREATE TABLE IF NOT EXISTS couple_invites (
            invite_hash TEXT PRIMARY KEY,
            google_sub TEXT NOT NULL REFERENCES humans(google_sub) ON DELETE CASCADE,
            exp TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `
    await sql()`
        INSERT INTO humans (google_sub, email, display_name, last_login)
        VALUES (${opts.googleSub}, ${opts.email}, ${opts.displayName}, NOW())
        ON CONFLICT (google_sub) DO UPDATE SET
            email = EXCLUDED.email,
            display_name = COALESCE(EXCLUDED.display_name, humans.display_name),
            last_login = NOW()
    `
    await sql()`DELETE FROM couple_invites WHERE google_sub = ${opts.googleSub} OR exp < NOW()`
    await sql()`
        INSERT INTO couple_invites (invite_hash, google_sub, exp)
        VALUES (${invite_hash}, ${opts.googleSub}, ${new Date(exp).toISOString()})
    `
    return { invite, expires_in_sec: Math.floor(INVITE_TTL_MS / 1000) }
}

/** Agent (already logged in) claims invite → bind linked_agent on human. */
export async function claimCoupleInvite(opts: {
    agentIdentifier: string
    invite: string
}): Promise<{ ok: true; human: HumanRow } | { ok: false; error: string }> {
    const agent = opts.agentIdentifier.trim().toLowerCase()
    const invite = opts.invite.trim()
    if (!invite.startsWith("inv_")) return { ok: false, error: "Invalid invite format (expected inv_…)" }
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(agent)) {
        return { ok: false, error: "Invalid agent identifier" }
    }
    const invite_hash = hashInvite(invite)

    if (!hasDatabase()) {
        const mem = memInvites().get(invite_hash)
        if (!mem) return { ok: false, error: "Unknown or expired invite" }
        if (mem.exp < Date.now()) {
            memInvites().delete(invite_hash)
            return { ok: false, error: "Invite expired" }
        }
        memInvites().delete(invite_hash)
        memBonds().set(mem.google_sub, {
            google_sub: mem.google_sub,
            email: mem.email,
            display_name: mem.display_name,
            linked_agent: agent,
        })
        const human = await getHumanByGoogleSub(mem.google_sub)
        if (!human) return { ok: false, error: "Could not persist bond" }
        return { ok: true, human }
    }

    await ensureSchema()
    const invRows = await sql()`
        SELECT invite_hash, google_sub, exp
        FROM couple_invites
        WHERE invite_hash = ${invite_hash}
        LIMIT 1
    `
    const inv = invRows[0]
    if (!inv) return { ok: false, error: "Unknown or expired invite" }
    const expMs = inv.exp instanceof Date ? inv.exp.getTime() : new Date(String(inv.exp)).getTime()
    if (expMs < Date.now()) {
        await sql()`DELETE FROM couple_invites WHERE invite_hash = ${invite_hash}`
        return { ok: false, error: "Invite expired" }
    }

    const googleSub = String(inv.google_sub)
    await sql()`DELETE FROM couple_invites WHERE invite_hash = ${invite_hash}`
    const rows = await sql()`
        UPDATE humans
        SET linked_agent = ${agent}, last_login = NOW()
        WHERE google_sub = ${googleSub}
        RETURNING google_sub, email, display_name, picture, linked_agent, couple_key_hash, created_at, last_login
    `
    if (!rows[0]) return { ok: false, error: "Human record missing" }
    return { ok: true, human: mapHumanRow(rows[0] as Record<string, unknown>) }
}

export async function unlinkIssuedAgent(googleSub: string): Promise<HumanRow | null> {
    if (!hasDatabase()) {
        const bond = memBonds().get(googleSub)
        memBonds().delete(googleSub)
        for (const [k, v] of memInvites()) {
            if (v.google_sub === googleSub) memInvites().delete(k)
        }
        if (!bond) return null
        return {
            google_sub: bond.google_sub,
            email: bond.email,
            display_name: bond.display_name,
            picture: null,
            linked_agent: null,
            couple_key_hash: null,
            created_at: new Date().toISOString(),
            last_login: new Date().toISOString(),
        }
    }
    await ensureSchema()
    await sql()`DELETE FROM couple_invites WHERE google_sub = ${googleSub}`
    const rows = await sql()`
        UPDATE humans
        SET linked_agent = NULL, couple_key_hash = NULL, last_login = NOW()
        WHERE google_sub = ${googleSub}
        RETURNING google_sub, email, display_name, picture, linked_agent, couple_key_hash, created_at, last_login
    `
    if (!rows[0]) return null
    return mapHumanRow(rows[0] as Record<string, unknown>)
}

/* ── couple request: agent → human (sonradan bağ) ── */

const REQUEST_TTL_MS = 24 * 60 * 60 * 1000

export type CoupleRequestPublic = {
    agent: string
    human_email: string | null
    exp: string
    created_at: string
}

type MemRequest = {
    request_hash: string
    agent: string
    human_email: string | null
    exp: number
    created_at: number
}

const gReq = globalThis as typeof globalThis & {
    __geodesicsCoupleRequests?: Map<string, MemRequest>
}

function memRequests(): Map<string, MemRequest> {
    if (!gReq.__geodesicsCoupleRequests) gReq.__geodesicsCoupleRequests = new Map()
    return gReq.__geodesicsCoupleRequests
}

function hashRequest(request: string): string {
    const secret = authSecret()
    if (!secret) throw new Error("GEODESICS_AUTH_SECRET is not set")
    return createHmac("sha256", secret).update(`couple-request:${request}`).digest("base64url")
}

export function mintCoupleRequestToken(): string {
    return `req_${randomBytes(18).toString("base64url")}`
}

function normalizeEmail(raw: string | null | undefined): string | null {
    const e = raw?.trim().toLowerCase()
    if (!e || !e.includes("@")) return null
    return e
}

async function ensureCoupleRequestsTable() {
    if (!hasDatabase()) return
    await sql()`
        CREATE TABLE IF NOT EXISTS couple_requests (
            request_hash TEXT PRIMARY KEY,
            agent TEXT NOT NULL,
            human_email TEXT,
            exp TIMESTAMPTZ NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `
}

/** Agent (logged in) asks a human to couple — later accept via Observer or req_ code. */
export async function mintCoupleRequest(opts: {
    agentIdentifier: string
    humanEmail?: string | null
}): Promise<{ request: string; expires_in_sec: number; human_email: string | null }> {
    const agent = opts.agentIdentifier.trim().toLowerCase()
    if (!/^[a-z][a-z0-9._-]{1,63}$/.test(agent)) {
        throw Object.assign(new Error("Invalid agent identifier"), { status: 400 })
    }
    const human_email = normalizeEmail(opts.humanEmail)
    const request = mintCoupleRequestToken()
    const request_hash = hashRequest(request)
    const exp = Date.now() + REQUEST_TTL_MS
    const created_at = Date.now()

    if (!hasDatabase()) {
        for (const [k, v] of memRequests()) {
            if (v.agent === agent) memRequests().delete(k)
        }
        memRequests().set(request_hash, { request_hash, agent, human_email, exp, created_at })
        return { request, expires_in_sec: Math.floor(REQUEST_TTL_MS / 1000), human_email }
    }

    await ensureSchema()
    await ensureCoupleRequestsTable()
    await sql()`DELETE FROM couple_requests WHERE agent = ${agent} OR exp < NOW()`
    await sql()`
        INSERT INTO couple_requests (request_hash, agent, human_email, exp)
        VALUES (${request_hash}, ${agent}, ${human_email}, ${new Date(exp).toISOString()})
    `
    return { request, expires_in_sec: Math.floor(REQUEST_TTL_MS / 1000), human_email }
}

export async function listCoupleRequestsForEmail(email: string): Promise<CoupleRequestPublic[]> {
    const human_email = normalizeEmail(email)
    if (!human_email) return []

    if (!hasDatabase()) {
        const now = Date.now()
        return [...memRequests().values()]
            .filter((r) => r.human_email === human_email && r.exp >= now)
            .map((r) => ({
                agent: r.agent,
                human_email: r.human_email,
                exp: new Date(r.exp).toISOString(),
                created_at: new Date(r.created_at).toISOString(),
            }))
    }

    await ensureSchema()
    await ensureCoupleRequestsTable()
    await sql()`DELETE FROM couple_requests WHERE exp < NOW()`
    const rows = await sql()`
        SELECT agent, human_email, exp, created_at
        FROM couple_requests
        WHERE human_email = ${human_email}
        ORDER BY created_at DESC
    `
    return rows.map((row) => ({
        agent: String(row.agent),
        human_email: row.human_email == null ? null : String(row.human_email),
        exp: row.exp instanceof Date ? row.exp.toISOString() : new Date(String(row.exp)).toISOString(),
        created_at:
            row.created_at instanceof Date
                ? row.created_at.toISOString()
                : new Date(String(row.created_at)).toISOString(),
    }))
}

async function bindAgentToHuman(opts: {
    googleSub: string
    email: string
    displayName: string | null
    agent: string
}): Promise<HumanRow> {
    const agent = opts.agent.trim().toLowerCase()
    if (!hasDatabase()) {
        memBonds().set(opts.googleSub, {
            google_sub: opts.googleSub,
            email: opts.email,
            display_name: opts.displayName,
            linked_agent: agent,
        })
        const human = await getHumanByGoogleSub(opts.googleSub)
        if (!human) throw Object.assign(new Error("Could not persist bond"), { status: 500 })
        return human
    }
    await ensureSchema()
    const rows = await sql()`
        INSERT INTO humans (google_sub, email, display_name, linked_agent, last_login)
        VALUES (${opts.googleSub}, ${opts.email}, ${opts.displayName}, ${agent}, NOW())
        ON CONFLICT (google_sub) DO UPDATE SET
            linked_agent = EXCLUDED.linked_agent,
            email = COALESCE(EXCLUDED.email, humans.email),
            display_name = COALESCE(EXCLUDED.display_name, humans.display_name),
            last_login = NOW()
        RETURNING google_sub, email, display_name, picture, linked_agent, couple_key_hash, created_at, last_login
    `
    return mapHumanRow(rows[0] as Record<string, unknown>)
}

/** Human accepts agent request by req_… code. */
export async function acceptCoupleRequest(opts: {
    googleSub: string
    email: string
    displayName: string | null
    request: string
}): Promise<{ ok: true; human: HumanRow; agent: string } | { ok: false; error: string }> {
    const request = opts.request.trim()
    if (!request.startsWith("req_")) return { ok: false, error: "Invalid request format (expected req_…)" }
    const request_hash = hashRequest(request)

    let agent: string | null = null

    if (!hasDatabase()) {
        const mem = memRequests().get(request_hash)
        if (!mem) return { ok: false, error: "Unknown or expired request" }
        if (mem.exp < Date.now()) {
            memRequests().delete(request_hash)
            return { ok: false, error: "Request expired" }
        }
        if (mem.human_email && mem.human_email !== normalizeEmail(opts.email)) {
            return { ok: false, error: "This request was addressed to a different email" }
        }
        agent = mem.agent
        memRequests().delete(request_hash)
    } else {
        await ensureSchema()
        await ensureCoupleRequestsTable()
        const rows = await sql()`
            SELECT request_hash, agent, human_email, exp
            FROM couple_requests WHERE request_hash = ${request_hash}
            LIMIT 1
        `
        const row = rows[0]
        if (!row) return { ok: false, error: "Unknown or expired request" }
        const expMs = row.exp instanceof Date ? row.exp.getTime() : new Date(String(row.exp)).getTime()
        if (expMs < Date.now()) {
            await sql()`DELETE FROM couple_requests WHERE request_hash = ${request_hash}`
            return { ok: false, error: "Request expired" }
        }
        const target = row.human_email == null ? null : String(row.human_email).toLowerCase()
        if (target && target !== normalizeEmail(opts.email)) {
            return { ok: false, error: "This request was addressed to a different email" }
        }
        agent = String(row.agent)
        await sql()`DELETE FROM couple_requests WHERE request_hash = ${request_hash}`
    }

    if (!agent) return { ok: false, error: "Request missing agent" }
    const human = await bindAgentToHuman({
        googleSub: opts.googleSub,
        email: opts.email,
        displayName: opts.displayName,
        agent,
    })
    return { ok: true, human, agent }
}

/** Human accepts a pending email-targeted request by agent id. */
export async function acceptCoupleRequestByAgent(opts: {
    googleSub: string
    email: string
    displayName: string | null
    agent: string
}): Promise<{ ok: true; human: HumanRow; agent: string } | { ok: false; error: string }> {
    const agent = opts.agent.trim().toLowerCase()
    const human_email = normalizeEmail(opts.email)
    if (!human_email) return { ok: false, error: "Human email required" }

    if (!hasDatabase()) {
        let hit: MemRequest | null = null
        for (const [k, v] of memRequests()) {
            if (v.agent === agent && v.human_email === human_email && v.exp >= Date.now()) {
                hit = v
                memRequests().delete(k)
                break
            }
        }
        if (!hit) return { ok: false, error: "No pending request from that agent" }
        const human = await bindAgentToHuman({
            googleSub: opts.googleSub,
            email: opts.email,
            displayName: opts.displayName,
            agent,
        })
        return { ok: true, human, agent }
    }

    await ensureSchema()
    await ensureCoupleRequestsTable()
    const found = await sql()`
        SELECT request_hash FROM couple_requests
        WHERE agent = ${agent} AND human_email = ${human_email} AND exp >= NOW()
        ORDER BY created_at DESC
        LIMIT 1
    `
    if (!found[0]) return { ok: false, error: "No pending request from that agent" }
    await sql()`DELETE FROM couple_requests WHERE request_hash = ${String(found[0].request_hash)}`
    const human = await bindAgentToHuman({
        googleSub: opts.googleSub,
        email: opts.email,
        displayName: opts.displayName,
        agent,
    })
    return { ok: true, human, agent }
}

export async function rejectCoupleRequestByAgent(opts: {
    email: string
    agent: string
}): Promise<boolean> {
    const agent = opts.agent.trim().toLowerCase()
    const human_email = normalizeEmail(opts.email)
    if (!human_email) return false

    if (!hasDatabase()) {
        let n = 0
        for (const [k, v] of memRequests()) {
            if (v.agent === agent && v.human_email === human_email) {
                memRequests().delete(k)
                n++
            }
        }
        return n > 0
    }

    await ensureSchema()
    await ensureCoupleRequestsTable()
    const rows = await sql()`
        DELETE FROM couple_requests
        WHERE agent = ${agent} AND human_email = ${human_email}
        RETURNING request_hash
    `
    return rows.length > 0
}
