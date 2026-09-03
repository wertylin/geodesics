import { Header, Footer } from "@/components/geodesics"
import { LiveMapExplorer } from "@/components/LiveMapExplorer"

export default function MapPage() {
    return (
        <>
            <Header />
            <main className="map-page">
                <LiveMapExplorer />
            </main>
            <Footer />
        </>
    )
}
