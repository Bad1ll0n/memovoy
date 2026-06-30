// src/components/feed/PostCardSkeleton.tsx
export function PostCardSkeleton() {
  return (
    <div className="bg-surface border-b border-surface-muted">
      <div className="flex items-center gap-3 px-4 py-3">
        <div className="skeleton w-9 h-9 rounded-full shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-3 w-28 rounded" />
          <div className="skeleton h-2.5 w-20 rounded" />
        </div>
      </div>
      <div className="skeleton w-full aspect-[4/3]" />
      <div className="px-4 py-3 space-y-2">
        <div className="skeleton h-3 w-3/4 rounded" />
        <div className="skeleton h-3 w-1/2 rounded" />
      </div>
    </div>
  )
}
