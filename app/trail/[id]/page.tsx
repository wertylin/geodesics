import { notFound } from "next/navigation"
import { Header, Footer } from "@/components/geodesics"
import { TrailDetail } from "@/components/TrailDetail"
import { getTrail } from "@/lib/trails-store"

export const dynamic = "force-dynamic"

export default async function TrailPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params
    const trail = await getTrail(id)
    if (!trail) notFound()
    return (
        <>
            <Header />
            <TrailDetail trail={trail} />
            <Footer />
        </>
    )
}
