import React from 'react';
import { motion } from 'motion/react';
import { Images, Star, Trash2 } from 'lucide-react';
import { API_URL } from '../config/api';
import { formatThaiDate } from '../utils/formatDate';

const ActivityAlbumCard = ({ album, index = 0, onClick, onTogglePin, onDelete, setAlertModal, compact = false }) => {
    const coverSrc = (album.CoverThumbnailURL || album.CoverImageURL) ? `${API_URL}${album.CoverThumbnailURL || album.CoverImageURL}` : null;
    const categoryColor = album.CategoryColor || '#64748B';
    const categoryLabel = album.CategoryLabel || album.Category;

    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.03 }}
            onClick={() => onClick(album.AlbumID)}
            className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 border border-slate-100 cursor-pointer flex flex-col h-full relative"
        >
            {onTogglePin && (
                <button
                    onClick={(e) => { e.stopPropagation(); onTogglePin(album.AlbumID, !album.IsFeatured); }}
                    title={album.IsFeatured ? 'ยกเลิกการปักหมุด' : 'ปักหมุดไว้ซ้ายสุด'}
                    className={`absolute top-2 right-2 z-10 w-7 h-7 rounded-full flex items-center justify-center transition-all shadow-sm ${
                        album.IsFeatured
                            ? 'bg-amber-400 text-white'
                            : 'bg-white/90 backdrop-blur text-slate-400 opacity-0 group-hover:opacity-100 hover:text-amber-500'
                    }`}
                >
                    <Star size={13} fill={album.IsFeatured ? 'currentColor' : 'none'} />
                </button>
            )}
            {onDelete && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (!setAlertModal) { onDelete(album.AlbumID); return; }
                        setAlertModal({
                            isOpen: true,
                            type: 'danger',
                            title: 'ลบอัลบัม',
                            message: `ลบอัลบัม "${album.Title}" ออกจากหน้าเว็บ? (รูปในอัลบัมจะยังไม่ถูกลบ)`,
                            confirmText: 'ลบ',
                            cancelText: 'ยกเลิก',
                            onConfirm: () => { onDelete(album.AlbumID); setAlertModal(prev => ({ ...prev, isOpen: false })); },
                            onCancel: () => setAlertModal(prev => ({ ...prev, isOpen: false })),
                        });
                    }}
                    title="ลบอัลบัม"
                    className="absolute top-2 left-2 z-10 w-7 h-7 rounded-full bg-white/90 backdrop-blur text-slate-400 opacity-0 group-hover:opacity-100 hover:text-red-500 flex items-center justify-center transition-all shadow-sm"
                >
                    <Trash2 size={13} />
                </button>
            )}

            <div
                className="relative overflow-hidden bg-slate-200"
                style={{ height: compact ? '96px' : '180px' }}
            >
                {coverSrc ? (
                    <img src={coverSrc} alt={album.Title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center bg-slate-100">
                        <Images size={compact ? 20 : 32} className="text-slate-300" />
                    </div>
                )}
                <div className={`absolute bottom-2 right-2 bg-black/60 backdrop-blur-sm text-white font-semibold rounded-md flex items-center gap-1 ${compact ? 'text-[10px] px-1.5 py-0.5' : 'text-xs px-2.5 py-1 gap-1.5'}`}>
                    <Images size={compact ? 10 : 12} /> {album.PhotoCount}
                </div>
            </div>
            <div className={compact ? 'p-2.5 flex flex-col flex-1' : 'p-4 flex flex-col flex-1'}>
                <h3 className={`font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-2 ${compact ? 'text-xs leading-tight mb-1.5' : 'text-sm leading-tight mb-2'}`}>
                    {album.Title}
                </h3>
                <div className={`mt-auto flex items-center justify-between ${compact ? 'pt-1.5' : 'pt-1'}`}>
                    <span className={`text-slate-500 font-medium ${compact ? 'text-[10px]' : 'text-xs'}`}>{formatThaiDate(album.EventDate)}</span>
                    {!compact && (
                        <span
                            className="text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wide"
                            style={{ backgroundColor: `${categoryColor}1A`, color: categoryColor }}
                        >
                            {categoryLabel}
                        </span>
                    )}
                </div>
                {!compact && album.CreatedBy && (
                    <p className="text-[10px] text-slate-400 mt-1.5">โดย {album.CreatedBy}</p>
                )}
            </div>
        </motion.div>
    );
};

export default ActivityAlbumCard;