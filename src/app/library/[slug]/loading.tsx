import { Skeleton } from '@/components/ui/skeleton'

export default function EbookDetailLoading() {
  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Cover image skeleton — 1/3 */}
        <div className="md:col-span-1">
          <div className="relative w-full" style={{ paddingBottom: '133.33%' }}>
            <Skeleton className="absolute inset-0" />
          </div>
        </div>

        {/* Content skeleton — 2/3 */}
        <div className="md:col-span-2 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-10 w-full mt-4" />
        </div>
      </div>
    </div>
  )
}
