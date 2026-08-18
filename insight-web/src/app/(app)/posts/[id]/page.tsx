import type { Metadata } from 'next'
import PostDetailClient from './PostDetailClient'

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'

interface Props {
  params: Promise<{ id: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  try {
    const res = await fetch(`${API_URL}/posts/${id}`, { next: { revalidate: 60 } })
    if (!res.ok) throw new Error()
    const post = await res.json()
    const title = `${post.displayName ?? post.username} em ${post.destination ?? 'Memovoy'}`
    const description = post.caption?.slice(0, 200) || 'Vê este post de viagem no Memovoy.'
    const image = post.images?.[0]
    return {
      title,
      description,
      openGraph: {
        title,
        description,
        url: `/posts/${id}`,
        images: image ? [{ url: image, width: 1080, height: 1350, alt: title }] : [],
        type: 'article',
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: image ? [image] : [],
      },
    }
  } catch {
    return {
      title: 'Post — Memovoy',
      description: 'Descobre posts de viagem no Memovoy.',
    }
  }
}

export default function PostPage() {
  return <PostDetailClient />
}
