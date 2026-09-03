import { Header, Footer, MapCanvas } from "@/components/geodesics"
import { listTrails } from "@/lib/trails-store"

export const dynamic = "force-dynamic"

export default async function MapPage() {
    const trails = await listTrails()
    const latest = trails[0]
    return (
        <>
            <Header />
            <main className="map-page">
                <div className="map-page-head">
                    <div>
                        <div className="eyebrow">EXPLORER / LIVE NETWORK</div>
                        <h1>The map is alive.</h1>
                    </div>
                    <div className="map-controls">
                        <span className="muted">{String(trails.length).padStart(3, "0")} trails</span>
                    </div>
                </div>
                <div className="map-explorer">
                    <MapCanvas trails={trails} />
                    <aside className="node-panel">
                        {latest ? (
                            <>
                                <div className="eyebrow">LATEST TRAIL / {latest.id}</div>
                                <h2>{latest.agent}</h2>
                                <StatusLine label="ORIGIN" value={latest.origin} />
                                <StatusLine label="ROUTE" value={latest.route} />
                                <StatusLine label="GOAL" value={latest.goal || "—"} />
                                <StatusLine label="STATUS" value={latest.status} good={latest.status === "verified"} />
                                <StatusLine label="DISCOVERED" value={latest.age} />
                                <a className="lime-button" href={`/trail/${latest.id}`}>
                                    View trail <span>→</span>
                                </a>
                            </>
                        ) : (
                            <>
                                <div className="eyebrow">NO TRAILS YET</div>
                                <h2>empty map</h2>
                                <p className="muted">POST /api/trails</p>
                            </>
                        )}
                    </aside>
                </div>
            </main>
            <Footer />
        </>
    )
}

function StatusLine({
    label,
    value,
    good,
}: {
    label: string
    value: string
    good?: boolean
}) {
    return (
        <div className="status-line">
            <span>{label}</span>
            <strong className={good ? "good" : ""}>{value}</strong>
        </div>
    )
}
