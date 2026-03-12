import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const Layout = () => {
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    return (
        <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
            {/* Sidebar (Responsive) */}
            <Sidebar
                isOpen={isSidebarOpen}
                onClose={() => setIsSidebarOpen(false)}
            />

            <main className="flex-1 flex flex-col h-full relative min-w-0">
                {/* Global Header (Sticky) */}
                <Header onMenuClick={() => setIsSidebarOpen(true)} />

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 relative">
                    {/* Background ambient light */}
                    <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-500/10 to-transparent pointer-events-none -z-10"></div>

                    {/* Max width container */}
                    <div className="max-w-7xl mx-auto w-full">
                        <Outlet />
                    </div>
                </div>
            </main>
        </div>
    );
};

export default Layout;
