"use client"

import { IssuedAgentWebMcp } from "@/components/IssuedAgentWebMcp"
import { SnakeWebMcp } from "@/components/SnakeWebMcp"

export function AgentRuntime() {
    return (
        <>
            <IssuedAgentWebMcp />
            <SnakeWebMcp />
        </>
    )
}
