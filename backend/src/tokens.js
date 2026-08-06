import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'insecure-dev-secret-change-me';
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 ชั่วโมง
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 วัน

export function signAccessToken(user) {
    return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, {
        expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    });
}

export function verifyAccessToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch {
        return null;
    }
}

export function generateRefreshToken() {
    return crypto.randomBytes(32).toString('hex');
}

export function refreshTokenExpiry() {
    return Date.now() + REFRESH_TOKEN_TTL_MS;
}

export const ACCESS_TOKEN_TTL = ACCESS_TOKEN_TTL_SECONDS;

export function getBearerToken(req) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return null;
    return token;
}
