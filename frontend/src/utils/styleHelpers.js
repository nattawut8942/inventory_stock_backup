// Use these color mappings across the application for consistency

export const getDeviceTypeColor = (type) => {
    if (!type) return {
        bg: 'bg-slate-50',
        text: 'text-slate-600',
        border: 'border-slate-100',
        gradient: 'from-slate-500 to-slate-600',
        hex: '#64748b'
    };

    switch (type.toLowerCase()) {
        case 'monitor':
        case 'display':
        case 'screen':
            return {
                bg: 'bg-blue-50',
                text: 'text-blue-600',
                border: 'border-blue-100',
                gradient: 'from-blue-500 to-blue-600',
                hex: '#3b82f6'
            };
        case 'pc':
        case 'computer':
        case 'laptop':
        case 'asset':
            return {
                bg: 'bg-amber-50',
                text: 'text-amber-600',
                border: 'border-amber-100',
                gradient: 'from-amber-500 to-amber-600',
                hex: '#f59e0b'
            };
        case 'consumable':
        case 'ink':
        case 'toner':
        case 'paper':
            return {
                bg: 'bg-emerald-50',
                text: 'text-emerald-600',
                border: 'border-emerald-100',
                gradient: 'from-emerald-500 to-emerald-600',
                hex: '#10b981'
            };
        case 'storage':
        case 'hdd':
        case 'ssd':
        case 'usb':
            return {
                bg: 'bg-indigo-50',
                text: 'text-indigo-600',
                border: 'border-indigo-100',
                gradient: 'from-indigo-500 to-indigo-600',
                hex: '#6366f1'
            };
        case 'network':
        case 'wifi':
        case 'router':
        case 'switch':
            return {
                bg: 'bg-purple-50',
                text: 'text-purple-600',
                border: 'border-purple-100',
                gradient: 'from-purple-500 to-purple-600',
                hex: '#8b5cf6'
            };
        case 'peripheral':
        case 'mouse':
        case 'keyboard':
        case 'printer':
            return {
                bg: 'bg-cyan-50',
                text: 'text-cyan-600',
                border: 'border-cyan-100',
                gradient: 'from-cyan-500 to-cyan-600',
                hex: '#06b6d4'
            };
        case 'office supplies':
        case 'office':
        case 'stationery':
            return {
                bg: 'bg-rose-50',
                text: 'text-rose-600',
                border: 'border-rose-100',
                gradient: 'from-rose-500 to-rose-600',
                hex: '#f43f5e'
            };
        default:
            return {
                bg: 'bg-slate-50',
                text: 'text-slate-600',
                border: 'border-slate-100',
                gradient: 'from-slate-500 to-slate-600',
                hex: '#64748b'
            };
    }
};

export const getBadgeStyle = (type) => {
    const { bg, text, border } = getDeviceTypeColor(type);
    return `${bg} ${text} ${border}`;
};

export const getColorGradient = (type) => {
    const { gradient } = getDeviceTypeColor(type);
    return gradient;
};

// For Recharts or other chart libraries
export const getChartColor = (type) => {
    const { hex } = getDeviceTypeColor(type);
    return hex;
};