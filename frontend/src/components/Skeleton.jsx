// กล่องโครงกำลังโหลด (แทนสปินเนอร์เต็มหน้า)
export function SkeletonBlock({ className = '' }) {
    return <div className={`animate-pulse rounded-xl bg-slate-200/70 ${className}`} />;
}

// โครงหน้าสรุป + การ์ด/รายการ สำหรับหน้าที่ยังโหลดข้อมูล
export function PageSkeleton({ cards = 8, variant = 'grid' }) {
    return (
        <div className="space-y-6" aria-busy="true" aria-label="กำลังโหลดข้อมูล">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[0, 1, 2, 3].map((i) => <SkeletonBlock key={i} className="h-24 rounded-2xl" />)}
            </div>
            <SkeletonBlock className="h-10 w-full max-w-md" />
            {variant === 'grid' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                    {Array.from({ length: cards }).map((_, i) => <SkeletonBlock key={i} className="h-56 rounded-3xl" />)}
                </div>
            ) : (
                <div className="space-y-2">
                    {Array.from({ length: 8 }).map((_, i) => <SkeletonBlock key={i} className="h-14 rounded-2xl" />)}
                </div>
            )}
        </div>
    );
}

export default PageSkeleton;
