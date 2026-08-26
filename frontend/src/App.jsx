import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { QuotaJobProvider } from './context/QuotaJobContext';

// Components
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

// Pages
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import InventoryPage from './pages/InventoryPage';
import ManualImportPage from './pages/ManualImportPage';
import ReceivePage from './pages/ReceivePage';
import HistoryPage from './pages/HistoryPage';
import PurchaseOrdersPage from './pages/PurchaseOrdersPage';
import ReportPage from './pages/ReportPage';
import ManagementPage from './pages/ManagementPage';
import MALicensePage from './pages/MALicensePage';
import InkTonerStockPage from './pages/InkTonerStockPage';
import PCInventoryPage from './pages/PCInventoryPage';
import ADExplorer from './pages/ADExplorer';
import ADUserDetail from './pages/ADUserDetail';
import QuotaManager from './pages/QuotaManager';
import CCTVPage from './pages/CCTVPage';
import CalendarPage from './pages/CalendarPage';
import IPManagementPage from './pages/IPManagementPage';
import ITRequestPage from './pages/ITRequestPage';
import SoundLayout from './pages/SoundLayout';
import ITBorrowSystem from './pages/ITBorrowSystem';
import KBPage from './pages/KBPage';
import ActivityPage from './pages/ActivityPage'; 
import PrinterHealthPage from './pages/PrinterHealthPage';

// App Routes Component
const AppRoutes = () => {
    const { isAuthenticated } = useAuth();

    return (
        <Routes>
            {/* Public Routes */}
            <Route
                path="/login"
                element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />}
            />

            {/* Protected Routes */}
            <Route
                path="/"
                element={
                    <ProtectedRoute>
                        <Layout />
                    </ProtectedRoute>
                }
            >
                <Route index element={<Navigate to="/activity" replace />} />
<Route path="dashboard" element={<DashboardPage />} />
<Route path="activity" element={<ActivityPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="ink-toner" element={<InkTonerStockPage />} />
                <Route path="/printer-health" element={<PrinterHealthPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="reports" element={<ReportPage />} />
                <Route path="ma-license" element={<MALicensePage />} />
                <Route path="pc-inventory" element={<PCInventoryPage />} />
                <Route path="ad-explorer" element={<ADExplorer />} />
                <Route path="ad-explorer/user/:username" element={<ADUserDetail />} />
                <Route path="quota-manager" element={<QuotaManager />} />
                <Route path="cctv-management" element={<CCTVPage />} />
                <Route path="calendar" element={<CalendarPage />} />
                <Route path="ip-management" element={<IPManagementPage />} />
                <Route path="it-request" element={<ITRequestPage />} />
                <Route path="sound-layout" element={<SoundLayout />} />
                <Route path="/knowledge-base" element={<KBPage />} />
                <Route path="activity" element={<ActivityPage />} />
                {/* ✅ ระบบยืม-คืน IT — ครอบด้วย Layout (Sidebar+Header) เหมือนหน้าอื่นในกลุ่มนี้ทุกอัน */}
                <Route path="borrowings" element={<ITBorrowSystem />} />


                {/* PO and Receive */}
                <Route path="purchase-orders" element={<PurchaseOrdersPage />} />
                <Route path="receive" element={<ReceivePage />} />

                <Route
                    path="manual-import"
                    element={
                        <ProtectedRoute staffOnly>
                            <ManualImportPage />
                        </ProtectedRoute>
                    }
                />
                <Route
                    path="management"
                    element={
                        <ProtectedRoute staffOnly>
                            <ManagementPage />
                        </ProtectedRoute>
                    }
                />
            </Route>

            {/* Catch all */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

const App = () => {
    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthProvider>
                <DataProvider>
                    <QuotaJobProvider>
                        <AppRoutes />
                    </QuotaJobProvider>
                </DataProvider>
            </AuthProvider>
        </BrowserRouter>
    );
};

export default App;