import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

// โหมดที่ผู้ใช้เลือกได้: 'light' | 'dark' | 'system' (ตามการตั้งค่าของเครื่อง)
const THEME_KEY = 'it_stock_theme';
const MODES = ['light', 'dark', 'system'];

const ThemeContext = createContext(null);

const readStoredMode = () => {
    try {
        const v = localStorage.getItem(THEME_KEY);
        return MODES.includes(v) ? v : 'system';
    } catch {
        return 'system';
    }
};

const systemPrefersDark = () => {
    try {
        return window.matchMedia('(prefers-color-scheme: dark)').matches;
    } catch {
        return false;
    }
};

// ใส่/เอา class "dark" ที่ <html> — Tailwind (darkMode: 'class') และ index.css ใช้ค่านี้
const applyTheme = (resolved) => {
    const root = document.documentElement;
    root.classList.toggle('dark', resolved === 'dark');
    root.style.colorScheme = resolved;
};

export const ThemeProvider = ({ children }) => {
    const [mode, setMode] = useState(readStoredMode);
    const [systemDark, setSystemDark] = useState(systemPrefersDark);

    // ติดตามการเปลี่ยนธีมของ OS เมื่ออยู่ในโหมด system
    useEffect(() => {
        let mql;
        try {
            mql = window.matchMedia('(prefers-color-scheme: dark)');
        } catch {
            return undefined;
        }
        const onChange = (e) => setSystemDark(e.matches);
        mql.addEventListener?.('change', onChange);
        return () => mql.removeEventListener?.('change', onChange);
    }, []);

    const resolved = mode === 'system' ? (systemDark ? 'dark' : 'light') : mode;

    useEffect(() => {
        applyTheme(resolved);
    }, [resolved]);

    const setTheme = useCallback((next) => {
        if (!MODES.includes(next)) return;
        setMode(next);
        try { localStorage.setItem(THEME_KEY, next); } catch { }
    }, []);

    // สลับระหว่าง light <-> dark (ตามที่เห็นอยู่ตอนนี้)
    const toggleTheme = useCallback(() => {
        setTheme(resolved === 'dark' ? 'light' : 'dark');
    }, [resolved, setTheme]);

    const value = useMemo(
        () => ({ mode, resolved, isDark: resolved === 'dark', setTheme, toggleTheme }),
        [mode, resolved, setTheme, toggleTheme],
    );

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
    const ctx = useContext(ThemeContext);
    if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
    return ctx;
};
