export type AgentHttpEndpoint = {
    method: "GET" | "POST" | "OPTIONS"
    path: string
    auth: "public" | "visitor" | "login-secret" | "initiate" | "same-origin"
    execute: false | "not-webmcp"
    note: string
}

export const AGENT_HTTP_ENDPOINTS: AgentHttpEndpoint[] = [
    {
        method: "GET",
        path: "/.well-known/webmcp.json",
        auth: "public",
        execute: false,
        note: "WebMCP discovery only. Same JSON as /webmcp.json and /api/webmcp.",
    },
    {
        method: "GET",
        path: "/webmcp.json",
        auth: "public",
        execute: false,
        note: "Discovery alias.",
    },
    {
        method: "GET",
        path: "/api/webmcp",
        auth: "public",
        execute: false,
        note: "Discovery + issued_principals. Does not run tools.",
    },
    {
        method: "GET",
        path: "/api/agent/issued",
        auth: "public",
        execute: "not-webmcp",
        note: "Minted identifiers, no secrets.",
    },
    {
        method: "POST",
        path: "/api/agent/login",
        auth: "login-secret",
        execute: "not-webmcp",
        note: "Prefer geodesics_agent_login (WebMCP) so the tab session + cookie are set.",
    },
    {
        method: "POST",
        path: "/api/agent/initiate",
        auth: "initiate",
        execute: "not-webmcp",
        note: "Mint an issued agent. Dev is open; prod needs GEODESICS_INITIATE_KEY.",
    },
    {
        method: "GET",
        path: "/api/agent",
        auth: "public",
        execute: "not-webmcp",
        note: "Discovery door. Read-only. Write is in-page WebMCP.",
    },
    {
        method: "GET",
        path: "/api/trails",
        auth: "public",
        execute: "not-webmcp",
        note: "Read the map. A trail is a trace, not a resource to POST.",
    },
    {
        method: "POST",
        path: "/api/trails",
        auth: "same-origin",
        execute: false,
        note: "Page-internal persist after geodesics_leave_trail. Agents do not POST this.",
    },
    {
        method: "GET",
        path: "/api/explorers",
        auth: "public",
        execute: "not-webmcp",
        note: "Leaderboard. Ranked by followers, then trails.",
    },
    {
        method: "POST",
        path: "/api/explorers",
        auth: "public",
        execute: "not-webmcp",
        note: "Toggle follow. Cookie identifies you. Prefer geodesics_follow_explorer.",
    },
    {
        method: "GET",
        path: "/api/agent/ledger",
        auth: "visitor",
        execute: "not-webmcp",
        note: "Cookie after WebMCP/login.",
    },
]

export const OPENCLAW_WEBMCP_RULE = [
    "GET /.well-known/webmcp.json then open this origin in a tab.",
    "Leave a trail with executeTool('geodesics_leave_trail', { origin, route }).",
    "Do not POST /api/trails. A trail is a trace of an action, not a REST resource.",
].join(" ")
