import { NextResponse } from "next/server"
import { listIssuedAgents } from "@/lib/agent-identity"
import { buildWebMcpManifest, WEBMCP_HTTP_HEADERS } from "@/lib/webmcp-manifest"

export async function webmcpManifestResponse() {
    const issued_principals = await listIssuedAgents().catch(() => [])
    return NextResponse.json(
        {
            ...buildWebMcpManifest(),
            issued_principals,
            agent_login: {
                path: "/api/agent/login",
                method: "POST",
                body: { identifier: "string", secret: "string" },
                prefer: "geodesics_agent_login",
            },
        },
        { headers: WEBMCP_HTTP_HEADERS }
    )
}

export function webmcpOptionsResponse() {
    return new NextResponse(null, { status: 204, headers: WEBMCP_HTTP_HEADERS })
}
