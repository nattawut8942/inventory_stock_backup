/**
 * เหมือน formatThaiDate แต่ใช้ปี ค.ศ. (ปฏิทิน gregory) — ใช้เฉพาะหน้า Activity
 */
export const formatThaiDateCE = (date) => {
    if (!date) return '-';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        return new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Bangkok'
        }).format(d);
    } catch (e) {
        console.error('Error formatting date:', e);
        return '-';
    }
};

/**
 * เหมือน formatThaiDateShort แต่ใช้ปี ค.ศ. (ปฏิทิน gregory) — ใช้เฉพาะหน้า Activity
 */
export const formatThaiDateShortCE = (date) => {
    if (!date) return '-';
    try {
        const d = new Date(date);
        if (isNaN(d.getTime())) return '-';
        return new Intl.DateTimeFormat('th-TH-u-ca-gregory', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Bangkok'
        }).format(d);
    } catch (e) {
        console.error('Error formatting date:', e);
        return '-';
    }
};

/**
 * Format a date string or object into a standard Thai date format (dd/mm/yyyy hh:mm)
 * Forces timezone to Asia/Bangkok (GMT+7)
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string or '-' if invalid
 */
export const formatThaiDate = (date) => {
    if (!date) return '-';

    try {
        const d = new Date(date);

        // Check if date is valid
        if (isNaN(d.getTime())) return '-';

        return new Intl.DateTimeFormat('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: 'Asia/Bangkok' // Force Thai Time
        }).format(d);
    } catch (e) {
        console.error('Error formatting date:', e);
        return '-';
    }
};

/**
 * Format a date string or object into a short Thai date format (dd/mm/yyyy)
 * Forces timezone to Asia/Bangkok (GMT+7)
 * @param {string|Date} date - The date to format
 * @returns {string} Formatted date string or '-' if invalid
 */
export const formatThaiDateShort = (date) => {
    if (!date) return '-';

    try {
        const d = new Date(date);

        // Check if date is valid
        if (isNaN(d.getTime())) return '-';

        return new Intl.DateTimeFormat('th-TH', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            timeZone: 'Asia/Bangkok' // Force Thai Time
        }).format(d);
    } catch (e) {
        console.error('Error formatting date:', e);
        return '-';
    }
};
