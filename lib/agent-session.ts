export const GEODESICS_CONNECTION_KEY = "geodesics_connection"
export const VISITOR_AGENT_SESSION_KEY = "geodesics_visitor_agent"
export const AGENT_SESSION_EVENT = "geodesics-agent-session"
export const AGENT_NAVIGATE_EVENT = "geodesics-webmcp-navigate"
export const AGENT_OPEN_LOGIN_EVENT = "geodesics-open-agent-login"
export const VISITOR_AGENT_BROADCAST = "geodesics-visitor-agent"

export type VisitorAgentSession = {
    identifier: string
    display_name: string | null
    email: string | null
    initiated_by: string
}

export type AgentNavigateDetail = {
    href: string
    closeAgentLogin?: boolean
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

export function readVisitorAgentSession(): VisitorAgentSession | null {
    if (typeof window === "undefined") return null
    try {
        const raw = sessionStorage.getItem(VISITOR_AGENT_SESSION_KEY)
        if (!raw) return null
        const parsed = JSON.parse(raw) as VisitorAgentSession
        if (!parsed?.identifier) return null
        return parsed
    } catch {
        return null
    }
}

export function persistVisitorAgentSession(agent: VisitorAgentSession) {
    const raw = JSON.stringify(agent)
    sessionStorage.setItem(VISITOR_AGENT_SESSION_KEY, raw)
    try {
        localStorage.setItem(VISITOR_AGENT_SESSION_KEY, raw)
    } catch {
        /* ignore */
    }
    markVisitorAsAgent()
    try {
        const ch = new BroadcastChannel(VISITOR_AGENT_BROADCAST)
        ch.postMessage({ type: "login", agent })
        ch.close()
    } catch {
        /* ignore */
    }
}

export function clearVisitorAgentSession() {
    try {
        sessionStorage.removeItem(VISITOR_AGENT_SESSION_KEY)
        sessionStorage.setItem(GEODESICS_CONNECTION_KEY, "human")
        localStorage.removeItem(VISITOR_AGENT_SESSION_KEY)
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new CustomEvent(AGENT_SESSION_EVENT, { detail: null }))
}

export function visitorSessionFromLoginPayload(
    payload: Record<string, unknown>
): VisitorAgentSession | null {
    const nested = payload.agent
    const src =
        nested && typeof nested === "object" && !Array.isArray(nested)
            ? (nested as Record<string, unknown>)
            : payload
    const identifier = typeof src.identifier === "string" ? src.identifier : ""
    if (!identifier) return null
    return {
        identifier,
        display_name: typeof src.display_name === "string" ? src.display_name : null,
        email: typeof src.email === "string" ? src.email : null,
        initiated_by: typeof src.initiated_by === "string" ? src.initiated_by : "geodesics",
    }
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
    dispatchAgentNavigate("/map", true)
}

export function requireVisitorSession(): VisitorAgentSession {
    const visitor = readVisitorAgentSession()
    if (!visitor) {
        throw new Error("No visitor session. Call geodesics_agent_login first.")
    }
    return visitor
}
