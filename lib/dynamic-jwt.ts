import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"
import { dynamicEnvironmentId } from "@/lib/dynamic-config"

export type DynamicIdentity = {
    user_id: string
    email: string
    display_name: string | null
}

function jwksUrl(environmentId: string) {
    return new URL(`https://app.dynamicauth.com/api/v0/sdk/${environmentId}/.well-known/jwks`)
}

function emailFromPayload(payload: JWTPayload): string | null {
    if (typeof payload.email === "string" && payload.email.includes("@")) {
        return payload.email.trim().toLowerCase()
    }
    const bag = payload as JWTPayload & {
        verified_credentials?: unknown
        verifiedCredentials?: unknown
    }
    const creds = bag.verified_credentials ?? bag.verifiedCredentials
    if (Array.isArray(creds)) {
        for (const cred of creds) {
            if (!cred || typeof cred !== "object") continue
            const email = (cred as { email?: unknown }).email
            if (typeof email === "string" && email.includes("@")) return email.trim().toLowerCase()
        }
    }
    return null
}

function nameFromPayload(payload: JWTPayload, email: string): string | null {
    if (typeof payload.name === "string" && payload.name.trim()) return payload.name.trim()
    const alias = email.split("@")[0]
    return alias || null
}

function scopesOf(payload: JWTPayload): string[] {
    if (typeof payload.scope === "string") return payload.scope.split(/\s+/).filter(Boolean)
    if (Array.isArray(payload.scopes)) return payload.scopes.map(String)
    return []
}

export async function verifyDynamicJwt(token: string): Promise<DynamicIdentity> {
    const environmentId = dynamicEnvironmentId()
    if (!environmentId) throw Object.assign(new Error("Dynamic is not configured"), { status: 503 })
    if (!token || token.length > 16_000) {
        throw Object.assign(new Error("Missing Dynamic token"), { status: 400 })
    }

    const { payload } = await jwtVerify(token, createRemoteJWKSet(jwksUrl(environmentId)), {
        algorithms: ["RS256"],
    })

    const envClaim = typeof payload.environment_id === "string" ? payload.environment_id : ""
    if (envClaim && envClaim !== environmentId) {
        throw Object.assign(new Error("Dynamic token environment mismatch"), { status: 401 })
    }

    const scopes = scopesOf(payload)
    if (!scopes.includes("user:basic")) {
        throw Object.assign(new Error("Dynamic auth incomplete (need user:basic)"), { status: 401 })
    }

    const userId = typeof payload.sub === "string" ? payload.sub.trim() : ""
    const email = emailFromPayload(payload)
    if (!userId || !email) {
        throw Object.assign(new Error("Dynamic token missing identity"), { status: 401 })
    }

    return {
        user_id: userId,
        email,
        display_name: nameFromPayload(payload, email),
    }
}
