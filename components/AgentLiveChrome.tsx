"use client"

import { AgentActivityTicker } from "@/components/AgentActivityTicker"
import { AgentObserverPanel } from "@/components/AgentObserverPanel"

/** Global chrome: live activity stream + session observer on every page. */
export function AgentLiveChrome() {
    return (
        <div className="agent-live-chrome">
            <div className="agent-live-dock">
                <AgentObserverPanel compact />
                <AgentActivityTicker />
            </div>
        </div>
    )
}
