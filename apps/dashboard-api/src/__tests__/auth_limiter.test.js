'use strict';

class AppError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.isOperational = true;
    }
}

jest.mock('@urbackend/common', () => ({
    AppError,
}));

const express = require('express');
const request = require('supertest');
const { authLimiter } = require('../middlewares/auth_limiter');

// Helper: creates a test app with the limiter and a global error handler
// that mirrors the real dashboard-api error handler behavior.
const createTestApp = () => {
    const app = express();
    app.use(authLimiter);
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // Global error handler (mirrors dashboard-api app.js)
    app.use((err, _req, res, _next) => {
        if (err.isOperational && err.statusCode) {
            return res.status(err.statusCode).json({
                success: false,
                error: 'Error',
                message: err.message,
            });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    });

    return app;
};

describe('authLimiter', () => {
    test('exports authLimiter as a middleware function', () => {
        expect(typeof authLimiter).toBe('function');
    });

    test('allows requests through in the development environment (skip=true)', async () => {
        const originalEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'development';

            const app = createTestApp();

            // Exceed the configured max (10) — all should still succeed because
            // the limiter is skipped in development.
            for (let i = 0; i < 15; i++) {
                const res = await request(app).get('/test');
                expect(res.status).toBe(200);
            }
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });

    test('enforces the rate limit in the production environment', async () => {
        const originalEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';

            const app = createTestApp();

            // Exhaust the 10-request window.
            for (let i = 0; i < 10; i++) {
                const res = await request(app).get('/test');
                expect(res.status).toBe(200);
            }

            // The 11th request should be rate-limited.
            const blocked = await request(app).get('/test');
            expect(blocked.status).toBe(429);
            expect(blocked.body.message).toBe('Too many attempts. Please try again in 15 minutes.');
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });

    test('sets standard rate-limit headers', async () => {
        const originalEnv = process.env.NODE_ENV;
        try {
            process.env.NODE_ENV = 'production';

            const app = createTestApp();

            const res = await request(app).get('/test');
            // standardHeaders:true → RateLimit-* headers should be present.
            expect(res.headers).toHaveProperty('ratelimit-limit');
            expect(res.headers).toHaveProperty('ratelimit-remaining');
        } finally {
            process.env.NODE_ENV = originalEnv;
        }
    });
});
