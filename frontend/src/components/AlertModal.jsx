import React from 'react';
import { AlertCircle, CheckCircle, HelpCircle, X } from 'lucide-react';
import Portal from './Portal';

const AlertModal = ({ isOpen, type = 'info', title, message, onConfirm, onCancel, confirmText = 'OK', cancelText = 'Cancel' }) => {
    if (!isOpen) return null;

    const config = {
        success: { icon: CheckCircle, color: 'text-emerald-500', bg: 'bg-emerald-100', btn: 'bg-emerald-600 hover:bg-emerald-700' },
        error: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-100', btn: 'bg-red-600 hover:bg-red-700' },
        confirm: { icon: HelpCircle, color: 'text-indigo-500', bg: 'bg-indigo-100', btn: 'bg-indigo-600 hover:bg-indigo-700' },
        info: { icon: AlertCircle, color: 'text-slate-500', bg: 'bg-slate-100', btn: 'bg-slate-800 hover:bg-slate-900' },
        danger: { icon: AlertCircle, color: 'text-red-600', bg: 'bg-red-50', btn: 'bg-red-600 hover:bg-red-700' }
    };

    const { icon: Icon, color, bg, btn } = config[type];

    return (
        <Portal>
            <div className="fixed inset-0 z-[60] overflow-y-auto bg-slate-900/60 backdrop-blur-sm">
                <div className="flex min-h-screen items-center justify-center p-4">
                    <div className="w-full max-w-sm transform overflow-hidden rounded-2xl bg-white p-5 text-center shadow-2xl transition-all animate-in zoom-in-95">
                        <div className={`w-14 h-14 ${bg} rounded-full flex items-center justify-center mx-auto mb-4 ${color}`}>
                            <Icon size={28} />
                        </div>
                        <h3 className="font-black text-lg mb-2 text-slate-800">{title}</h3>
                        <p className="text-slate-500 text-sm mb-5 px-4 leading-relaxed">{message}</p>
                        <div className="flex gap-3">
                            {onCancel && (
                                <button
                                    onClick={onCancel}
                                    className="flex-1 bg-slate-100 text-slate-600 py-2.5 rounded-lg font-bold hover:bg-slate-200 transition-colors"
                                >
                                    {cancelText}
                                </button>
                            )}
                            <button
                                onClick={onConfirm || onCancel}
                                className={`flex-1 text-white py-2.5 rounded-lg font-bold transition-all shadow-md ${btn}`}
                            >
                                {confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </Portal>
    );
};

export default AlertModal;

