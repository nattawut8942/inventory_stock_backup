import React, { createContext, useContext, useEffect, useState } from 'react';

const AuthContext = createContext(null);

// ธงบอกหน้า login ว่าเซสชันหมดอายุ (ใช้ sessionStorage เพราะเป็นข้อความครั้งเดียว)
export const EXPIRED_FLAG = 'it_stock_session_expired';
const UNAUTHORIZED_EVENT = 'it-stock-unauthorized';

// อ่าน exp จาก JWT (ไม่ตรวจลายเซ็น — server ตรวจเองทุก request) ถ้าอ่านไม่ได้ให้ถือว่ายังไม่หมดอายุ
const tokenExpired = (token) => {
    try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
        return typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now();
    } catch {
        return false;
    }
};

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
        if (session && session.user && session.token && !tokenExpired(session.token)) return session;
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

// ดักทุก fetch ไปยัง API ของระบบ: ถ้าได้ 401 จาก request ที่แนบ token อยู่ = token หมดอายุหรือใช้ไม่ได้
// ให้แจ้ง AuthProvider ให้ออกจากระบบ (ทุกหน้าเรียก fetch ตรงอยู่แล้ว จึงดักที่จุดเดียว)
// /authen ถูกยกเว้น เพราะ 401 ที่นั่นหมายถึงรหัสผ่านผิด
if (typeof window !== 'undefined' && !window.__itStockFetchPatched) {
    window.__itStockFetchPatched = true;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
        const res = await originalFetch(input, init);
        try {
            const url = typeof input === 'string' ? input : (input?.url || '');
            if (res.status === 401 && url.includes('/ITinventory/api/') && !url.includes('/authen')) {
                const headers = new Headers(init?.headers || (input && input.headers) || {});
                if (headers.get('Authorization')) window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
            }
        } catch { /* ไม่ให้การดักทำให้ request พัง */ }
        return res;
    };
}

export const AuthProvider = ({ children }) => {
    const [session, setSession] = useState(() => {
        const s = readSession();
        // session เก่าที่ไม่มี token (login ก่อนมีระบบ JWT) หรือ token หมดอายุ ต้องให้ login ใหม่
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

    // เมื่อ API ตอบ 401 ให้ออกจากระบบ พร้อมตั้งธงให้หน้า login แสดงข้อความ
    useEffect(() => {
        const onUnauthorized = () => {
            try { sessionStorage.setItem(EXPIRED_FLAG, '1'); } catch { /* storage ไม่พร้อม */ }
            setSession(null);
            clearStoredSession();
        };
        window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
        return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    }, []);

    const user = session?.user ?? null;

    return (
        <AuthContext.Provider value={{ user, token: session?.token ?? null, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};
