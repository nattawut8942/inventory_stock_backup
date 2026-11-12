import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext(null);

// แหล่งข้อมูล session เดียว: user + JWT เก็บคู่กันใน key นี้
const SESSION_KEY = 'it_stock_session';
// key เดิมจากก่อนรวม session — ลบทิ้งเพื่อไม่ให้มี user ค้างโดยไม่มี token
const LEGACY_USER_KEY = 'it_stock_user';
const LEGACY_TOKEN_KEY = 'it_stock_token';

const readSession = () => {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        const session = raw ? JSON.parse(raw) : null;
        // ต้องมีทั้ง user และ token ถึงจะถือว่า login อยู่
        if (session && session.user && session.token) return session;
    } catch (e) {
        console.error('AuthContext: Failed to parse session', e);
    }
    return null;
};

const clearStoredSession = () => {
    try {
        localStorage.removeItem(SESSION_KEY);
        localStorage.removeItem(LEGACY_USER_KEY);
        localStorage.removeItem(LEGACY_TOKEN_KEY);
    } catch { /* storage ไม่พร้อม */ }
};

// ใช้ได้ทั้งใน component และฟังก์ชัน module-level (เช่น authHeaders)
export const getAuthToken = () => {
    try {
        return readSession()?.token || null;
    } catch {
        return null;
    }
};

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(() => {
        const s = readSession();
        // session เก่าที่ไม่มี token (login ก่อนมีระบบ JWT) ต้องให้ login ใหม่
        if (!s) clearStoredSession();
        return s;
    });

    const login = (userData, token) => {
        const next = { user: userData, token };
        setSession(next);
        try {
            localStorage.setItem(SESSION_KEY, JSON.stringify(next));
            localStorage.removeItem(LEGACY_USER_KEY);
            localStorage.removeItem(LEGACY_TOKEN_KEY);
        } catch { /* private mode */ }
    };

    const logout = () => {
        setSession(null);
        clearStoredSession();
    };

    const user = session?.user ?? null;

    return (
        <AuthContext.Provider value={{ user, token: session?.token ?? null, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};
