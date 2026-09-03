/** Cookie HMAC + jury-code pepper. No fallback — missing means unsigned cookies / no redeem. */
export function authSecret(): string | undefined {
    const value = process.env.GEODESICS_AUTH_SECRET?.trim()
    return value || undefined
}
