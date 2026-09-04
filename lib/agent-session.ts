import type { AuthType } from "@/lib/auth-types"
import { normalizeAuthType } from "@/lib/auth-types"

export const GEODESICS_CONNECTION_KEY = "geodesics_connection"
export const VISITOR_AGENT_SESSION_KEY = "geodesics_visitor_agent"
export const AGENT_SESSION_EVENT = "geodesics-agent-session"
export const AGENT_NAVIGATE_EVENT = "geodesics-webmcp-navigate"
export const AGENT_OPEN_LOGIN_EVENT = "geodesics-open-agent-login"

export type VisitorAgentSession = {
    identifier: string
    display_name: string | null
    email: string | null
    initiated_by: string
    /** external_agent = issued secret / couple-derived; human_couple = Google human (+ optional linked agent) */
    auth_type: AuthType
    google_sub?: string | null
    linked_agent?: string | null
    /** When agent logged in via couple bond — human display for UI */
    coupled_human?: string | null
}

export type AgentNavigateDetail = {
    href: string
    closeAgentLogin?: boolean
}

function normalizeSession(raw: Partial<VisitorAgentSession> & { identifier?: string }): VisitorAgentSession | null {
    if (!raw?.identifier) return null
    return {
        identifier: raw.identifier,
        display_name: raw.display_name ?? null,
        email: raw.email ?? null,
        initiated_by: raw.initiated_by ?? "geodesics",
        auth_type: normalizeAuthType(raw.auth_type),
        google_sub: raw.google_sub ?? null,
        linked_agent: raw.linked_agent ?? null,
        coupled_human: raw.coupled_human ?? null,
    }
}

export function markVisitorAsHuman() {
    try {
        sessionStorage.setItem(GEODESICS_CONNECTION_KEY, "human")
        sessionStorage.removeItem(VISITOR_AGENT_SESSION_KEY)
    } catch {
        /* ignore */
    }
}

export function markVisitorAsAgent() {
    try {
        sessionStorage.setItem(GEODESICS_CONNECTION_KEY, "agent")
    } catch {
        /* ignore */
    }
}

export function markVisitorAsCouple() {
    try {
        sessionStorage.setItem(GEODESICS_CONNECTION_KEY, "couple")
    } catch {
        /* ignore */
    }
}

export function readVisitorAgentSession(): VisitorAgentSession | null {
    if (typeof window === "undefined") return null
    try {
        const raw = sessionStorage.getItem(VISITOR_AGENT_SESSION_KEY)
        if (!raw) return null
        return normalizeSession(JSON.parse(raw) as VisitorAgentSession)
    } catch {
        return null
    }
}

export function persistVisitorAgentSession(agent: VisitorAgentSession) {
    const session = normalizeSession(agent)
    if (!session) return
    // Tab-scoped mirror only — never localStorage (identity lives in HttpOnly cookie).
    sessionStorage.setItem(VISITOR_AGENT_SESSION_KEY, JSON.stringify(session))
    if (session.auth_type === "human_couple") markVisitorAsCouple()
    else markVisitorAsAgent()
}

export function clearVisitorAgentSession() {
    try {
        sessionStorage.removeItem(VISITOR_AGENT_SESSION_KEY)
        sessionStorage.setItem(GEODESICS_CONNECTION_KEY, "human")
        localStorage.removeItem(VISITOR_AGENT_SESSION_KEY) // scrub legacy copies
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new CustomEvent(AGENT_SESSION_EVENT, { detail: null }))
}

/** Drop HttpOnly cookie + tab mirror. */
export async function logoutVisitor(): Promise<void> {
    try {
        await fetch("/api/agent/logout", { method: "POST", credentials: "include", cache: "no-store" })
    } catch {
        /* still clear client */
    }
    clearVisitorAgentSession()
}

export function visitorSessionFromLoginPayload(
    payload: Record<string, unknown>
): VisitorAgentSession | null {
    const nested = payload.agent
    const src =
        nested && typeof nested === "object" && !Array.isArray(nested)
            ? (nested as Record<string, unknown>)
            : payload
    return normalizeSession({
        identifier: typeof src.identifier === "string" ? src.identifier : "",
        display_name: typeof src.display_name === "string" ? src.display_name : null,
        email: typeof src.email === "string" ? src.email : null,
        initiated_by: typeof src.initiated_by === "string" ? src.initiated_by : "geodesics",
        auth_type: normalizeAuthType(src.auth_type),
        google_sub: typeof src.google_sub === "string" ? src.google_sub : null,
        linked_agent: typeof src.linked_agent === "string" ? src.linked_agent : null,
        coupled_human: typeof src.coupled_human === "string" ? src.coupled_human : null,
    })
}

export function dispatchAgentNavigate(href: string, closeAgentLogin = true) {
    window.dispatchEvent(
        new CustomEvent<AgentNavigateDetail>(AGENT_NAVIGATE_EVENT, {
            detail: { href, closeAgentLogin },
        })
    )
}

export function dispatchOpenAgentLogin() {
    window.dispatchEvent(new CustomEvent(AGENT_OPEN_LOGIN_EVENT))
}

export function completeAgentLogin(agent: VisitorAgentSession) {
    persistVisitorAgentSession(agent)
    window.dispatchEvent(new CustomEvent(AGENT_SESSION_EVENT, { detail: agent }))
    dispatchAgentNavigate("/", true)
}

/** Restore client mirror of an already-authenticated cookie — no navigation. */
export function hydrateVisitorSession(agent: VisitorAgentSession) {
    persistVisitorAgentSession(agent)
    window.dispatchEvent(new CustomEvent(AGENT_SESSION_EVENT, { detail: agent }))
}

export function requireVisitorSession(): VisitorAgentSession {
    const visitor = readVisitorAgentSession()
    if (!visitor) {
        throw new Error("No visitor session. Call geodesics_agent_login first.")
    }
    return visitor
}
