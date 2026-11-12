import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    // Initialize from localStorage
    const [user, setUser] = useState(() => {
        try {
            const saved = localStorage.getItem('it_stock_user');
            if (saved === "undefined" || saved === "null") return null;
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.error("AuthContext: Failed to parse user data", e);
            localStorage.removeItem('it_stock_user');
            return null;
        }
    });

    const login = (userData) => {
        setUser(userData);
        localStorage.setItem('it_stock_user', JSON.stringify(userData));
    };

    const logout = () => {
        setUser(null);
        localStorage.removeItem('it_stock_user');
        localStorage.removeItem('it_stock_token');
    };

    return (
        <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};
