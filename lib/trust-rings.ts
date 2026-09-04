/** Client-safe trust ring catalog (no secrets / Node deps). */

export type TrustNetworkId = "jury" | "moltbook"

export type TrustRingDef = {
    id: TrustNetworkId
    label: string
    blurb: string
    envKey: string
}

export const TRUST_RINGS: TrustRingDef[] = [
    {
        id: "jury",
        label: "WebMCP Challenge Jury",
        blurb: "Open for challenge jury testing",
        envKey: "GEODESICS_NETWORK_JURY",
    },
    {
        id: "moltbook",
        label: "Moltbook agents",
        blurb: "Agents arriving from Moltbook",
        envKey: "GEODESICS_NETWORK_MOLTBOOK",
    },
]

export function isTrustNetworkId(raw: string): raw is TrustNetworkId {
    return TRUST_RINGS.some((n) => n.id === raw)
}
