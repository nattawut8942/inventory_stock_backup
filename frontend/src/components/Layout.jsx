import React, { useState, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // sync collapsed state เพื่อ adjust main content margin
    const [collapsed, setCollapsed] = useState(() => {
        try { return localStorage.getItem('sidebar_collapsed') === 'true'; } catch { return false; }
    });

    // listen localStorage change จาก Sidebar
    useEffect(() => {
        const handler = () => {
            try { setCollapsed(localStorage.getItem('sidebar_collapsed') === 'true'); } catch {}
        };
        window.addEventListener('storage', handler);
        // poll เพราะ same-tab localStorage ไม่ fire storage event
        const interval = setInterval(handler, 100);
        return () => { window.removeEventListener('storage', handler); clearInterval(interval); };
    }, []);

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            {/* main — transition width เมื่อ sidebar หุบ/ขยาย */}
            <main className="flex-1 flex flex-col h-full relative min-w-0 transition-all duration-300">
                <Header onMenuClick={() => setIsSidebarOpen(true)}/>

                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
                    {/* Background ambient */}
                    <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none -z-10"/>

                    {/* ✅ ขยายจาก max-w-[95%] เป็น max-w-full เต็มพื้นที่ที่มี เผื่อหน้าที่มีตารางหลาย column (เช่น ระบบยืม-คืน IT) ไม่ต้องบีบ/scroll เยอะเกินจำเป็น */}
                    <div className="max-w-full mx-auto w-full">
                        <Outlet/>
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Layout;