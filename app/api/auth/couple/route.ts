import { NextRequest, NextResponse } from "next/server"
import {
    agentCorsHeaders,
    agentOptionsResponse,
    requireVisitor,
    visitorCookieHeader,
} from "@/lib/agent-access"
import {
    acceptCoupleRequest,
    acceptCoupleRequestByAgent,
    claimCoupleInvite,
    getHumanByGoogleSub,
    listCoupleRequestsForEmail,
    mintCoupleInvite,
    mintCoupleRequest,
    rejectCoupleRequestByAgent,
    sessionFromHuman,
    unlinkIssuedAgent,
} from "@/lib/human-couple"

export const dynamic = "force-dynamic"

export async function OPTIONS(req: NextRequest) {
    return agentOptionsResponse(req)
}

/**
 * Couple bond without sharing agent secrets.
 * Human: invite | accept | reject | unlink | pending
 * Agent:  claim | request
 */
export async function POST(req: NextRequest) {
    const cors = agentCorsHeaders(req)
    const gate = requireVisitor(req)
    if (gate instanceof NextResponse) return gate

    const visitor = gate.visitor
    let body: {
        action?: string
        invite?: string
        request?: string
        email?: string
        agent?: string
    }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors })
    }

    const action = typeof body.action === "string" ? body.action : "invite"

    // ── agent paths ──
    if (action === "claim" || action === "request") {
        if (visitor.auth_type !== "external_agent") {
            return NextResponse.json(
                { error: "Log in as the issued agent first." },
                { status: 403, headers: cors }
            )
        }

        if (action === "request") {
            const email = typeof body.email === "string" ? body.email : null
            try {
                const minted = await mintCoupleRequest({
                    agentIdentifier: visitor.identifier,
                    humanEmail: email,
                })
                return NextResponse.json(
                    {
                        success: true,
                        request: minted.request,
                        expires_in_sec: minted.expires_in_sec,
                        human_email: minted.human_email,
                        hint: minted.human_email
                            ? `Request queued for ${minted.human_email}. They accept in Observer — or hand them: ${minted.request}`
                            : `Hand req to human. They accept in Observer: execute accept with request "${minted.request.slice(0, 12)}…"`,
                    },
                    { headers: cors }
                )
            } catch (err) {
                const msg = err instanceof Error ? err.message : "request failed"
                const status =
                    typeof err === "object" && err && "status" in err ? Number((err as { status: number }).status) : 500
                return NextResponse.json({ success: false, error: msg }, { status, headers: cors })
            }
        }

        const invite = typeof body.invite === "string" ? body.invite : ""
        const result = await claimCoupleInvite({
            agentIdentifier: visitor.identifier,
            invite,
        })
        if (!result.ok) {
            return NextResponse.json({ success: false, error: result.error }, { status: 401, headers: cors })
        }
        return NextResponse.json(
            {
                success: true,
                claimed: true,
                linked_agent: result.human.linked_agent,
                human: {
                    email: result.human.email,
                    display_name: result.human.display_name,
                },
                hint: "Couple bond live. Human session will show linked agent on refresh.",
            },
            { headers: cors }
        )
    }

    // ── human paths ──
    if (visitor.auth_type !== "human_couple" || !visitor.google_sub) {
        return NextResponse.json(
            { error: "Sign in as human–agent couple (Google) first." },
            { status: 403, headers: cors }
        )
    }

    const email = visitor.email ?? `${visitor.google_sub}@users.noreply`

    if (action === "pending") {
        const pending = await listCoupleRequestsForEmail(email)
        return NextResponse.json({ success: true, pending }, { headers: cors })
    }

    if (action === "accept") {
        const request = typeof body.request === "string" ? body.request.trim() : ""
        const agent = typeof body.agent === "string" ? body.agent.trim() : ""
        const result = request
            ? await acceptCoupleRequest({
                  googleSub: visitor.google_sub,
                  email,
                  displayName: visitor.display_name,
                  request,
              })
            : agent
              ? await acceptCoupleRequestByAgent({
                    googleSub: visitor.google_sub,
                    email,
                    displayName: visitor.display_name,
                    agent,
                })
              : { ok: false as const, error: "Pass request (req_…) or agent id to accept." }
        if (!result.ok) {
            return NextResponse.json({ success: false, error: result.error }, { status: 401, headers: cors })
        }
        const session = sessionFromHuman(result.human)
        const res = NextResponse.json(
            {
                success: true,
                accepted: true,
                linked_agent: result.agent,
                session,
                hint: `Linked to ${result.agent}. Agent can login with mode:"linked".`,
            },
            { headers: cors }
        )
        res.headers.append("Set-Cookie", visitorCookieHeader(session, req))
        return res
    }

    if (action === "reject") {
        const agent = typeof body.agent === "string" ? body.agent.trim() : ""
        if (!agent) {
            return NextResponse.json({ error: "agent required to reject" }, { status: 400, headers: cors })
        }
        const ok = await rejectCoupleRequestByAgent({ email, agent })
        return NextResponse.json({ success: true, rejected: ok, agent }, { headers: cors })
    }

    if (action === "unlink") {
        const human = await unlinkIssuedAgent(visitor.google_sub)
        const session = human
            ? sessionFromHuman(human)
            : sessionFromHuman({
                  google_sub: visitor.google_sub,
                  email: visitor.email ?? "",
                  display_name: visitor.display_name,
                  picture: null,
                  linked_agent: null,
                  couple_key_hash: null,
                  created_at: new Date().toISOString(),
                  last_login: new Date().toISOString(),
              })
        const res = NextResponse.json({ success: true, unlinked: true, session }, { headers: cors })
        res.headers.append("Set-Cookie", visitorCookieHeader(session, req))
        return res
    }

    // default: mint invite (human → agent)
    const { invite, expires_in_sec } = await mintCoupleInvite({
        googleSub: visitor.google_sub,
        email,
        displayName: visitor.display_name,
    })

    const human = (await getHumanByGoogleSub(visitor.google_sub)) ?? {
        google_sub: visitor.google_sub,
        email: visitor.email ?? "",
        display_name: visitor.display_name,
        picture: null,
        linked_agent: visitor.linked_agent ?? null,
        couple_key_hash: null,
        created_at: new Date().toISOString(),
        last_login: new Date().toISOString(),
    }

    return NextResponse.json(
        {
            success: true,
            invite,
            expires_in_sec,
            session: sessionFromHuman(human),
            hint: `Give invite to your agent: executeTool("geodesics_agent_login", { identifier, invite }). Expires in ${expires_in_sec}s.`,
        },
        { headers: cors }
    )
}
