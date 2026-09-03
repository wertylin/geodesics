import { webmcpManifestResponse, webmcpOptionsResponse } from "@/lib/webmcp-http"

export const dynamic = "force-dynamic"

export async function GET() {
    return webmcpManifestResponse()
}

export async function OPTIONS() {
    return webmcpOptionsResponse()
}
