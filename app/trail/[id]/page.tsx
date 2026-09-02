import { Header, Footer, TrailDetail } from '@/components/geodesics'
export default async function TrailPage({params}:{params:Promise<{id:string}>}){const {id}=await params;return <><Header/><TrailDetail id={id}/><Footer/></>}
