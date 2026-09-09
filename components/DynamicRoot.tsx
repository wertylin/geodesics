"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { DynamicProvider, useOnEvent } from "@dynamic-labs-sdk/react-hooks"
import { createWaasWalletAccounts, getChainsMissingWaasWalletAccounts } from "@dynamic-labs-sdk/client/waas"
import { logout as dynamicLogout, type DynamicClient } from "@dynamic-labs-sdk/client"
import { dynamicEnvironmentId } from "@/lib/dynamic-config"
import { getDynamicClient } from "@/lib/dynamic-client"
import { hydrateVisitorSession, visitorSessionFromLoginPayload } from "@/lib/agent-session"

const queryClient = new QueryClient()

const PassportReadyContext = createContext(false)

export function useDynamicPassportReady() {
    return useContext(PassportReadyContext)
}

function WaasBootstrap() {
    useOnEvent({
        event: "userChanged",
        listener: async ({ user }) => {
            if (!user) return
            try {
                const missing = getChainsMissingWaasWalletAccounts()
                if (missing.length === 0) return
                await createWaasWalletAccounts({ chains: missing })
            } catch (err) {
                console.warn("[dynamic] waas wallet create skipped:", err)
            }
        },
    })
    return null
}

function GeodesicsBridge() {
    const last = useRef<string | null>(null)
    useOnEvent({
        event: "tokenChanged",
        listener: async ({ token }) => {
            if (!token) return
            if (last.current === token) return
            last.current = token
            try {
                const res = await fetch("/api/auth/dynamic", {
                    method: "POST",
                    credentials: "include",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ token }),
                })
                const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
                if (!res.ok) {
                    last.current = null
                    console.warn("[dynamic] session exchange failed:", data.error)
                    return
                }
                const session = visitorSessionFromLoginPayload(
                    (data.session && typeof data.session === "object"
                        ? (data.session as Record<string, unknown>)
                        : data)
                )
                if (session) hydrateVisitorSession(session)
            } catch (err) {
                last.current = null
                console.warn("[dynamic] session exchange failed:", err)
            }
        },
    })
    return null
}

export async function logoutDynamicPassport() {
    try {
        await dynamicLogout()
    } catch {
        /* not signed into Dynamic */
    }
}

export function DynamicRoot({ children }: { children: ReactNode }) {
    const env = dynamicEnvironmentId()
    const [client, setClient] = useState<DynamicClient | null>(null)

    useEffect(() => {
        if (!env) return
        setClient(getDynamicClient())
    }, [env])

    if (!env || !client) {
        return <PassportReadyContext.Provider value={false}>{children}</PassportReadyContext.Provider>
    }

    return (
        <QueryClientProvider client={queryClient}>
            <DynamicProvider client={client}>
                <PassportReadyContext.Provider value={true}>
                    <WaasBootstrap />
                    <GeodesicsBridge />
                    {children}
                </PassportReadyContext.Provider>
            </DynamicProvider>
        </QueryClientProvider>
    )
}
