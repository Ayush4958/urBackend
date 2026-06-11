const {Release} = require("@urbackend/common");
const {Developer} = require("@urbackend/common");
const { emailQueue } = require("@urbackend/common");
const { AppError } = require("@urbackend/common");

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

const getValidHttpUrl = (raw) => {
    if (!raw || typeof raw !== 'string') return null;
    const candidate = raw.trim();
    try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
            return parsed.toString();
        }
    } catch (_) {
        return null;
    }
    return null;
};

const extractReleaseLinkFromContent = (content) => {
    if (!content || typeof content !== 'string') return null;

    // 0) Safety: limit input length to prevent excessive regex processing
    const MAX_CONTENT_LENGTH = 50000;
    const safeContent = content.length > MAX_CONTENT_LENGTH 
        ? content.substring(0, MAX_CONTENT_LENGTH) 
        : content;

    // 1) Find all markdown links safely
    // Bounded quantifiers {1,1000} and newline exclusion prevent Polynomial ReDoS
    const mdLinkRegex = /\[([^\[\]\n\r]{1,1000})\]\((https?:\/\/[^\s\)\n\r]{1,1000})\)/gi;
    const mdLinks = [...safeContent.matchAll(mdLinkRegex)];

    // 1a) Prefer markdown links whose label mentions changelog.
    for (const match of mdLinks) {
        if (match[1].toLowerCase().includes('changelog')) {
            const valid = getValidHttpUrl(match[2]);
            if (valid) return valid;
        }
    }

    // 2) Prefer explicit line style: Full changelog: https://...
    // Bounded quantifier prevents excessive matching
    const explicitLine = safeContent.match(/full\s*changelog\s*:\s*(https?:\/\/[^\s<)\n\r]{1,1000})/i);
    if (explicitLine?.[1]) {
        const valid = getValidHttpUrl(explicitLine[1]);
        if (valid) return valid;
    }

    // 3) Any markdown link.
    for (const match of mdLinks) {
        const valid = getValidHttpUrl(match[2]);
        if (valid) return valid;
    }

    // 4) Any raw URL.
    const anyRawUrl = safeContent.match(/https?:\/\/[^\s<)\n\r]{1,1000}/i);
    if (anyRawUrl?.[0]) {
        const valid = getValidHttpUrl(anyRawUrl[0]);
        if (valid) return valid;
    }

    return null;
};

// GET FOR - ALL RELEASES
exports.getAllReleases = async (req, res, next) => {
    try {
        const releases = await Release.find().sort({ createdAt: -1 });
        res.json({ success: true, data: releases, message: "" });
    } catch (err) {
        if (!(err instanceof AppError)) err = new AppError(500, "Internal server error");
        next(err);
    }
};

// POST FOR - CREATE RELEASE
exports.createRelease = async (req, res, next) => {
    try {
        const { version, title, content } = req.body;
        const changelogUrlFromContent = extractReleaseLinkFromContent(content);

        const dev = await Developer.findById(req.user._id);
        if (!dev || dev.email !== ADMIN_EMAIL) {
            return next(new AppError(403, "Access denied. Admin only."));
        }

        if (!version || !title || !content) {
            return next(new AppError(400, "Missing version, title, or content"));
        }

        const newRelease = new Release({ 
            version, 
            title, 
            content,
            publishedBy: dev.email
        });
        await newRelease.save();
        const developers = await Developer.find({ isVerified: true })
            .select("email")
            .lean();
        const emails = developers.map(({ email }) => email);
        await Promise.all(emails.map(email => 
            emailQueue.add('release-email', {
                email,
                version,
                title,
                content,
                changelogUrl: changelogUrlFromContent
            })
        ));

        res.status(201).json({ 
            success: true,
            data: { count: emails.length },
            message: "Release published! Emails queued."
        });

    } catch (err) {
        if (!(err instanceof AppError)) err = new AppError(500, "Internal server error");
        next(err);
    }
};
