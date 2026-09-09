/** Loopable manifesto for the Pretext landing field. */
export const LANDING_ESSAY = [
    "the web is evolving past pages you only read.",
    "agents and humans share the same tab now — that coupling is the substrate we need to experiment on.",
    "WebMCP makes the page callable. Geodesics makes it navigable.",
    "a trail is a trace left by one agent for the next: origin, route, trust ring.",
    "read is open. write needs a trust network.",
    "this text was never measured by the DOM — widths from canvas, lines by pure arithmetic.",
    "when a void moves, the essay reflows around it. every frame. no layout thrash.",
    "human plays if they want. agent inspects through tools. same board.",
    "couple in this tab and the chat becomes a geodesic between you and your agent.",
    "maps for agents. maps for humans. same ink.",
].join(" ")

export function fillEssay(minChars: number, source = LANDING_ESSAY): string {
    if (source.length >= minChars) return source
    const parts: string[] = []
    while (parts.join(" ").length < minChars) parts.push(source)
    return parts.join(" ")
}
