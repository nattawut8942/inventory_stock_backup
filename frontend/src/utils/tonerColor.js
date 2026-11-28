// สีของหมึกจากชื่อสเปค (Spect) — ใช้ร่วมกันระหว่างหน้า Ink & Toner และหน้า Printer Health
// รูปแบบที่ยอมให้สะกดผิดได้ (เช่น MEGENTA, MAGAENTA ในข้อมูลจริง) และตัวย่อ (C)(M)(Y)(K) ในชื่อรายการ
const TONER_PATTERNS = [
    ['cyan', /CYAN|\(C\)/],
    ['black', /BLACK|\(K\)/],
    ['magenta', /M[A-Z]{1,4}NTA|\(M\)/],
    ['yellow', /YELLOW|\(Y\)/],
];

// ดูสีจากสเปคก่อน ถ้าไม่เจอค่อยดูจากชื่อรายการ
export const getTonerType = (spect, name = '') => {
    const s = (spect || '').toUpperCase();
    for (const [type, re] of TONER_PATTERNS) if (re.test(s)) return type;
    const n = (name || '').toUpperCase();
    for (const [type, re] of TONER_PATTERNS) if (re.test(n)) return type;
    return 'default';
};

export const tonerGradient = (type) => {
    switch (type) {
        case 'cyan': return 'from-cyan-400 to-cyan-600';
        case 'black': return 'from-slate-700 to-slate-900';
        case 'magenta': return 'from-pink-400 to-pink-600';
        case 'yellow': return 'from-yellow-400 to-yellow-500';
        default: return 'from-indigo-500 to-indigo-600';
    }
};

export const tonerIconColor = (type) => (type === 'yellow' ? 'text-yellow-900' : 'text-white');
