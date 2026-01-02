/**
 * JWT Authentication Module for DocuIntel
 * 
 * Provides secure token-based authentication for API endpoints.
 * Supports token generation, validation, and refresh mechanisms.
 * 
 * @module lib/auth
 */

import { NextRequest, NextResponse } from 'next/server';

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || 'docuintel-default-secret-change-in-production';
const TOKEN_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * User payload structure for JWT tokens
 */
export interface UserPayload {
    userId: string;
    email: string;
    role: 'user' | 'admin' | 'viewer';
    permissions: string[];
}

/**
 * Token pair returned after authentication
 */
export interface TokenPair {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
}

/**
 * Authentication result structure
 */
export interface AuthResult {
    success: boolean;
    user?: UserPayload;
    error?: string;
}

/**
 * Simple Base64 encoding/decoding utilities for JWT-like tokens
 * Note: In production, use proper JWT library like 'jose' or 'jsonwebtoken'
 */
const base64Encode = (data: string): string => {
    return Buffer.from(data).toString('base64url');
};

const base64Decode = (encoded: string): string => {
    return Buffer.from(encoded, 'base64url').toString('utf-8');
};

/**
 * Creates a simple HMAC-like signature using the secret
 * Note: In production, use proper cryptographic signing
 */
const createSignature = (payload: string): string => {
    const crypto = require('crypto');
    return crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('base64url');
};

/**
 * Generates an access token for authenticated users
 * 
 * @param user - User payload to encode in the token
 * @returns Access token string
 * 
 * @example
 * ```typescript
 * const token = generateAccessToken({
 *   userId: 'user123',
 *   email: 'user@example.com',
 *   role: 'user',
 *   permissions: ['read', 'write']
 * });
 * ```
 */
export function generateAccessToken(user: UserPayload): string {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = {
        ...user,
        iat: Date.now(),
        exp: Date.now() + TOKEN_EXPIRY,
        type: 'access'
    };

    const headerBase64 = base64Encode(JSON.stringify(header));
    const payloadBase64 = base64Encode(JSON.stringify(payload));
    const signature = createSignature(`${headerBase64}.${payloadBase64}`);

    return `${headerBase64}.${payloadBase64}.${signature}`;
}

/**
 * Generates a refresh token for token renewal
 * 
 * @param userId - User ID to associate with refresh token
 * @returns Refresh token string
 */
export function generateRefreshToken(userId: string): string {
    const payload = {
        userId,
        iat: Date.now(),
        exp: Date.now() + REFRESH_TOKEN_EXPIRY,
        type: 'refresh'
    };

    const payloadBase64 = base64Encode(JSON.stringify(payload));
    const signature = createSignature(payloadBase64);

    return `${payloadBase64}.${signature}`;
}

/**
 * Generates both access and refresh tokens
 * 
 * @param user - User payload for token generation
 * @returns TokenPair with both tokens
 */
export function generateTokenPair(user: UserPayload): TokenPair {
    return {
        accessToken: generateAccessToken(user),
        refreshToken: generateRefreshToken(user.userId),
        expiresIn: TOKEN_EXPIRY
    };
}

/**
 * Validates an access token and extracts user payload
 * 
 * @param token - JWT token to validate
 * @returns AuthResult with success status and user data
 * 
 * @example
 * ```typescript
 * const result = validateToken(request.headers.get('Authorization')?.split(' ')[1]);
 * if (result.success) {
 *   console.log('Authenticated user:', result.user);
 * }
 * ```
 */
export function validateToken(token: string): AuthResult {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) {
            return { success: false, error: 'Invalid token format' };
        }

        const [headerBase64, payloadBase64, signature] = parts;

        // Verify signature
        const expectedSignature = createSignature(`${headerBase64}.${payloadBase64}`);
        if (signature !== expectedSignature) {
            return { success: false, error: 'Invalid token signature' };
        }

        // Decode and parse payload
        const payload = JSON.parse(base64Decode(payloadBase64));

        // Check expiration
        if (payload.exp && payload.exp < Date.now()) {
            return { success: false, error: 'Token expired' };
        }

        // Check token type
        if (payload.type !== 'access') {
            return { success: false, error: 'Invalid token type' };
        }

        return {
            success: true,
            user: {
                userId: payload.userId,
                email: payload.email,
                role: payload.role,
                permissions: payload.permissions
            }
        };
    } catch (error) {
        return { success: false, error: 'Token validation failed' };
    }
}

/**
 * Validates a refresh token
 * 
 * @param token - Refresh token to validate
 * @returns Object with success status and userId
 */
export function validateRefreshToken(token: string): { success: boolean; userId?: string; error?: string } {
    try {
        const parts = token.split('.');
        if (parts.length !== 2) {
            return { success: false, error: 'Invalid refresh token format' };
        }

        const [payloadBase64, signature] = parts;

        // Verify signature
        const expectedSignature = createSignature(payloadBase64);
        if (signature !== expectedSignature) {
            return { success: false, error: 'Invalid refresh token signature' };
        }

        // Decode and parse payload
        const payload = JSON.parse(base64Decode(payloadBase64));

        // Check expiration
        if (payload.exp && payload.exp < Date.now()) {
            return { success: false, error: 'Refresh token expired' };
        }

        // Check token type
        if (payload.type !== 'refresh') {
            return { success: false, error: 'Invalid token type' };
        }

        return { success: true, userId: payload.userId };
    } catch (error) {
        return { success: false, error: 'Refresh token validation failed' };
    }
}

/**
 * Extracts the Bearer token from Authorization header
 * 
 * @param request - Next.js request object
 * @returns Token string or null if not found
 */
export function extractBearerToken(request: NextRequest): string | null {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
    }
    return authHeader.substring(7);
}

/**
 * Authentication middleware for API routes
 * 
 * @param request - Next.js request object
 * @returns AuthResult with authenticated user or error
 * 
 * @example
 * ```typescript
 * export async function GET(request: NextRequest) {
 *   const auth = await authenticateRequest(request);
 *   if (!auth.success) {
 *     return NextResponse.json({ error: auth.error }, { status: 401 });
 *   }
 *   // Proceed with authenticated request
 *   const user = auth.user;
 * }
 * ```
 */
export function authenticateRequest(request: NextRequest): AuthResult {
    const token = extractBearerToken(request);
    
    if (!token) {
        return { success: false, error: 'No authentication token provided' };
    }

    return validateToken(token);
}

/**
 * Creates an unauthorized response
 * 
 * @param message - Error message to include
 * @returns NextResponse with 401 status
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
    return NextResponse.json(
        { error: message, code: 'UNAUTHORIZED' },
        { status: 401 }
    );
}

/**
 * Creates a forbidden response
 * 
 * @param message - Error message to include
 * @returns NextResponse with 403 status
 */
export function forbiddenResponse(message: string = 'Forbidden'): NextResponse {
    return NextResponse.json(
        { error: message, code: 'FORBIDDEN' },
        { status: 403 }
    );
}

/**
 * Checks if user has required permission
 * 
 * @param user - User payload to check
 * @param permission - Required permission string
 * @returns Boolean indicating if user has permission
 */
export function hasPermission(user: UserPayload, permission: string): boolean {
    if (user.role === 'admin') return true;
    return user.permissions.includes(permission);
}

/**
 * Rate limiting storage (in-memory for demo, use Redis in production)
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Simple rate limiting check
 * 
 * @param identifier - Unique identifier (IP, user ID, etc.)
 * @param limit - Maximum requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Boolean indicating if request should be allowed
 */
export function checkRateLimit(
    identifier: string,
    limit: number = 100,
    windowMs: number = 60 * 1000
): boolean {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || record.resetTime < now) {
        rateLimitStore.set(identifier, { count: 1, resetTime: now + windowMs });
        return true;
    }

    if (record.count >= limit) {
        return false;
    }

    record.count++;
    return true;
}

/**
 * Demo user for development/testing
 */
export const DEMO_USER: UserPayload = {
    userId: 'demo-user-001',
    email: 'demo@docuintel.ai',
    role: 'user',
    permissions: ['read', 'write', 'analyze']
};

/**
 * Generates demo tokens for development
 */
export function generateDemoTokens(): TokenPair {
    return generateTokenPair(DEMO_USER);
}
