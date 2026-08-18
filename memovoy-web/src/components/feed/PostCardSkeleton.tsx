export function PostCardSkeleton() {
  return (
    <div className="card mb-5 overflow-hidden">
      <div className="flex items-center gap-3 p-3">
        <div className="skeleton w-10 h-10 rounded-full" />
        <div className="flex-1">
          <div className="skeleton h-3.5 w-28 mb-1.5 rounded" />
          <div className="skeleton h-3 w-20 rounded" />
        </div>
      </div>
      <div className="skeleton w-full" style={{ aspectRatio: '4/5' }} />
      <div className="p-3 flex gap-4">
        <div className="skeleton h-5 w-16 rounded" />
        <div className="skeleton h-5 w-16 rounded" />
      </div>
    </div>
  )
}
