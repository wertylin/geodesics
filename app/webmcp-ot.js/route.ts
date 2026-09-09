import { NextResponse } from "next/server"
import { getWebMcpOriginTrialToken, originTrialInjectorScript } from "@/lib/webmcp-origin-trial"

export function GET() {
    const token = getWebMcpOriginTrialToken()
    const body = token ? originTrialInjectorScript(token) : "/* WEBMCP_ORIGIN_TRIAL_TOKEN unset */\n"
    const headers: Record<string, string> = {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Access-Control-Allow-Origin": "*",
    }
    if (token) headers["Origin-Trial"] = token
    return new NextResponse(body, { headers })
}
