import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, User, Lock, Eye, EyeOff, Loader2, Keyboard, ShieldCheck, Package, Monitor, Printer } from 'lucide-react';
import { useAuth, EXPIRED_FLAG } from '../context/AuthContext';
import logodaikin from '../../public/DAIKIN_logo.svg.png';
import logostock from '../../public/logostock_nobg.png';
import { API_BASE } from '../config/api';

const REMEMBER_KEY = 'login_remember_username';

const readRemembered = () => {
    try {
        return localStorage.getItem(REMEMBER_KEY) || '';
    } catch {
        return '';
    }
};

const HIGHLIGHTS = [
    { icon: Package, title: 'Stock & Ink/Toner', desc: 'ติดตามคงคลัง เบิก-จ่าย และ PR/PO ในที่เดียว' },
    { icon: Monitor, title: 'Asset Management', desc: 'ทะเบียน PC, อุปกรณ์เครือข่าย, CCTV และ IP' },
    { icon: Printer, title: 'Printer Health', desc: 'เฝ้าดูสถานะเครื่องพิมพ์และการใช้งานหมึก' },
    { icon: ShieldCheck, title: 'MA / License ', desc: 'ติดตามสถานะ MA และ License' },
];

const LoginPage = () => {
    const [loading, setLoading] = useState(false);
    // ถ้าออกจากระบบเพราะเซสชันหมดอายุ ให้แจ้งเตือนครั้งเดียว
    const [error, setError] = useState(() => {
        try {
            if (sessionStorage.getItem(EXPIRED_FLAG)) {
                sessionStorage.removeItem(EXPIRED_FLAG);
                return 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่';
            }
        } catch { /* storage ไม่พร้อม */ }
        return '';
    });
    const [errorKey, setErrorKey] = useState(0); // เปลี่ยนค่าเพื่อให้ animation สั่นเล่นซ้ำ
    const [showPassword, setShowPassword] = useState(false);
    const [capsLock, setCapsLock] = useState(false);
    const [remember, setRemember] = useState(() => !!readRemembered());
    const [username, setUsername] = useState(() => readRemembered());
    const [mounted, setMounted] = useState(false);
    const { login } = useAuth();
    const navigate = useNavigate();

    useEffect(() => {
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    const showError = (msg) => {
        setError(msg);
        setErrorKey((k) => k + 1);
    };

    const handleKey = (e) => {
        if (typeof e.getModifierState === 'function') {
            setCapsLock(e.getModifierState('CapsLock'));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        const formData = new FormData(e.target);
        const payload = Object.fromEntries(formData);
        payload.username = String(payload.username || '').trim();

        try {
            const res = await fetch(`${API_BASE}/authen`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await res.json();

            if (data.success && data.token) {
                try {
                    if (remember) localStorage.setItem(REMEMBER_KEY, payload.username);
                    else localStorage.removeItem(REMEMBER_KEY);
                } catch { /* storage ไม่พร้อม */ }
                // user และ JWT เก็บผ่าน AuthContext ที่เดียว
                login(data.user, data.token);
                navigate('/');
            } else {
                showError(data.message || 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง');
            }
        } catch (err) {
            showError('ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาลองใหม่อีกครั้ง');
        } finally {
            setLoading(false);
        }
    };

    const inputBase =
        'peer w-full bg-white/70 border border-slate-200 rounded-xl py-3.5 pl-11 pr-4 outline-none text-sm text-slate-900 placeholder:text-slate-400 transition-all duration-200 focus:bg-white focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 disabled:opacity-60';

    return (
        <div className="login-root relative min-h-screen flex items-center justify-center bg-slate-50 font-sans text-slate-800 overflow-hidden p-4 sm:p-8">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-100/70 via-slate-50 to-sky-100/70" aria-hidden="true"></div>
            <div className="absolute inset-0 bg-[radial-gradient(#c7d2fe_1px,transparent_1px)] [background-size:22px_22px] opacity-40" aria-hidden="true"></div>

            <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-[1fr_1fr] rounded-3xl overflow-hidden lg:bg-white lg:border lg:border-white/70 lg:shadow-2xl lg:shadow-indigo-200/50">

            <style>{`
                @keyframes login-blob {
                    0%, 100% { transform: translate(0, 0) scale(1); }
                    33% { transform: translate(40px, -30px) scale(1.08); }
                    66% { transform: translate(-30px, 20px) scale(0.95); }
                }
                @keyframes login-card-in {
                    from { opacity: 0; transform: translateY(16px) scale(0.98); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                @keyframes login-shake {
                    0%, 100% { transform: translateX(0); }
                    20% { transform: translateX(-8px); }
                    40% { transform: translateX(8px); }
                    60% { transform: translateX(-5px); }
                    80% { transform: translateX(5px); }
                }
                @keyframes login-shimmer {
                    from { transform: translateX(-100%); }
                    to { transform: translateX(100%); }
                }
                @keyframes login-float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                .login-blob { animation: login-blob 18s ease-in-out infinite; }
                .login-card-in { animation: login-card-in .6s cubic-bezier(.2,.8,.2,1) both; }
                .login-shake { animation: login-shake .45s ease-in-out; }
                .login-float { animation: login-float 6s ease-in-out infinite; }
                .login-shimmer::after {
                    content: '';
                    position: absolute;
                    inset: 0;
                    background: linear-gradient(90deg, transparent, rgba(255,255,255,.35), transparent);
                    animation: login-shimmer 1.2s linear infinite;
                }
                @media (prefers-reduced-motion: reduce) {
                    .login-blob, .login-card-in, .login-shake, .login-float, .login-shimmer::after { animation: none !important; }
                }
            `}</style>

            {/* ===== Brand panel (desktop only) ===== */}
            <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 text-white p-8 xl:p-9">
                <div className="login-blob absolute -top-32 -left-24 w-[30rem] h-[30rem] bg-white/10 rounded-full blur-3xl" aria-hidden="true"></div>
                <div className="login-blob absolute -bottom-40 -right-20 w-[28rem] h-[28rem] bg-sky-400/20 rounded-full blur-3xl [animation-delay:-7s]" aria-hidden="true"></div>
                <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,.12)_1px,transparent_1px)] [background-size:20px_20px]" aria-hidden="true"></div>

                <div className="relative">
                    <div className="inline-flex items-center rounded-2xl bg-white px-4 py-2.5 shadow-lg shadow-indigo-900/20">
                        <img src={logodaikin} alt="DAIKIN Logo" className="h-10  object-contain" />
                    </div>
                </div>

                <div className="relative max-w-lg">
                    <p className="mt-5 text-[10px] font-semibold tracking-[0.25em] text-indigo-200 uppercase">IT Operations Platform</p>
                    <h2 className="mt-2.5 text-2xl xl:text-2xl font-extrabold tracking-tight leading-snug">
                        บริหารทรัพย์สินไอที ให้อยู่ในมือคุณ
                    </h2>
                    <p className="mt-3 text-indigo-100/90 text-xs leading-relaxed">
                        ศูนย์กลางข้อมูลสต็อก อุปกรณ์ และสิทธิ์การใช้งาน สำหรับทีม IT
                    </p>

                    <ul className="mt-6 grid grid-cols-1 gap-2">
                        {HIGHLIGHTS.map(({ icon: Icon, title, desc }, i) => (
                            <li
                                key={title}
                                className="login-float flex items-center gap-3 rounded-xl border border-white/15 bg-white/10 backdrop-blur-md p-2.5 hover:bg-white/15 transition-colors"
                                style={{ animationDelay: `${i * -1.5}s` }}
                            >
                                <span className="shrink-0 grid place-items-center h-8 w-8 rounded-lg bg-white/15 text-white">
                                    <Icon size={16} />
                                </span>
                                <span className="min-w-0">
                                    <span className="block text-xs font-bold">{title}</span>
                                    <span className="block text-[11px] text-indigo-100/80 mt-0.5 leading-snug">{desc}</span>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <p className="relative mt-8 pt-4 border-t border-white/15 text-[11px] text-indigo-200/80 tracking-wide">
                    © 2026 BY: NATTHAWUT.Y <span className="font-bold text-white">ALL RIGHTS RESERVED.</span>
                </p>
            </aside>

            {/* ===== Form panel ===== */}
            <main className="relative flex items-center justify-center p-4 sm:p-8 lg:p-10 py-10 overflow-hidden">
                {/* Background for mobile / form side */}
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 via-white to-sky-50" aria-hidden="true"></div>
                <div className="absolute inset-0 bg-[radial-gradient(#c7d2fe_1px,transparent_1px)] [background-size:22px_22px] opacity-40" aria-hidden="true"></div>
                <div className="login-blob absolute -top-24 -left-20 w-[24rem] h-[24rem] bg-indigo-300/30 rounded-full blur-3xl lg:hidden" aria-hidden="true"></div>
                <div className="login-blob absolute -bottom-32 -right-20 w-[26rem] h-[26rem] bg-sky-300/30 rounded-full blur-3xl [animation-delay:-6s] lg:hidden" aria-hidden="true"></div>

                <div
                    className={`relative z-10 w-full max-w-md p-8 sm:p-10 bg-white/80 backdrop-blur-xl border border-white/70 rounded-3xl shadow-2xl shadow-indigo-200/40 lg:max-w-sm lg:bg-transparent lg:backdrop-blur-none lg:border-0 lg:shadow-none lg:rounded-none lg:p-6 ${mounted ? 'login-card-in' : 'opacity-0'}`}
                >
                    <div className="text-center mb-8">
                        {/* โลโก้แสดงบนมือถือ/แท็บเล็ต (desktop มีอยู่ที่แผงซ้ายแล้ว) */}
                        <img
                            src={logodaikin}
                            alt="DAIKIN Logo"
                            className="h-12 mx-auto mb-5 object-contain lg:hidden"
                        />
                        <img
                            src={logostock}
                            alt="Stock Logo"
                            className="h-32 sm:h-26 mx-auto mb-5 object-contain"
                        />
                        <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 leading-none">IT INVENTORY</h1>
                        <p className="mt-2 text-sm font-semibold tracking-[0.25em] text-indigo-600 uppercase">Management System</p>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-5">
                        {/* Username Field */}
                        <div className="space-y-1.5">
                            <label htmlFor="login-username" className="text-xs font-semibold text-slate-600 block pl-1">
                                ชื่อผู้ใช้
                            </label>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 peer-focus:text-indigo-600 transition-colors">
                                    <User size={18} />
                                </span>
                                <input
                                    id="login-username"
                                    name="username"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    placeholder="Username"
                                    autoComplete="username"
                                    autoFocus={!username}
                                    disabled={loading}
                                    className={inputBase}
                                    required
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between pl-1 pr-1">
                                <label htmlFor="login-password" className="text-xs font-semibold text-slate-600 block">
                                    รหัสผ่าน
                                </label>
                                {capsLock && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-600" role="status">
                                        <Keyboard size={12} /> Caps Lock เปิดอยู่
                                    </span>
                                )}
                            </div>
                            <div className="relative">
                                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-slate-400 peer-focus:text-indigo-600 transition-colors">
                                    <Lock size={18} />
                                </span>
                                <input
                                    id="login-password"
                                    name="password"
                                    type={showPassword ? 'text' : 'password'}
                                    placeholder="••••••••"
                                    autoComplete="current-password"
                                    onKeyDown={handleKey}
                                    onKeyUp={handleKey}
                                    onBlur={() => setCapsLock(false)}
                                    disabled={loading}
                                    className={`${inputBase} pr-11`}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'}
                                    aria-pressed={showPassword}
                                    className="absolute inset-y-0 right-0 flex items-center pr-3.5 text-slate-400 hover:text-indigo-600 transition-colors rounded-r-xl focus:outline-none focus-visible:text-indigo-600"
                                >
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>

                        <label className="flex items-center gap-2 pl-1 text-xs text-slate-600 cursor-pointer select-none w-fit">
                            <input
                                type="checkbox"
                                checked={remember}
                                onChange={(e) => setRemember(e.target.checked)}
                                disabled={loading}
                                className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                            />
                            จดจำชื่อผู้ใช้ไว้ในเครื่องนี้
                        </label>

                        {error && (
                            <div
                                key={errorKey}
                                role="alert"
                                className="login-shake p-3 bg-red-50 border border-red-200 rounded-xl text-red-600 text-xs font-medium flex items-start gap-2"
                            >
                                <AlertTriangle size={14} className="text-red-500 shrink-0 mt-px" /> <span>{error}</span>
                            </div>
                        )}

                        {/* Submit Button with Loading State */}
                        <button
                            type="submit"
                            disabled={loading}
                            aria-busy={loading}
                            className="relative w-full overflow-hidden bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white font-bold py-3.5 rounded-xl shadow-lg shadow-indigo-300/50 transition-all duration-200 hover:shadow-xl hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] disabled:opacity-70 disabled:hover:translate-y-0 text-sm tracking-wide flex items-center justify-center gap-2 mt-2 focus:outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 login-shimmer"
                        >
                            {loading ? (
                                <>
                                    <Loader2 size={16} className="animate-spin" />
                                    <span>กำลังตรวจสอบ...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck size={16} />
                                    <span>เข้าสู่ระบบ</span>
                                </>
                            )}
                        </button>
                    </form>

                    <p className="mt-8 text-center text-[11px] text-slate-400 tracking-wide lg:hidden">
                        © 2026 BY: NATTHAWUT.Y <span className="font-bold text-indigo-600">ALL RIGHTS RESERVED.</span>
                    </p>
                </div>
            </main>
            </div>
        </div>
    );
};

export default LoginPage;
