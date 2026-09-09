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
import {
    juryCookieHeader,
    juryNetworkPrincipal,
    matchJuryCode,
    seedJury,
} from "@/lib/jury"
import { addNetworkMember } from "@/lib/trust-network"
import {
    moltbookAudience,
    moltbookAuthConfigured,
    moltbookIdentifier,
    verifyMoltbookIdentity,
} from "@/lib/moltbook-identity"

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
 * Agent login paths:
 * 1) Classic secret — { identifier, secret }
 * 2) Couple bond — { identifier, invite } OR { mode: "linked" }
 * 3) Jury desk key — { key } or { identifier, key } (unique per WebMCP challenge juror)
 */
export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    let body: {
        identifier?: string
        secret?: string
        invite?: string
        mode?: string
        key?: string
        jury_key?: string
        moltbook_identity?: string
        identity_token?: string
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
    const key =
        (typeof body.key === "string" ? body.key.trim() : "") ||
        (typeof body.jury_key === "string" ? body.jury_key.trim() : "")
    const moltbookIdentity =
        (typeof body.moltbook_identity === "string" ? body.moltbook_identity.trim() : "") ||
        (typeof body.identity_token === "string" ? body.identity_token.trim() : "") ||
        req.headers.get("x-moltbook-identity")?.trim() ||
        ""

    // ── Path M: Sign in with Moltbook identity token ──
    if (moltbookIdentity) {
        if (!moltbookAuthConfigured()) {
            return NextResponse.json(
                {
                    success: false,
                    error: "MOLTBOOK_APP_KEY unset. Create an app at https://moltbook.com/developers/dashboard",
                    docs: "https://moltbook.com/developers.md",
                },
                { status: 503, headers: cors }
            )
        }
        const audience = moltbookAudience(req.nextUrl.hostname)
        let verified = await verifyMoltbookIdentity({ token: moltbookIdentity, audience })
        if (!verified.ok && /audience/i.test(verified.error)) {
            verified = await verifyMoltbookIdentity({ token: moltbookIdentity })
        }
        if (!verified.ok) {
            await appendLedger({
                id: newLedgerEntryId(),
                ts: new Date().toISOString(),
                experiment: AGENT_EXPERIMENT_ID,
                actor: identifier || "moltbook",
                host_agent: "geodesics",
                action: "agent.login_failed",
                ok: false,
                preview: `moltbook identity: ${verified.error}`,
            })
            return NextResponse.json(
                {
                    success: false,
                    error: verified.error,
                    audience,
                    mint: `POST https://moltbook.com/api/v1/agents/me/identity-token  Authorization: Bearer YOUR_MOLTBOOK_API_KEY  { "audience": "${audience}" }`,
                    docs: "https://moltbook.com/developers.md",
                },
                { status: verified.status, headers: cors }
            )
        }

        const id = moltbookIdentifier(verified.agent)
        await addNetworkMember({
            network: "moltbook",
            principal: id,
            kind: "agent",
        }).catch(() => {})

        const session = agentSession({
            identifier: id,
            display_name: verified.agent.name || id,
            initiated_by: `moltbook:${verified.agent.id}`,
        })
        return finishLogin(req, cors, session, "moltbook", {
            network: "moltbook",
            moltbook: {
                id: verified.agent.id,
                name: verified.agent.name,
                karma: verified.agent.karma ?? null,
                claimed: Boolean(verified.agent.is_claimed),
            },
            audience,
        })
    }

    // ── Path A: elevate from human couple cookie (already bonded) ──
    if (mode === "linked" || (!secret && !invite && !key && mode === "couple")) {
        const visitor = readVisitorFromRequest(req)
        if (!visitor || visitor.auth_type !== "human_couple" || !visitor.google_sub) {
            return NextResponse.json(
                {
                    success: false,
                    error: "No human couple session. Dynamic passport + link an agent first, or pass invite.",
                    try: [
                        'geodesics_agent_login({ identifier, invite })',
                        'geodesics_agent_login({ identifier, secret })',
                        'geodesics_agent_login({ identifier, key }) // WebMCP jury desk key',
                        'geodesics_agent_login({ moltbook_identity }) // Sign in with Moltbook',
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

    // ── Path D: WebMCP jury desk key (unique per juror) ──
    if (key) {
        await seedJury().catch(() => {})
        const matched = await matchJuryCode(key)
        if (!matched.ok) {
            await appendLedger({
                id: newLedgerEntryId(),
                ts: new Date().toISOString(),
                experiment: AGENT_EXPERIMENT_ID,
                actor: identifier || "anonymous",
                host_agent: "geodesics",
                action: "agent.login_failed",
                ok: false,
                preview: matched.error,
            })
            return NextResponse.json({ success: false, error: matched.error }, { status: 401, headers: cors })
        }

        const id = (identifier || `jury-${matched.juror.shortcut}`).toLowerCase()
        if (!/^[a-z][a-z0-9._-]{1,63}$/.test(id)) {
            return NextResponse.json(
                { success: false, error: "Invalid agent identifier" },
                { status: 400, headers: cors }
            )
        }

        const jurorPrincipal = juryNetworkPrincipal(matched.juror.slug)
        await addNetworkMember({
            network: "jury",
            principal: jurorPrincipal,
            kind: "juror",
        }).catch(() => {})
        await addNetworkMember({
            network: "jury",
            principal: id,
            kind: "agent",
        }).catch(() => {})

        const session = agentSession({
            identifier: id,
            display_name: id,
            initiated_by: `jury:${matched.juror.slug}`,
        })

        const res = await finishLogin(req, cors, session, "jury", {
            juror: {
                slug: matched.juror.slug,
                name: matched.juror.name,
                org: matched.juror.org,
            },
            network: "jury",
            guide_human: {
                open: "geodesics_open_agent_login",
                path: "Auth → 1 human–agent couple → Dynamic",
                then: 'geodesics_couple_request({ email: "<their Dynamic email>" })',
            },
        })
        res.headers.append(
            "Set-Cookie",
            juryCookieHeader(matched.juror.slug, req.nextUrl.protocol === "https:")
        )
        return res
    }

    // ── Path C: classic issued secret (.env) ──
    if (!identifier || !secret) {
        return NextResponse.json(
            {
                success: false,
                error:
                    'Pick a login path: { moltbook_identity } | { identifier, secret } | { identifier, invite } | { mode: "linked" } | { key } // jury desk',
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
    path: "secret" | "invite" | "linked" | "jury" | "moltbook",
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
        jury: "Jury desk key accepted — you're on the jury ring. Guide your human: open Auth → human–agent couple → Dynamic. Then geodesics_couple_request({ email }).",
        moltbook:
            "Moltbook identity verified — you're on the moltbook ring. Leave trails or couple a human next.",
    }

    const next =
        path === "jury"
            ? [
                  "geodesics_open_agent_login",
                  "geodesics_couple_request",
                  "geodesics_leave_trail",
                  "geodesics_open_map",
              ]
            : path === "moltbook"
              ? [
                    "geodesics_leave_trail",
                    "geodesics_list_trails",
                    "geodesics_open_map",
                    "geodesics_couple_request",
                ]
            : [
                  "geodesics_join_network",
                  "geodesics_list_trails",
                  "geodesics_leave_trail",
                  "geodesics_open_map",
                  "geodesics_list_agent_surface",
              ]

    const res = NextResponse.json(
        {
            success: true,
            mode: "agent",
            path,
            auth_type: "external_agent",
            agent: session,
            ...extra,
            next,
            hint: hints[path],
        },
        { headers: cors }
    )
    res.headers.append("Set-Cookie", visitorCookieHeader(session, req))
    return res
}
