import React from 'react';
import { Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import Portal from './Portal';

const LoadingState = ({ message = 'กำลังโหลดข้อมูล...', fullscreen = false }) => {
    if (fullscreen) {
        return (
            <Portal>
                <div className="fixed inset-0 z-[100] bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                    <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                        className="mb-4"
                    >
                        <Loader2 size={48} className="text-indigo-600" />
                    </motion.div>
                    <p className="text-slate-600 font-bold animate-pulse">{message}</p>
                </div>
            </Portal>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center py-20 w-full h-full min-h-[300px]">
            <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="mb-3"
            >
                <Loader2 size={32} className="text-indigo-500" />
            </motion.div>
            <p className="text-sm text-slate-400 font-medium">{message}</p>
        </div>
    );
};

export const InlineLoading = () => (
    <div className="flex items-center gap-2 text-slate-400 text-sm py-2">
        <Loader2 size={16} className="animate-spin" />
        <span>Loading...</span>
    </div>
);

export default LoadingState;
