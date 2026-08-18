import { Metadata } from 'next'
import ItineraryClient from './ItineraryClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params

  try {
    const res = await fetch(`${API_URL}/itineraries/${id}`, { next: { revalidate: 300 } })
    if (!res.ok) throw new Error()
    const iti = await res.json()

    const title       = iti.title ?? 'Roteiro de viagem'
    const description = iti.summary
      ?? `Descobre o roteiro para ${iti.destination} no Memovoy.`
    const image       = iti.coverUrl ?? undefined

    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url:    `/itineraries/${id}`,
        images: image ? [{ url: image, width: 1200, height: 630, alt: title }] : [],
        type:   'article',
      },
      twitter: {
        card:        'summary_large_image',
        title,
        description,
        images:      image ? [image] : [],
      },
    }
  } catch {
    return {
      title: 'Roteiro — Memovoy',
      description: 'Planeia e partilha as tuas viagens com o Memovoy.',
    }
  }
}

// O id vem do useParams() dentro do ItineraryClient; a pagina nao precisa dele.
export default function ItineraryPage() {
  return <ItineraryClient />
}
