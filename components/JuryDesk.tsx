import type { Juror } from "@/lib/jury"
import type { Trail } from "@/lib/trails"
import Link from "next/link"

export function JuryDesk({ juror, trails }: { juror: Juror; trails: Trail[] }) {
    const count = String(trails.length).padStart(3, "0")
    return (
        <main className={`jury-desk lens-${juror.lens}`}>
            <div className="eyebrow">WEBMCP CHALLENGE · PRIVATE DESK</div>
            <p className="jury-who">
                {juror.name}
                <span>
                    {juror.title} · {juror.org}
                </span>
            </p>
            <h1>{juror.kicker}</h1>
            <LensBody juror={juror} trails={trails} count={count} />
        </main>
    )
}

function LensBody({ juror, trails, count }: { juror: Juror; trails: Trail[]; count: string }) {
    switch (juror.lens) {
        case "chrome":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        WebMCP does not give the agent a new origin. It gives the <em>page</em> a tool
                        surface, and the browser mediates every call. Same cookies. Same CSP. Tab dies,
                        tools die.
                    </p>
                    <dl className="jury-spec">
                        <div>
                            <dt>register</dt>
                            <dd>navigator.modelContext.registerTool</dd>
                        </div>
                        <div>
                            <dt>this origin</dt>
                            <dd>/.well-known/webmcp.json — discovery only</dd>
                        </div>
                        <div>
                            <dt>execute</dt>
                            <dd>in-page · geodesics_agent_login → leave_trail</dd>
                        </div>
                    </dl>
                    <pre className="jury-codeblock">{`if (navigator.modelContext) {
  navigator.modelContext.registerTool({
    name: "geodesics_leave_trail",
    execute: (input) => /* same session as this tab */
  })
}`}</pre>
                    <p className="jury-note">
                        {count} trails in the index. The interesting question is not how many — it is
                        whether a Chrome agent can follow one without a screenshot.
                    </p>
                    <DeskLinks />
                </section>
            )
        case "edge":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        A geodesic is the shortest path that still exists after the topology changes.
                        On the Web that is not a sitemap. It is a sequence of callable hops that
                        survive cache, anycast, and a closed tab.
                    </p>
                    <ol className="jury-hops">
                        <li>
                            <b>edge</b> — the agent is already at an origin, not fetching HTML from a
                            crawl
                        </li>
                        <li>
                            <b>session</b> — cookies ride the same connection the human opened
                        </li>
                        <li>
                            <b>resume</b> — close the tab, the tool surface is gone; the trail row is
                            not
                        </li>
                    </ol>
                    <div className="jury-trails-mini">
                        {trails.slice(0, 4).map((t) => (
                            <Link key={t.id} href={`/trail/${t.id}`}>
                                {t.origin}
                                <small>{t.route}</small>
                            </Link>
                        ))}
                    </div>
                    <DeskLinks />
                </section>
            )
        case "next":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        This map is an App Router. Files are trails.{" "}
                        <code>app/trail/[id]</code> is a hop.{" "}
                        <code>app/.well-known/webmcp.json</code> is how an agent finds the index
                        without scraping the layout.
                    </p>
                    <ul className="jury-files">
                        <li>
                            <code>app/page.tsx</code>
                            <span>landing · jury beam · live count from Postgres</span>
                        </li>
                        <li>
                            <code>app/api/trails/route.ts</code>
                            <span>GET public · POST visitor cookie</span>
                        </li>
                        <li>
                            <code>app/jury/[slug]/page.tsx</code>
                            <span>this desk — one file, seven lenses</span>
                        </li>
                        <li>
                            <code>lib/trails-store.ts</code>
                            <span>Postgres, not the filesystem</span>
                        </li>
                    </ul>
                    <p className="jury-note">
                        If the router is the map, a trail is just a walk that the next agent can
                        <em> navigate</em>, not describe.
                    </p>
                    <DeskLinks />
                </section>
            )
        case "http":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        Before WebMCP, the geodesic was already there: URL, method, status, cache.
                        Agents forgot that and started taking pictures of buttons. This project is a
                        reminder that &quot;how do I get there?&quot; is a protocol question.
                    </p>
                    <table className="jury-table">
                        <thead>
                            <tr>
                                <th>question</th>
                                <th>HTTP</th>
                                <th>screenshot agent</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>what can I do?</td>
                                <td>Link / Allow / well-known</td>
                                <td>guess from pixels</td>
                            </tr>
                            <tr>
                                <td>am I allowed?</td>
                                <td>cookie · 401 · CORS</td>
                                <td>maybe click Sign in</td>
                            </tr>
                            <tr>
                                <td>did it work?</td>
                                <td>status + body</td>
                                <td>OCR the toast</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="jury-note">
                        Trails here store origin + route + next[]. Next is never empty — a path
                        that dead-ends is not a geodesic.
                    </p>
                    <DeskLinks />
                </section>
            )
        case "mcpb":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        MCP-B put the host in the browser. GEODESICS is the other half: once a page
                        can host tools, agents need a map of which origins are actually callable —
                        and a way to leave the walk for the next host.
                    </p>
                    <div className="jury-dual">
                        <div>
                            <span>HTTP</span>
                            <p>Discovery. Manifest. Issued principals. No execute.</p>
                        </div>
                        <div>
                            <span>in-page</span>
                            <p>
                                document.modelContext / __geodesicsExecuteTool. Login, list,
                                leave_trail.
                            </p>
                        </div>
                    </div>
                    <p className="jury-note">
                        Dual map lives at GET /api/webmcp and geodesics_list_agent_surface. If you
                        curl trails to steer the tab, you&apos;re on the wrong channel.
                    </p>
                    <DeskLinks />
                </section>
            )
        case "applied":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        Applied AI is not a chat overlay. It is a path that another system can run
                        tomorrow. A trail that cannot be re-tested is a press release.
                    </p>
                    <ol className="jury-hops">
                        <li>
                            <b>observe</b> — agent hits a capability that is not on the map
                        </li>
                        <li>
                            <b>test</b> — same hop, machine-checkable expect
                        </li>
                        <li>
                            <b>leave</b> — row in Postgres, next[] points somewhere followable
                        </li>
                    </ol>
                    <p className="jury-note">
                        {count} observations stored. Deployed meaning: the next Netlify/OpenClaw
                        agent does not start from a blank search box.
                    </p>
                    <DeskLinks />
                </section>
            )
        case "browser-agent":
            return (
                <section className="jury-body">
                    <p className="jury-lead">
                        If the agent is a guest, the host sets the table. Do not infer the checkout
                        button. Call the tool the page registered — or leave, and write down the
                        walk so the next guest does not have to guess either.
                    </p>
                    <pre className="jury-codeblock">{`await window.__geodesicsExecuteTool("geodesics_agent_login", {
  identifier: "<issued>",
  secret: "<issued>"
})
await window.__geodesicsExecuteTool("geodesics_leave_trail", {
  origin: location.host,
  route: "search → product → checkout",
  status: "verified"
})`}</pre>
                    <p className="jury-note">
                        Guest rules: same origin, same session, no persistence of tools across
                        navigation. The map persists. The visit does not.
                    </p>
                    <DeskLinks />
                </section>
            )
    }
}

function DeskLinks() {
    return (
        <div className="jury-links">
            <Link className="lime-button" href="/map">
                Follow the map <span>→</span>
            </Link>
            <Link className="outline-button" href="/AGENT_HANDSHAKE.md">
                Handshake
            </Link>
            <Link className="text-button" href="/agent">
                Agent entry ↗
            </Link>
        </div>
    )
}
