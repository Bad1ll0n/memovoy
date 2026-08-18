'use client'

import { useEffect, useRef } from 'react'

export function useInfiniteScroll({
  hasMore,
  onLoadMore,
  rootMargin = '200px',
}: {
  hasMore: boolean
  onLoadMore: () => void
  rootMargin?: string
}) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = sentinelRef.current
    if (!el || !hasMore) return

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) onLoadMore()
      },
      { rootMargin },
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [hasMore, onLoadMore, rootMargin])

  return sentinelRef
}
