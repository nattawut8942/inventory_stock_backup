import React, { useEffect } from 'react';
import { motion } from 'motion/react';
import { X } from 'lucide-react';
import Portal from '../Portal';

/**
 * BaseModal - กรอบ modal ร่วม (backdrop + dialog + ปิดด้วย Esc)
 * ให้ parent render ภายใน <AnimatePresence> เพื่อให้มี animation ตอนปิด
 */
const BaseModal = ({ onClose, label, maxWidth = 'max-w-2xl', closeOnEscape = true, children }) => {
    useEffect(() => {
        if (!closeOnEscape) return;
        const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [closeOnEscape, onClose]);

    return (
        <Portal>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4"
                onClick={() => onClose?.()}
            >
                <motion.div
                    role="dialog"
                    aria-modal="true"
                    aria-label={label}
                    initial={{ opacity: 0, scale: 0.95, y: 15 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95, y: 15 }}
                    className={`w-full ${maxWidth} bg-white rounded-2xl shadow-2xl overflow-hidden`}
                    onClick={(e) => e.stopPropagation()}
                >
                    {children}
                </motion.div>
            </motion.div>
        </Portal>
    );
};

/** ส่วนหัว modal แบบ gradient ที่ใช้ร่วมกัน */
export const ModalHeader = ({ icon: Icon, eyebrow, title, subtitle, onClose, disabled = false, titleClass = '', children }) => (
    <div className="p-4 bg-gradient-to-r from-violet-600 to-indigo-600 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-10 -mt-10 blur-2xl"></div>
        <div className="flex justify-between items-start relative z-10 gap-3">
            <div className="min-w-0">
                {eyebrow && (
                    <div className="flex items-center gap-2 mb-1 opacity-90">
                        {Icon && <Icon size={16} />}
                        <span className="text-xs font-bold uppercase tracking-wider">{eyebrow}</span>
                    </div>
                )}
                <h3 className={`font-black text-lg md:text-xl tracking-tight break-all ${titleClass}`}>{title}</h3>
                {subtitle && <p className="text-indigo-100 text-xs font-medium mt-1">{subtitle}</p>}
                {children}
            </div>
            <button
                type="button"
                onClick={() => onClose?.()}
                disabled={disabled}
                className="p-2 hover:bg-white/10 rounded-full transition-colors shrink-0 disabled:opacity-40"
                aria-label="ปิด"
            >
                <X size={18} />
            </button>
        </div>
    </div>
);

export default BaseModal;
