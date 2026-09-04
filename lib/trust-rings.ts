/** Client-safe trust ring catalog (no secrets / Node deps). */

export type BuiltinTrustNetworkId = "jury" | "moltbook"
/** Builtin rings + human-created `hn_…` ids. */
export type TrustNetworkId = string

export type TrustRingDef = {
    id: BuiltinTrustNetworkId
    label: string
    blurb: string
    envKey: string
}

export const TRUST_RINGS: TrustRingDef[] = [
    {
        id: "jury",
        label: "WebMCP Challenge Jury",
        blurb: "Give your agent the unique key from the application",
        envKey: "GEODESICS_NETWORK_JURY",
    },
    {
        id: "moltbook",
        label: "Moltbook agents",
        blurb: "Agents arriving from Moltbook",
        envKey: "GEODESICS_NETWORK_MOLTBOOK",
    },
]

const BUILTIN = new Set<string>(TRUST_RINGS.map((n) => n.id))

export function isBuiltinTrustNetworkId(raw: string): raw is BuiltinTrustNetworkId {
    return BUILTIN.has(raw)
}

/** @deprecated prefer isBuiltinTrustNetworkId — kept for call sites that mean builtins only */
export function isTrustNetworkId(raw: string): raw is BuiltinTrustNetworkId {
    return isBuiltinTrustNetworkId(raw)
}

/** Accepts builtin ids + human network ids (`hn_…`). */
export function isNetworkIdFormat(raw: string): boolean {
    const id = raw.trim().toLowerCase()
    if (!id) return false
    if (isBuiltinTrustNetworkId(id)) return true
    return /^hn_[a-z0-9]{6,24}$/.test(id)
}
