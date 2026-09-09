/** Dynamic is the passport / settlement layer. Geodesics stays the map. */

export function dynamicEnvironmentId(): string {
    return process.env.NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID?.trim() || ""
}

export function dynamicAuthConfigured(): boolean {
    return Boolean(dynamicEnvironmentId() && process.env.GEODESICS_AUTH_SECRET?.trim())
}

export function dynamicHumanKey(userId: string): string {
    return userId.startsWith("dyn:") ? userId : `dyn:${userId}`
}
