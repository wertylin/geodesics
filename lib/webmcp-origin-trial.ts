/**
 * Chrome WebMCP origin trial (Chrome 149–156).
 * Token payload is public (origin + feature + expiry + isThirdParty).
 *
 * First-party tokens: Origin-Trial header or <meta http-equiv="origin-trial">.
 * Third-party tokens: MUST come from an external script whose origin matches
 * the token origin — header/meta/inline on the embedding page is ignored.
 *
 * @see https://developer.chrome.com/docs/web-platform/origin-trials
 * @see https://developer.chrome.com/docs/web-platform/third-party-origin-trials
 */

export type WebMcpOriginTrialPayload = {
    origin: string
    feature: string
    expiry: number
    isThirdParty: boolean
}

export const WEBMCP_ORIGIN_TRIAL_SCRIPT_PATH = "/webmcp-ot.js"

function decodeTokenPayload(token: string): WebMcpOriginTrialPayload | null {
    const parts = token.split(".")
    const blob = parts.length >= 2 ? parts[1] : token
    const b64 = blob.replace(/-/g, "+").replace(/_/g, "/")
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4)
    try {
        const json = Buffer.from(padded, "base64").toString("utf8")
        const start = json.indexOf("{")
        const end = json.lastIndexOf("}")
        if (start < 0 || end < start) return null
        const parsed = JSON.parse(json.slice(start, end + 1)) as Record<string, unknown>
        if (typeof parsed.origin !== "string" || typeof parsed.feature !== "string") return null
        return {
            origin: parsed.origin,
            feature: parsed.feature,
            expiry: typeof parsed.expiry === "number" ? parsed.expiry : 0,
            isThirdParty: parsed.isThirdParty === true,
        }
    } catch {
        return null
    }
}

export function getWebMcpOriginTrialToken(): string {
    return process.env.WEBMCP_ORIGIN_TRIAL_TOKEN?.trim() ?? ""
}

export function getWebMcpOriginTrialPayload(): WebMcpOriginTrialPayload | null {
    const token = getWebMcpOriginTrialToken()
    if (!token) return null
    return decodeTokenPayload(token)
}

/** Absolute script URL on the registered origin — required for third-party tokens (www vs apex). */
export function getWebMcpOriginTrialScriptSrc(): string | null {
    const token = getWebMcpOriginTrialToken()
    if (!token) return null
    if (process.env.NODE_ENV !== "production") return WEBMCP_ORIGIN_TRIAL_SCRIPT_PATH
    const payload = decodeTokenPayload(token)
    if (!payload?.origin) return WEBMCP_ORIGIN_TRIAL_SCRIPT_PATH
    try {
        return new URL(WEBMCP_ORIGIN_TRIAL_SCRIPT_PATH, payload.origin).href
    } catch {
        return WEBMCP_ORIGIN_TRIAL_SCRIPT_PATH
    }
}

export function originTrialInjectorScript(token: string): string {
    return `(function(){if(!document.head)return;var m=document.createElement("meta");m.httpEquiv="origin-trial";m.content=${JSON.stringify(token)};document.head.appendChild(m);})();`
}
