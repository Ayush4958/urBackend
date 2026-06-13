'use strict';

// ---------------------------------------------------------------------------
// Mock all heavy dependencies before requiring the module under test.
// ---------------------------------------------------------------------------

jest.mock('jsonwebtoken');
jest.mock('bcryptjs');
jest.mock('mongoose', () => ({
    Types: {
        ObjectId: jest.fn((id) => id),
    },
}));

jest.mock('@urbackend/common', () => {
    const z = require('zod');

    const mockConnection = {};
    const mockModel = {
        findOne: jest.fn(),
        create: jest.fn(),
        updateOne: jest.fn(),
    };

    class AppError extends Error {
        constructor(statusCode, message) {
            super(message);
            this.statusCode = statusCode;
            this.isOperational = true;
        }
    }

    return {
        Project: { findOne: jest.fn() },
        redis: {
            set: jest.fn().mockResolvedValue('OK'),
            get: jest.fn(),
            del: jest.fn().mockResolvedValue(1),
        },
        authEmailQueue: {
            add: jest.fn().mockResolvedValue(undefined),
        },
        AppError,
        ApiResponse: class ApiResponse {
            constructor(data = {}, message = "Success") {
                this.data = data;
                this.message = message;
                this.success = true;
            }
            send(res, statusCode = 200) {
                return res.status(statusCode).json({
                    success: this.success,
                    data: this.data,
                    message: this.message
                });
            }
        },
        loginSchema: z.object({
            email: z.string().email(),
            password: z.string().min(1),
        }),
        signupSchema: z.object({
            email: z.string().email(),
            password: z.string().min(6),
        }),
        userSignupSchema: z.object({
            email: z.string().email(),
            password: z.string().min(6),
        }).passthrough(),
        resetPasswordSchema: z.object({
            email: z.string().email(),
            otp: z.string(),
            newPassword: z.string().min(6),
        }),
        onlyEmailSchema: z.object({
            email: z.string().email(),
        }),
        verifyOtpSchema: z.object({
            email: z.string().email(),
            otp: z.string(),
        }),
        changePasswordSchema: z.object({
            currentPassword: z.string().min(1),
            newPassword: z.string().min(6),
        }),
        sanitize: jest.fn((data) => data),
        getConnection: jest.fn().mockResolvedValue(mockConnection),
        getCompiledModel: jest.fn().mockReturnValue(mockModel),
        // Expose model for test access.
        __mockModel: mockModel,
    };
});

// ---------------------------------------------------------------------------
// Import module under test after mocks are in place.
// ---------------------------------------------------------------------------

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { redis, authEmailQueue, getConnection, getCompiledModel, __mockModel: mockModel, AppError } =
    require('@urbackend/common');
const userAuthController = require('../controllers/userAuth.controller');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const next = jest.fn();

const makeRes = () => {
    const res = { status: jest.fn(), json: jest.fn(), header: jest.fn() };
    res.status.mockReturnValue(res);
    res.json.mockReturnValue(res);
    return res;
};

const makeProject = (overrides = {}) => ({
    _id: 'project_id_1',
    name: 'TestProject',
    jwtSecret: 'project-secret',
    resources: { db: { isExternal: false } },
    collections: [
        {
            name: 'users',
            model: [
                { key: 'email', required: true },
                { key: 'password', required: true },
                { key: 'isVerified', required: false },
            ],
        },
    ],
    ...overrides,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('userAuth.controller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        next.mockClear();
        process.env.NODE_ENV = 'test';
    });

    // -----------------------------------------------------------------------
    describe('signup', () => {
        test('returns 201 with token when new user is created', async () => {
            mockModel.findOne.mockResolvedValue(null);
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('hashed_pw');
            mockModel.create.mockResolvedValue({ _id: 'new_user_id' });
            jwt.sign.mockReturnValue('signup_token');

            const req = {
                project: makeProject(),
                body: { email: 'newuser@example.com', password: 'secret123' },
            };
            const res = makeRes();

            await userAuthController.signup(req, res, next);

            expect(mockModel.create).toHaveBeenCalled();
            expect(authEmailQueue.add).toHaveBeenCalledWith(
                'send-verification-email',
                expect.objectContaining({ type: 'verification' })
            );
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ data: expect.objectContaining({ token: 'signup_token' }) })
            );
        });

        test('returns 400 when user with email already exists', async () => {
            mockModel.findOne.mockResolvedValue({ email: 'existing@example.com' });

            const req = {
                project: makeProject(),
                body: { email: 'existing@example.com', password: 'secret123' },
            };
            const res = makeRes();

            await userAuthController.signup(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
        });

        test('returns 404 when users collection is not configured', async () => {
            const req = {
                project: makeProject({ collections: [] }),
                body: { email: 'user@example.com', password: 'secret123' },
            };
            const res = makeRes();

            await userAuthController.signup(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(404);
        });

        test('returns 400 on Zod validation error (short password)', async () => {
            const req = {
                project: makeProject(),
                body: { email: 'user@example.com', password: 'abc' },
            };
            const res = makeRes();

            await userAuthController.signup(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
        });
    });

    // -----------------------------------------------------------------------
    describe('login', () => {
        const mockUserDoc = () => ({
            _id: 'user_id_1',
            email: 'user@example.com',
            password: 'hashed_pw',
        });

        test('returns 200 with JWT token on valid credentials', async () => {
            mockModel.findOne.mockResolvedValue(mockUserDoc());
            bcrypt.compare.mockResolvedValue(true);
            jwt.sign.mockReturnValue('user_token');

            const req = {
                project: makeProject(),
                body: { email: 'user@example.com', password: 'correct' },
            };
            const res = makeRes();

            await userAuthController.login(req, res, next);

            expect(bcrypt.compare).toHaveBeenCalledWith('correct', 'hashed_pw');
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ data: { token: 'user_token' } })
            );
        });

        test('returns 400 when user is not found', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const req = {
                project: makeProject(),
                body: { email: 'ghost@example.com', password: 'pass' },
            };
            const res = makeRes();

            await userAuthController.login(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
        });

        test('returns 400 when password is wrong', async () => {
            mockModel.findOne.mockResolvedValue(mockUserDoc());
            bcrypt.compare.mockResolvedValue(false);

            const req = {
                project: makeProject(),
                body: { email: 'user@example.com', password: 'wrong' },
            };
            const res = makeRes();

            await userAuthController.login(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
        });

        test('returns 404 when users collection is missing', async () => {
            const req = {
                project: makeProject({ collections: [] }),
                body: { email: 'user@example.com', password: 'pass' },
            };
            const res = makeRes();

            await userAuthController.login(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe('me', () => {
        test('returns 401 when Authorization header is missing', async () => {
            const req = {
                project: makeProject(),
                header: jest.fn().mockReturnValue(null),
            };
            const res = makeRes();

            await userAuthController.me(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(401);
        });

        test('returns 401 when JWT is invalid', async () => {
            jwt.verify.mockImplementation(() => { throw new Error('invalid'); });

            const req = {
                project: makeProject(),
                header: jest.fn().mockReturnValue('Bearer badtoken'),
            };
            const res = makeRes();

            await userAuthController.me(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(401);
        });

        test('returns 404 when user is not found in database', async () => {
            jwt.verify.mockReturnValue({ userId: 'uid1', projectId: 'pid1' });
            const mockLean = jest.fn().mockResolvedValue(null);
            mockModel.findOne.mockReturnValue({ lean: mockLean });

            const req = {
                project: makeProject(),
                header: jest.fn().mockReturnValue('Bearer validtoken'),
            };
            const res = makeRes();

            await userAuthController.me(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(404);
        });

        test('returns user data on valid token', async () => {
            const userData = { _id: 'uid1', email: 'u@example.com' };
            jwt.verify.mockReturnValue({ userId: 'uid1', projectId: 'pid1' });
            const mockLean = jest.fn().mockResolvedValue(userData);
            mockModel.findOne.mockReturnValue({ lean: mockLean });

            const req = {
                project: makeProject(),
                header: jest.fn().mockReturnValue('Bearer validtoken'),
            };
            const res = makeRes();

            await userAuthController.me(req, res, next);

            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ data: { user: userData } })
            );
        });
    });

    // -----------------------------------------------------------------------
    describe('verifyEmail', () => {
        test('returns 400 when OTP is invalid or expired', async () => {
            redis.get.mockResolvedValue(null);

            const req = {
                project: makeProject(),
                body: { email: 'user@example.com', otp: '999999' },
            };
            const res = makeRes();

            await userAuthController.verifyEmail(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
        });

        test('returns success when OTP matches and user is found', async () => {
            redis.get.mockResolvedValue('123456');
            mockModel.updateOne.mockResolvedValue({ matchedCount: 1 });

            const req = {
                project: makeProject(),
                body: { email: 'user@example.com', otp: '123456' },
            };
            const res = makeRes();

            await userAuthController.verifyEmail(req, res, next);

            expect(redis.del).toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'Email verified successfully' })
            );
        });

        test('returns 404 when no matching user record is updated', async () => {
            redis.get.mockResolvedValue('123456');
            mockModel.updateOne.mockResolvedValue({ matchedCount: 0 });

            const req = {
                project: makeProject(),
                body: { email: 'ghost@example.com', otp: '123456' },
            };
            const res = makeRes();

            await userAuthController.verifyEmail(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(404);
        });
    });

    // -----------------------------------------------------------------------
    describe('requestPasswordReset', () => {
        test('returns the generic message when user does not exist (prevents enumeration)', async () => {
            mockModel.findOne.mockResolvedValue(null);

            const req = {
                project: makeProject(),
                body: { email: 'ghost@example.com' },
            };
            const res = makeRes();

            await userAuthController.requestPasswordReset(req, res, next);

            expect(authEmailQueue.add).not.toHaveBeenCalled();
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('reset code') })
            );
        });

        test('queues a reset email when user exists', async () => {
            mockModel.findOne.mockResolvedValue({ _id: 'uid1', email: 'u@example.com' });

            const req = {
                project: makeProject(),
                body: { email: 'u@example.com' },
            };
            const res = makeRes();

            await userAuthController.requestPasswordReset(req, res, next);

            expect(redis.set).toHaveBeenCalled();
            expect(authEmailQueue.add).toHaveBeenCalledWith(
                'send-reset-email',
                expect.objectContaining({ type: 'password_reset' })
            );
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: expect.stringContaining('reset code') })
            );
        });
    });

    // -----------------------------------------------------------------------
    describe('createAdminUser', () => {
        test('returns 201 when admin creates a new user successfully', async () => {
            mockModel.findOne.mockResolvedValue(null);
            bcrypt.genSalt.mockResolvedValue('salt');
            bcrypt.hash.mockResolvedValue('hashed_pw');
            mockModel.create.mockResolvedValue({ _id: 'new_admin_user' });

            const req = {
                project: makeProject(),
                body: { email: 'admin_user@example.com', password: 'secure123' },
            };
            const res = makeRes();

            await userAuthController.createAdminUser(req, res, next);

            expect(mockModel.create).toHaveBeenCalled();
            expect(res.status).toHaveBeenCalledWith(201);
            expect(res.json).toHaveBeenCalledWith(
                expect.objectContaining({ message: 'User created successfully' })
            );
        });

        test('returns 400 when the email is already taken', async () => {
            mockModel.findOne.mockResolvedValue({ email: 'taken@example.com' });

            const req = {
                project: makeProject(),
                body: { email: 'taken@example.com', password: 'secure123' },
            };
            const res = makeRes();

            await userAuthController.createAdminUser(req, res, next);

            expect(next).toHaveBeenCalledWith(expect.any(AppError));
            expect(next.mock.calls[0][0].statusCode).toBe(400);
        });
    });
});
