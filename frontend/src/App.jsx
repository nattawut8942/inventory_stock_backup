import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';


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
import BitLockerPage from './pages/BitLockerPage';

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
                <Route index element={<DashboardPage />} />
                <Route path="inventory" element={<InventoryPage />} />
                <Route path="ink-toner" element={<InkTonerStockPage />} />
                <Route path="history" element={<HistoryPage />} />
                <Route path="reports" element={<ReportPage />} />
                <Route path="ma-license" element={<MALicensePage />} />
                <Route path="bitlocker" element={<BitLockerPage />} />

                {/* PO and Receive - viewable by all, actions restricted in components */}
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

            {/* Catch all - redirect to home */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
};

const App = () => {
    return (
        <BrowserRouter basename={import.meta.env.BASE_URL}>
            <AuthProvider>
                <DataProvider>
                    <AppRoutes />
                </DataProvider>
            </AuthProvider>
        </BrowserRouter>
    );
};

export default App;
