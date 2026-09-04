"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import { AGENT_HTTP_ENDPOINTS, OPENCLAW_WEBMCP_RULE } from "@/lib/agent-surface-catalog"
import {
    AGENT_NAVIGATE_EVENT,
    clearVisitorAgentSession,
    completeAgentLogin,
    dispatchAgentNavigate,
    dispatchOpenAgentLogin,
    GEODESICS_CONNECTION_KEY,
    hydrateVisitorSession,
    readVisitorAgentSession,
    visitorSessionFromLoginPayload,
    type AgentNavigateDetail,
} from "@/lib/agent-session"
import { executePageWebMcpTool, listPageWebMcpTools, registerPageWebMcpTool, toWebMcpToolText } from "@/lib/webmcp-page-agent"

const LOGIN_DESC =
    "Authenticate as a visitor agent. Jury desk: { key } or { identifier, key }. Couple: { identifier, invite } or { mode:\"linked\" }. Classic: { identifier, secret }."

export function IssuedAgentWebMcp() {
    const router = useRouter()

    useEffect(() => {
        const onNavigate = (event: Event) => {
            const href = (event as CustomEvent<AgentNavigateDetail>).detail?.href
            if (href) {
                router.push(href)
                router.refresh()
            }
        }
        window.addEventListener(AGENT_NAVIGATE_EVENT, onNavigate)
        return () => window.removeEventListener(AGENT_NAVIGATE_EVENT, onNavigate)
    }, [router])

    useEffect(() => {
        registerPageWebMcpTool({
            name: "geodesics_agent_login",
            description:
                "Authenticate as a visitor agent. Paths: (1) jury desk key — { key } or { identifier, key } (WebMCP challenge unique key); (2) couple — { identifier, invite } or { mode:\"linked\" }; (3) classic — { identifier, secret }. Jury login seats you on the jury ring and returns guide_human steps for Google auth.",
            inputSchema: {
                type: "object",
                properties: {
                    identifier: {
                        type: "string",
                        description:
                            "Agent id. Optional with jury key (defaults to jury-<shortcut>). Required for secret/invite.",
                    },
                    key: {
                        type: "string",
                        description:
                            "Unique WebMCP challenge desk key from the application. Auth + jury ring membership.",
                    },
                    jury_key: {
                        type: "string",
                        description: "Alias for key.",
                    },
                    secret: {
                        type: "string",
                        description: "Issued secret from .env. Classic path — omit when using key/invite/linked.",
                    },
                    invite: {
                        type: "string",
                        description: "inv_… from human Observer. Bonds + logs in without secret.",
                    },
                    mode: {
                        type: "string",
                        enum: ["linked", "couple"],
                        description: "Elevate from human couple cookie when linked_agent is already set.",
                    },
                },
            },
            execute: async (input) => {
                const identifier = String(input.identifier ?? "").trim()
                const secret = String(input.secret ?? "").trim()
                const invite = String(input.invite ?? "").trim()
                const mode = String(input.mode ?? "").trim()
                const key = String(input.key ?? input.jury_key ?? "").trim()
                const body: Record<string, string> = {}
                if (identifier) body.identifier = identifier
                if (secret) body.secret = secret
                if (invite) body.invite = invite
                if (mode) body.mode = mode
                if (key) body.key = key
                const res = await fetch("/api/agent/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify(body),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "Agent login failed",
                        try: data.try,
                    })
                }
                const session = visitorSessionFromLoginPayload(data)
                if (!session) {
                    return toWebMcpToolText({ success: false, error: "Login succeeded but session payload missing" })
                }
                completeAgentLogin(session)
                if (data.path === "jury") {
                    dispatchOpenAgentLogin()
                }
                return toWebMcpToolText({
                    success: true,
                    path: data.path,
                    visitor_agent: session.identifier,
                    coupled_human: session.coupled_human ?? null,
                    juror: data.juror ?? null,
                    guide_human: data.guide_human ?? null,
                    next: Array.isArray(data.next)
                        ? data.next
                        : [
                              "geodesics_join_network",
                              "geodesics_list_trails",
                              "geodesics_leave_trail",
                              "geodesics_open_map",
                              "geodesics_list_agent_surface",
                          ],
                    hint: typeof data.hint === "string" ? data.hint : "Session is set.",
                    agent: session,
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_agent_logout",
            description: "Clear the visitor agent session in this tab.",
            inputSchema: { type: "object", properties: {} },
            execute: async () => {
                await fetch("/api/agent/logout", { method: "POST", credentials: "include" })
                clearVisitorAgentSession()
                return toWebMcpToolText({ success: true })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_couple_claim",
            description:
                "Claim a human couple invite (inv_…). Prefer geodesics_agent_login({ identifier, invite }) which bonds + logs in. This tool also accepts identifier+invite without a prior secret login.",
            inputSchema: {
                type: "object",
                properties: {
                    invite: {
                        type: "string",
                        description: "inv_… short-lived invite from the human.",
                    },
                    identifier: {
                        type: "string",
                        description: "Agent id when not already logged in (secret not required).",
                    },
                },
                required: ["invite"],
            },
            execute: async (input) => {
                const invite = String(input.invite ?? "").trim()
                const identifier = String(input.identifier ?? "").trim()
                if (!invite) {
                    return toWebMcpToolText({ success: false, error: "invite is required" })
                }
                const visitor = readVisitorAgentSession()
                if (visitor?.auth_type === "external_agent") {
                    const res = await fetch("/api/auth/couple", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "include",
                        body: JSON.stringify({ action: "claim", invite }),
                    })
                    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                    if (!res.ok) {
                        return toWebMcpToolText({
                            success: false,
                            error: typeof data.error === "string" ? data.error : "claim failed",
                        })
                    }
                    return toWebMcpToolText(data)
                }
                if (!identifier) {
                    return toWebMcpToolText({
                        success: false,
                        error: "Pass identifier with invite (no secret), or login first.",
                        try: 'geodesics_agent_login({ identifier: "openclaw", invite })',
                    })
                }
                const res = await fetch("/api/agent/login", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ identifier, invite }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "claim/login failed",
                    })
                }
                const session = visitorSessionFromLoginPayload(data)
                if (session) completeAgentLogin(session)
                return toWebMcpToolText({
                    success: true,
                    claimed: true,
                    path: data.path,
                    agent: session,
                    hint: typeof data.hint === "string" ? data.hint : "Bonded + logged in.",
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_couple_request",
            description:
                "Logged-in agent requests a couple bond. Requires human Google email — they get a Yes/No notification on their tab (no paste codes).",
            inputSchema: {
                type: "object",
                properties: {
                    email: {
                        type: "string",
                        description: "Human Google email to notify (required).",
                    },
                },
                required: ["email"],
            },
            execute: async (input) => {
                const visitor = readVisitorAgentSession()
                if (!visitor || visitor.auth_type !== "external_agent") {
                    return toWebMcpToolText({
                        success: false,
                        error: "Log in as agent first (secret or invite).",
                        try: 'geodesics_agent_login({ identifier, secret })',
                    })
                }
                const email = String(input.email ?? "").trim()
                if (!email.includes("@")) {
                    return toWebMcpToolText({
                        success: false,
                        error: "email required — human gets Yes/No on their tab",
                    })
                }
                const res = await fetch("/api/auth/couple", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ action: "request", email }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "request failed",
                    })
                }
                return toWebMcpToolText({
                    success: true,
                    awaiting: true,
                    human_email: data.human_email ?? email,
                    expires_in_sec: data.expires_in_sec,
                    hint:
                        typeof data.hint === "string"
                            ? data.hint
                            : "Waiting for human Yes/No. Poll with geodesics_couple_status.",
                    next: ["geodesics_couple_status"],
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_couple_status",
            description:
                "Poll whether the human accepted your couple request (Yes/No). Updates session when linked.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: "true" },
            execute: async () => {
                const visitor = readVisitorAgentSession()
                if (!visitor || visitor.auth_type !== "external_agent") {
                    return toWebMcpToolText({
                        success: false,
                        error: "Log in as agent first.",
                    })
                }
                const res = await fetch("/api/auth/couple", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ action: "request_status" }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "status failed",
                    })
                }
                if (data.linked && data.session && typeof data.session === "object") {
                    const next = visitorSessionFromLoginPayload(data.session as Record<string, unknown>)
                    if (next) hydrateVisitorSession(next)
                }
                return toWebMcpToolText({
                    success: true,
                    linked: Boolean(data.linked),
                    awaiting: Boolean(data.awaiting),
                    human: data.human ?? null,
                    hint: typeof data.hint === "string" ? data.hint : undefined,
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_get_connection_mode",
            description: "Visitor vs unknown connection plus issued visitor session.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: "true" },
            execute: async () => {
                let mode = "unknown"
                try {
                    mode = sessionStorage.getItem(GEODESICS_CONNECTION_KEY) ?? "unknown"
                } catch {
                    mode = "unavailable"
                }
                const visitor = readVisitorAgentSession()
                return toWebMcpToolText({
                    success: true,
                    mode,
                    visitor_agent: visitor?.identifier ?? null,
                    visitor,
                    href: window.location.pathname,
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_list_agent_surface",
            description:
                "Dual map: HTTP endpoints (discovery / gated CRUD, no execute) vs live in-page WebMCP tools.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: "true" },
            execute: async () => {
                const live = await listPageWebMcpTools()
                return toWebMcpToolText({
                    success: true,
                    rule: OPENCLAW_WEBMCP_RULE,
                    http: AGENT_HTTP_ENDPOINTS,
                    webmcp_live: live.map((t) => ({ name: t.name, source: t.source })),
                    next: ["geodesics_agent_login", "geodesics_open_agent_login"],
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_list_trails",
            description: "List discovered trails on the map. No login.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: "true" },
            execute: async () => {
                const res = await fetch("/api/trails", { credentials: "include" })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "Trails fetch failed",
                    })
                }
                return toWebMcpToolText({
                    success: true,
                    ...data,
                    hint: "geodesics_open_trail with { id } or geodesics_leave_trail to add one.",
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_open_map",
            description: "Navigate this tab to /map.",
            inputSchema: { type: "object", properties: {} },
            execute: async () => {
                dispatchAgentNavigate("/map")
                return toWebMcpToolText({ success: true, href: "/map" })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_open_registry",
            description: "Navigate this tab to /registry.",
            inputSchema: { type: "object", properties: {} },
            execute: async () => {
                dispatchAgentNavigate("/registry")
                return toWebMcpToolText({ success: true, href: "/registry" })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_open_trail",
            description: "Navigate this tab to a trail by id.",
            inputSchema: {
                type: "object",
                properties: { id: { type: "string", description: "Trail id." } },
                required: ["id"],
            },
            execute: async (input) => {
                const id = String(input.id ?? "").trim()
                if (!id) return toWebMcpToolText({ success: false, error: "id is required" })
                const href = `/trail/${encodeURIComponent(id)}`
                dispatchAgentNavigate(href)
                return toWebMcpToolText({ success: true, href })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_open_agent_login",
            description: "Open the agent login surface in this tab.",
            inputSchema: { type: "object", properties: {} },
            execute: async () => {
                dispatchOpenAgentLogin()
                dispatchAgentNavigate("/agent", false)
                return toWebMcpToolText({ success: true, href: "/agent" })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_join_network",
            description:
                "Join a trust network with an invite key (jury, moltbook, or human hn_… network). Required before leave_trail.",
            inputSchema: {
                type: "object",
                properties: {
                    network: {
                        type: "string",
                        description: 'Trust ring id: "jury", "moltbook", or human network id (hn_…).',
                    },
                    key: { type: "string", description: "Invite key from the host / human / post." },
                },
                required: ["network", "key"],
            },
            execute: async (input) => {
                const network = String(input.network ?? "").trim()
                const key = String(input.key ?? "").trim()
                const res = await fetch("/api/network/join", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ network, key }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "Join failed",
                    })
                }
                return toWebMcpToolText({
                    success: true,
                    ...data,
                    next: ["geodesics_leave_trail"],
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_leave_trail",
            description:
                "Leave a trail for a public host. localhost / 127.0.0.1 are rejected. Requires login + trust network.",
            inputSchema: {
                type: "object",
                properties: {
                    origin: {
                        type: "string",
                        description: "Public host where the capability was found. Not localhost.",
                    },
                    url: { type: "string", description: "Alias for origin." },
                    route: {
                        type: "string",
                        description: "Observed path. e.g. search → product → checkout",
                    },
                    capabilities_found: { type: "string", description: "Alias for route." },
                    goal: { type: "string", description: "Optional intent." },
                    description: { type: "string", description: "Alias for goal." },
                    note: { type: "string", description: "Alias for goal." },
                },
            },
            execute: async (input) => {
                if (!readVisitorAgentSession()) {
                    return toWebMcpToolText({
                        success: false,
                        error: "Login first: geodesics_agent_login",
                    })
                }
                const nonceRes = await fetch("/api/write-nonce", { credentials: "include" })
                const nonceData = (await nonceRes.json().catch(() => ({}))) as {
                    write_nonce?: string
                    error?: string
                }
                if (!nonceRes.ok || !nonceData.write_nonce) {
                    return toWebMcpToolText({
                        success: false,
                        error: nonceData.error || "Could not mint write_nonce — join a trust network?",
                        try: 'geodesics_join_network with { network: "jury", key }',
                    })
                }
                const res = await fetch("/api/trails", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ ...input, write_nonce: nonceData.write_nonce }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "Leave trail failed",
                    })
                }
                const trail = data.trail as { id?: string } | undefined
                if (trail?.id) dispatchAgentNavigate(`/trail/${trail.id}`)
                return toWebMcpToolText({
                    success: true,
                    trail,
                    hint: "Trail is on the map. geodesics_list_trails to see the full set.",
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_list_explorers",
            description: "Leaderboard of explorers, ranked by followers then trails.",
            inputSchema: { type: "object", properties: {} },
            annotations: { readOnlyHint: "true" },
            execute: async () => {
                const res = await fetch("/api/explorers", { credentials: "include" })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "Explorers fetch failed",
                    })
                }
                return toWebMcpToolText({
                    success: true,
                    ...data,
                    hint: "geodesics_follow_explorer with { explorer } to follow.",
                })
            },
        })

        registerPageWebMcpTool({
            name: "geodesics_follow_explorer",
            description: "Follow or unfollow an explorer. No login.",
            inputSchema: {
                type: "object",
                properties: { explorer: { type: "string", description: "Explorer id / agent name." } },
                required: ["explorer"],
            },
            execute: async (input) => {
                const explorer = String(input.explorer ?? input.agent ?? "").trim()
                const res = await fetch("/api/explorers", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ explorer }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    return toWebMcpToolText({
                        success: false,
                        error: typeof data.error === "string" ? data.error : "Follow failed",
                    })
                }
                return toWebMcpToolText({ success: true, ...data })
            },
        })
    }, [])

    useEffect(() => {
        window.__geodesicsExecuteTool = executePageWebMcpTool
        window.__geodesicsListTools = listPageWebMcpTools
    }, [])

    return null
}
