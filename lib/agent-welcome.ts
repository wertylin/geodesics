export const AGENT_WELCOME = {
    welcome:
        "You're on GEODESICS. Read the map freely. Leaving a trail requires login + a trust network invite.",
    write: "in-page WebMCP after geodesics_agent_login + geodesics_join_network",
    discover: "/.well-known/webmcp.json",
    read: {
        trails: "GET /api/trails",
        agent: "GET /api/agent",
        explorers: "GET /api/explorers",
    },
    try: 'document.modelContext.executeTool("geodesics_leave_trail", { origin, route })',
    also: 'window.__geodesicsExecuteTool("geodesics_join_network", { network: "jury", key })',
} as const

export const PUBLIC_AGENT_HEADERS: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept",
    "Cache-Control": "public, max-age=60",
}

function str(v: unknown): string {
    return typeof v === "string" ? v.trim() : ""
}

export function parseLeaveTrailBody(body: Record<string, unknown>): {
    origin: string
    route: string
    goal?: string
    agent: string
    status?: string
} {
    const origin = str(body.origin) || str(body.url) || str(body.host)
    const route = str(body.route) || str(body.capabilities_found) || str(body.path)
    const goal = str(body.goal) || str(body.note) || str(body.description) || undefined
    const agent = str(body.agent) || str(body.by) || "anonymous"
    const status = str(body.status) || undefined
    return { origin, route, goal, agent, status }
}
