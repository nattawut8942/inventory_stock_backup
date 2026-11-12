import jwt from 'jsonwebtoken';
import { getJwtSecret } from '../config/jwtSecret.js';

export const verifyToken = (req, res, next) => {
    const token = req.headers['authorization'];

    if (!token) {
        return res.status(403).json({ item: { message: 'No token provided' } }); // Match generic error structure
    }

    try {
        // Prepare to handle "Bearer " prefix if present
        const tokenString = token.startsWith('Bearer ') ? token.slice(7, token.length) : token;

        const decoded = jwt.verify(tokenString, getJwtSecret());
        req.user = decoded;
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Unauthorized: Invalid token' });
    }
};

export const requireRole = (role) => {
    return (req, res, next) => {
        if (!req.user || (req.user.role !== role && req.user.role !== 'Admin')) {
            return res.status(403).json({ message: 'Forbidden: Insufficient rights' });
        }
        next();
    };
};

// Shorthand for write endpoints that only Admin may call: router.put('/x', ...adminOnly, handler)
export const adminOnly = [verifyToken, requireRole('Admin')];
