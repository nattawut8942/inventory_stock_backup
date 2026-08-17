import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, Images, Calendar, Star, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { API_BASE, API_URL } from '../config/api';
import { formatThaiDate } from '../utils/formatDate';
import AlertModal from '../components/AlertModal';
import ActivityAlbumCard from '../components/ActivityAlbumCard';
import ActivityUploadModal from '../components/ActivityUploadModal';
import ActivityViewerModal from '../components/ActivityViewerModal';

const ActivityPage = () => {
    const { user } = useAuth();
    const isAdmin = user?.role === 'Staff';

    const [categories, setCategories] = useState([]);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [viewingAlbumId, setViewingAlbumId] = useState(null);
    const [alertModal, setAlertModal] = useState({ isOpen: false, type: 'info', title: '', message: '' });

    // Hero — ดึงแยกต่างหาก ไม่ผูกกับ filter/pagination ของกริด
    const [heroAlbums, setHeroAlbums] = useState([]);
    const [heroLoading, setHeroLoading] = useState(true);
    const [heroIndex, setHeroIndex] = useState(0);

    // Grid — ค้นหา + filter หมวด + pagination ทั้งหมดทำที่ backend
    const [category, setCategory] = useState('all');
    const [searchInput, setSearchInput] = useState('');
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [gridAlbums, setGridAlbums] = useState([]);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [gridLoading, setGridLoading] = useState(true);

    useEffect(() => {
        fetch(`${API_BASE}/activity-categories`)
            .then(res => res.json())
            .then(setCategories)
            .catch(err => console.error('Fetch categories error:', err));
    }, []);

    const fetchHeroAlbums = async () => {
        setHeroLoading(true);
        try {
            const res = await fetch(`${API_BASE}/albums/hero`);
            if (res.ok) {
                const data = await res.json();
                setHeroAlbums(Array.isArray(data) ? data : []);
            } else {
                setHeroAlbums([]);
            }
        } catch (err) {
            console.error('Fetch hero albums error:', err);
            setHeroAlbums([]);
        }
        setHeroLoading(false);
    };

    const fetchGridAlbums = async () => {
        setGridLoading(true);
        try {
            const params = new URLSearchParams({ page: String(page), pageSize: '20' });
            if (category !== 'all') params.set('category', category);
            if (search.trim()) params.set('search', search.trim());
            const res = await fetch(`${API_BASE}/albums?${params.toString()}`);
            if (res.ok) {
                const data = await res.json();
                // กันพังถ้า backend ยังเป็นเวอร์ชันเก่า (คืน array ตรงๆ แทนที่จะเป็น object)
                if (Array.isArray(data)) {
                    setGridAlbums(data);
                    setTotalPages(1);
                    setTotalCount(data.length);
                } else {
                    setGridAlbums(Array.isArray(data.albums) ? data.albums : []);
                    setTotalPages(data.totalPages || 1);
                    setTotalCount(data.totalCount || 0);
                }
            } else {
                setGridAlbums([]);
                setTotalPages(1);
                setTotalCount(0);
            }
        } catch (err) {
            console.error('Fetch grid albums error:', err);
            setGridAlbums([]);
            setTotalPages(1);
            setTotalCount(0);
        }
        setGridLoading(false);
    };

    useEffect(() => { fetchHeroAlbums(); }, []);
    useEffect(() => { fetchGridAlbums(); }, [category, search, page]);

    // debounce ช่องค้นหา 400ms กันยิง API ถี่เกินไปตอนพิมพ์
    useEffect(() => {
        const t = setTimeout(() => {
            setSearch(searchInput);
            setPage(1);
        }, 400);
        return () => clearTimeout(t);
    }, [searchInput]);

    useEffect(() => { setPage(1); }, [category]);

    // เปลี่ยนรูป hero อัตโนมัติทุก 5 วินาที
    useEffect(() => {
        if (heroAlbums.length <= 1) return;
        const timer = setInterval(() => {
            setHeroIndex(i => (i + 1) % heroAlbums.length);
        }, 5000);
        return () => clearInterval(timer);
    }, [heroAlbums.length]);

    // รายชื่ออัลบัมทั้งหมด (แค่ id+title) สำหรับ dropdown ตอนอัปโหลด — แยกจาก gridAlbums ที่ถูก paginate แล้ว
    const [allAlbumsForDropdown, setAllAlbumsForDropdown] = useState([]);
    const fetchAllAlbumsForDropdown = async () => {
        try {
            const res = await fetch(`${API_BASE}/albums?pageSize=200`);
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    setAllAlbumsForDropdown(data);
                } else {
                    setAllAlbumsForDropdown(Array.isArray(data.albums) ? data.albums : []);
                }
            }
        } catch (err) {
            console.error('Fetch albums for dropdown error:', err);
        }
    };
    useEffect(() => { fetchAllAlbumsForDropdown(); }, []);

    const refreshAll = () => { fetchHeroAlbums(); fetchGridAlbums(); fetchAllAlbumsForDropdown(); };

    const handleTogglePin = async (albumId, featured) => {
        try {
            const res = await fetch(`${API_BASE}/albums/${albumId}/feature`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ featured }),
            });
            if (res.ok) {
                setHeroIndex(0); // อัลบัมที่ปักหมุดจะถูกจัดขึ้นอันดับ 1 เสมอ ต้องรีเซ็ตตำแหน่งที่โชว์อยู่ด้วย
                refreshAll();
            }
        } catch (err) {
            console.error('Toggle pin error:', err);
        }
    };

    const handleDeleteAlbum = async (albumId) => {
        try {
            const res = await fetch(`${API_BASE}/albums/${albumId}?role=${encodeURIComponent(user?.role || '')}`, { method: 'DELETE' });
            if (res.ok) {
                refreshAll();
            } else {
                const data = await res.json().catch(() => ({}));
                setAlertModal({ isOpen: true, type: 'error', title: 'ลบไม่สำเร็จ', message: data.error || 'เกิดข้อผิดพลาด' });
            }
        } catch (err) {
            console.error('Delete album error:', err);
        }
    };

    return (
        <div className="space-y-8">
            {/* Header + ปุ่มเพิ่มรูป */}
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-black mb-1 text-slate-800">ACTIVITY</h2>
                    <p className="text-slate-500 font-medium">รวมรูปภาพและประวัติการปฏิบัติงาน IT</p>
                </div>
                <button
                    onClick={() => setUploadOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-indigo-200"
                >
                    <Camera size={18} /> เพิ่มรูปกิจกรรม
                </button>
            </motion.div>

            {/* Hero — เดี่ยว เปลี่ยนรูปอัตโนมัติ ไม่ขึ้นกับ category filter/search */}
            {!heroLoading && heroAlbums.length > 0 && (() => {
                const heroAlbum = heroAlbums[heroIndex % heroAlbums.length];
                const cover = heroAlbum.CoverImageURL ? `${API_URL}${heroAlbum.CoverImageURL}` : null;
                return (
                    <div className="relative rounded-2xl overflow-hidden bg-slate-900 text-white aspect-video md:aspect-[21/9] shadow-xl">
                        <AnimatePresence mode="wait">
                            <motion.div
                                key={heroAlbum.AlbumID}
                                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                transition={{ duration: 0.6 }}
                                className="absolute inset-0"
                            >
                                {cover ? (
                                    <img src={cover} alt={heroAlbum.Title} className="w-full h-full object-contain opacity-90" />
                                ) : (
                                    <div className="w-full h-full bg-gradient-to-br from-slate-800 to-slate-900" />
                                )}
                                <div className="absolute inset-0 bg-gradient-to-t from-slate-900/90 via-slate-900/25 to-transparent" />
                            </motion.div>
                        </AnimatePresence>

                        <button
                            onClick={() => handleTogglePin(heroAlbum.AlbumID, !heroAlbum.IsFeatured)}
                            title={heroAlbum.IsFeatured ? 'ยกเลิกการปักหมุด' : 'ปักหมุดไว้ซ้ายสุด'}
                            className={`absolute top-4 right-4 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all ${heroAlbum.IsFeatured ? 'bg-amber-400 text-white' : 'bg-white/10 backdrop-blur text-white/70 hover:bg-white/20'}`}
                        >
                            <Star size={16} fill={heroAlbum.IsFeatured ? 'currentColor' : 'none'} />
                        </button>

                        <div
                            onClick={() => setViewingAlbumId(heroAlbum.AlbumID)}
                            className="relative z-[1] h-full flex items-end p-6 lg:p-8 cursor-pointer"
                        >
                            <div>
                                <h2 className="text-3xl lg:text-4xl font-black tracking-tight mb-2 line-clamp-1">{heroAlbum.Title}</h2>
                                {heroAlbum.Description && (
                                    <p className="max-w-lg text-slate-200 text-sm mb-4 font-light line-clamp-2">{heroAlbum.Description}</p>
                                )}
                                <div className="flex items-center gap-4 text-xs text-slate-200">
                                    <span className="flex items-center gap-1.5"><Calendar size={13} /> {formatThaiDate(heroAlbum.EventDate)}</span>
                                    <span className="flex items-center gap-1.5"><Images size={13} /> {heroAlbum.PhotoCount} รูปภาพ</span>
                                </div>
                            </div>
                        </div>

                        {heroAlbums.length > 1 && (
                            <div className="absolute bottom-5 right-6 flex gap-1.5 z-10">
                                {heroAlbums.map((a, i) => (
                                    <button
                                        key={a.AlbumID}
                                        onClick={(e) => { e.stopPropagation(); setHeroIndex(i); }}
                                        className={`h-1.5 rounded-full transition-all ${i === heroIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40 hover:bg-white/60'}`}
                                    />
                                ))}
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Search + Category filter */}
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                <div className="relative flex-1 max-w-sm">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        placeholder="ค้นหาอัลบัมด้วยชื่อ..."
                        className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-sm shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
                    />
                </div>

                <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm w-fit flex-wrap">
                    <button
                        onClick={() => setCategory('all')}
                        className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${category === 'all' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
                    >
                        ทั้งหมด
                    </button>
                    {categories.map(cat => (
                        <button
                            key={cat.CategoryCode}
                            onClick={() => setCategory(cat.CategoryCode)}
                            className={`px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${category === cat.CategoryCode ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-500 hover:text-indigo-600 hover:bg-indigo-50'}`}
                        >
                            {cat.Label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Album grid — พร้อม pagination จาก backend */}
            {gridLoading ? (
                <div className="text-center py-16 text-slate-400">กำลังโหลดอัลบัม...</div>
            ) : gridAlbums.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                    <Images size={48} className="mb-3" />
                    <p className="font-bold text-slate-400">
                        {search ? `ไม่พบอัลบัมที่ตรงกับ "${search}"` : 'ยังไม่มีอัลบัมกิจกรรม'}
                    </p>
                    {!search && <p className="text-sm text-slate-400 mt-1">กดปุ่ม "เพิ่มรูปกิจกรรม" เพื่อเริ่มต้น</p>}
                </div>
            ) : (
                <div>
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-bold text-slate-800">อัลบัมทั้งหมด</h3>
                        <span className="text-xs text-slate-400">{totalCount} อัลบัม</span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4">
                        {gridAlbums.map((album, idx) => (
                            <ActivityAlbumCard
                                key={album.AlbumID}
                                album={album}
                                index={idx}
                                onClick={setViewingAlbumId}
                                onTogglePin={handleTogglePin}
                                onDelete={isAdmin ? handleDeleteAlbum : null}
                                setAlertModal={setAlertModal}
                            />
                        ))}
                    </div>

                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-6">
                            <button
                                onClick={() => setPage(p => Math.max(1, p - 1))}
                                disabled={page === 1}
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50 transition-all"
                            >
                                <ChevronLeft size={16} />
                            </button>

                            {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                                <button
                                    key={p}
                                    onClick={() => setPage(p)}
                                    className={`w-8 h-8 rounded-lg text-sm font-medium transition-all ${p === page ? 'bg-indigo-600 text-white' : 'bg-white border border-slate-200 text-slate-500 hover:bg-slate-50'}`}
                                >
                                    {p}
                                </button>
                            ))}

                            <button
                                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages}
                                className="w-8 h-8 rounded-lg border border-slate-200 bg-white text-slate-500 flex items-center justify-center disabled:opacity-30 hover:bg-slate-50 transition-all"
                            >
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    )}
                </div>
            )}

            {/* Upload modal */}
            <ActivityUploadModal
                isOpen={uploadOpen}
                onClose={() => setUploadOpen(false)}
                onUploaded={refreshAll}
                albums={allAlbumsForDropdown}
                categories={categories}
                setAlertModal={setAlertModal}
            />

            {/* Viewer modal */}
            {viewingAlbumId && (
                <ActivityViewerModal
                    albumId={viewingAlbumId}
                    onClose={() => setViewingAlbumId(null)}
                    onUpdated={refreshAll}
                    categories={categories}
                    setAlertModal={setAlertModal}
                    isAdmin={isAdmin}
                />
            )}

            {/* Alert modal */}
            <AlertModal
                isOpen={alertModal.isOpen}
                type={alertModal.type}
                title={alertModal.title}
                message={alertModal.message}
                onConfirm={alertModal.onConfirm || (() => setAlertModal(prev => ({ ...prev, isOpen: false })))}
                onCancel={alertModal.onCancel}
                confirmText={alertModal.confirmText || 'ปิด'}
                cancelText={alertModal.cancelText || 'ยกเลิก'}
            />
        </div>
    );
};

export default ActivityPage;