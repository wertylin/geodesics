import { cookies, headers } from "next/headers"
import { notFound } from "next/navigation"
import type { Metadata } from "next"
import { Footer, Header } from "@/components/geodesics"
import { JuryDesk } from "@/components/JuryDesk"
import { getJuror, JURY_COOKIE, recordJuryVisit } from "@/lib/jury"
import { listTrails } from "@/lib/trails-store"

export const dynamic = "force-dynamic"

export async function generateMetadata({
    params,
}: {
    params: Promise<{ slug: string }>
}): Promise<Metadata> {
    const { slug } = await params
    const juror = getJuror(slug)
    return {
        title: juror ? `${juror.name} · GEODESICS desk` : "Desk",
        robots: { index: false, follow: false },
    }
}

export default async function JuryPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const juror = getJuror(slug)
    if (!juror) notFound()

    const jar = await cookies()
    const granted = jar.get(JURY_COOKIE)?.value
    if (granted !== slug) notFound()

    const ua = (await headers()).get("user-agent")
    await recordJuryVisit(slug, ua).catch(() => {})

    const trails = await listTrails()
    return (
        <>
            <Header />
            <JuryDesk juror={juror} trails={trails} />
            <Footer />
        </>
    )
}
