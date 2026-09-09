"use client"

import { createDynamicClient, type DynamicClient } from "@dynamic-labs-sdk/client"
import { addEvmExtension } from "@dynamic-labs-sdk/evm"
import { dynamicEnvironmentId } from "@/lib/dynamic-config"

let client: DynamicClient | null = null

export function getDynamicClient(): DynamicClient | null {
    const environmentId = dynamicEnvironmentId()
    if (!environmentId || typeof window === "undefined") return null
    if (!client) {
        client = createDynamicClient({
            environmentId,
            metadata: {
                name: "GEODESICS",
                universalLink: window.location.origin,
            },
        })
        addEvmExtension()
    }
    return client
}

