'use client'

import { CSSProperties } from 'react'

interface SkeletonProps {
  className?: string
  style?: CSSProperties
}

/** Single shimmer bar */
export function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div
      className={`rounded-lg animate-pulse ${className}`}
      style={{ background: 'var(--surface2)', ...style }}
      aria-hidden="true"
    />
  )
}

/** Skeleton for a post card */
export function PostCardSkeleton() {
  return (
    <div className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--bg-card)' }}>
      <div className="flex items-center gap-3">
        <Skeleton className="w-10 h-10 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <Skeleton className="h-3 w-28" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-52 w-full rounded-xl" />
      <Skeleton className="h-3 w-3/4" />
      <Skeleton className="h-3 w-1/2" />
    </div>
  )
}

/** Skeleton for an itinerary summary card */
export function ItineraryCardSkeleton() {
  return (
    <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)' }}>
      <Skeleton className="h-40 w-full rounded-none" />
      <div className="p-4 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <div className="flex gap-2 pt-1">
          <Skeleton className="h-5 w-14 rounded-full" />
          <Skeleton className="h-5 w-14 rounded-full" />
        </div>
      </div>
    </div>
  )
}

/** Skeleton for a user row (search / suggestions) */
export function UserRowSkeleton() {
  return (
    <div className="flex items-center gap-3 p-3">
      <Skeleton className="w-10 h-10 rounded-full shrink-0" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-3 w-20" />
      </div>
      <Skeleton className="h-8 w-20 rounded-lg" />
    </div>
  )
}

/** Skeleton for profile header */
export function ProfileHeaderSkeleton() {
  return (
    <div>
      <Skeleton className="h-36 w-full rounded-none" />
      <div className="px-4 pb-4">
        <Skeleton className="w-20 h-20 rounded-full -mt-10 border-4 border-transparent" />
        <div className="mt-3 space-y-2">
          <Skeleton className="h-5 w-36" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-64" />
        </div>
        <div className="flex gap-6 mt-4">
          <div className="space-y-1">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className="space-y-1">
            <Skeleton className="h-5 w-8" />
            <Skeleton className="h-3 w-14" />
          </div>
        </div>
      </div>
    </div>
  )
}

/** Skeleton grid for itinerary list */
export function ItineraryGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <ItineraryCardSkeleton key={i} />
      ))}
    </div>
  )
}

/** Skeleton list for search results */
export function SearchResultsSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="flex flex-col">
      {Array.from({ length: count }).map((_, i) => (
        <UserRowSkeleton key={i} />
      ))}
    </div>
  )
}

/** Skeleton for a notification row */
export function NotificationRowSkeleton() {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Skeleton className="w-9 h-9 rounded-xl shrink-0" />
      <div className="flex-1 space-y-2 pt-0.5">
        <Skeleton className="h-3 w-4/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  )
}

/** Skeleton list for notifications */
export function NotificationsSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="flex flex-col divide-y" style={{ borderColor: 'var(--border)' }}>
      {Array.from({ length: count }).map((_, i) => (
        <NotificationRowSkeleton key={i} />
      ))}
    </div>
  )
}
