import { NextRequest, NextResponse } from "next/server"
import {
    agentCorsHeaders,
    agentOptionsResponse,
    readVisitorFromRequest,
    visitorCookieHeader,
} from "@/lib/agent-access"
import { verifyAgentLogin } from "@/lib/agent-identity"
import { AGENT_EXPERIMENT_ID, newLedgerEntryId } from "@/lib/agent-ledger"
import { appendLedger } from "@/lib/agent-ledger-store"
import type { VisitorAgentSession } from "@/lib/agent-session"
import { claimCoupleInvite, getHumanByGoogleSub } from "@/lib/human-couple"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

function agentSession(opts: {
    identifier: string
    display_name?: string | null
    email?: string | null
    initiated_by: string
    coupled_human?: string | null
}): VisitorAgentSession {
    return {
        identifier: opts.identifier,
        display_name: opts.display_name ?? opts.identifier,
        email: opts.email ?? null,
        initiated_by: opts.initiated_by,
        auth_type: "external_agent",
        google_sub: null,
        linked_agent: null,
        coupled_human: opts.coupled_human ?? null,
    }
}

/**
 * Dual agent login:
 * 1) Classic secret — { identifier, secret } from .env / issued secret
 * 2) Couple bond — { identifier, invite } OR { mode: "linked" } when human cookie has linked_agent
 *    No agent secret required.
 */
export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    let body: {
        identifier?: string
        secret?: string
        invite?: string
        mode?: string
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const mode = typeof body.mode === "string" ? body.mode.trim().toLowerCase() : ""
    const invite = typeof body.invite === "string" ? body.invite.trim() : ""
    const identifier = typeof body.identifier === "string" ? body.identifier.trim() : ""
    const secret = typeof body.secret === "string" ? body.secret.trim() : ""

    // ── Path A: elevate from human couple cookie (already bonded) ──
    if (mode === "linked" || (!secret && !invite && mode === "couple")) {
        const visitor = readVisitorFromRequest(req)
        if (!visitor || visitor.auth_type !== "human_couple" || !visitor.google_sub) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No human couple session. Google sign-in + link an agent first, or pass invite.",
                    try: [
                        'geodesics_agent_login({ identifier, invite })',
                        'geodesics_agent_login({ identifier, secret })',
                    ],
                },
                { status: 401, headers: cors }
            )
        }
        const human = await getHumanByGoogleSub(visitor.google_sub)
        const linked = human?.linked_agent?.trim().toLowerCase() || visitor.linked_agent?.trim().toLowerCase()
        if (!linked) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Human has no linked agent yet. Mint invite in Observer, then login with { identifier, invite }.",
                },
                { status: 403, headers: cors }
            )
        }
        if (identifier && identifier.toLowerCase() !== linked) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Linked agent is "${linked}" — pass that identifier or omit it.`,
                },
                { status: 403, headers: cors }
            )
        }
        const session = agentSession({
            identifier: linked,
            initiated_by: "couple",
            coupled_human: human?.display_name || human?.email || visitor.display_name || visitor.email,
        })
        return finishLogin(req, cors, session, "linked")
    }

    // ── Path B: invite = bond + login (no secret) ──
    if (invite) {
        const id = identifier.toLowerCase()
        if (!id) {
            return NextResponse.json(
                { success: false, error: "identifier required with invite (no secret needed)." },
                { status: 400, headers: cors }
            )
        }
        const claimed = await claimCoupleInvite({ agentIdentifier: id, invite })
        if (!claimed.ok) {
            await appendLedger({
                id: newLedgerEntryId(),
                ts: new Date().toISOString(),
                experiment: AGENT_EXPERIMENT_ID,
                actor: id || "anonymous",
                host_agent: "geodesics",
                action: "agent.login_failed",
                ok: false,
                preview: claimed.error,
            })
            return NextResponse.json({ success: false, error: claimed.error }, { status: 401, headers: cors })
        }
        const session = agentSession({
            identifier: id,
            initiated_by: "couple",
            coupled_human: claimed.human.display_name || claimed.human.email,
        })
        return finishLogin(req, cors, session, "invite", { bonded: true, human: claimed.human.email })
    }

    // ── Path C: classic issued secret (.env) ──
    if (!identifier || !secret) {
        return NextResponse.json(
            {
                success: false,
                error: "Pick a login path: { identifier, secret } | { identifier, invite } | { mode: \"linked\" }",
            },
            { status: 400, headers: cors }
        )
    }

    const result = await verifyAgentLogin({ identifier, secret })
    if (!result.ok) {
        await appendLedger({
            id: newLedgerEntryId(),
            ts: new Date().toISOString(),
            experiment: AGENT_EXPERIMENT_ID,
            actor: identifier || "anonymous",
            host_agent: "geodesics",
            action: "agent.login_failed",
            ok: false,
            preview: result.error,
        })
        return NextResponse.json({ success: false, error: result.error }, { status: 401, headers: cors })
    }

    const session = agentSession({
        identifier: result.agent.identifier,
        display_name: result.agent.display_name,
        email: result.agent.email,
        initiated_by: result.agent.initiated_by,
    })
    return finishLogin(req, cors, session, "secret")
}

async function finishLogin(
    req: NextRequest,
    cors: Record<string, string>,
    session: VisitorAgentSession,
    path: "secret" | "invite" | "linked",
    extra: Record<string, unknown> = {}
) {
    await appendLedger({
        id: newLedgerEntryId(),
        ts: new Date().toISOString(),
        experiment: AGENT_EXPERIMENT_ID,
        actor: session.identifier,
        host_agent: "geodesics",
        action: "agent.login",
        ok: true,
        args: { identifier: session.identifier, auth_type: "external_agent", path },
        preview: `login ${session.identifier} (${path})`,
    })

    const hints: Record<typeof path, string> = {
        secret: "External agent session set via issued secret. Join a trust network, then leave trails.",
        invite: "Couple bond live + agent session set — no secret used. Join a trust network next.",
        linked: "Elevated from human couple bond — no secret used. Join a trust network next.",
    }

    const res = NextResponse.json(
        {
            success: true,
            mode: "agent",
            path,
            auth_type: "external_agent",
            agent: session,
            ...extra,
            next: [
                "geodesics_join_network",
                "geodesics_list_trails",
                "geodesics_leave_trail",
                "geodesics_open_map",
                "geodesics_list_agent_surface",
            ],
            hint: hints[path],
        },
        { headers: cors }
    )
    res.headers.append("Set-Cookie", visitorCookieHeader(session, req))
    return res
}
