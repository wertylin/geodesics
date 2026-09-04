/** Dual auth surfaces inside GEODESICS. */

export const AUTH_TYPES = ["external_agent", "human_couple"] as const
export type AuthType = (typeof AUTH_TYPES)[number]

export function isAuthType(v: unknown): v is AuthType {
    return typeof v === "string" && (AUTH_TYPES as readonly string[]).includes(v)
}

export function normalizeAuthType(v: unknown): AuthType {
    return isAuthType(v) ? v : "external_agent"
}

export function authTypeLabel(t: AuthType): string {
    return t === "human_couple" ? "human–agent couple" : "external agent"
}
