const { registry } = require("./registry");
const { getPublicIp } = require("./network");
const Project = require("../models/Project");
const { decrypt } = require("./encryption");
const mongoose = require("mongoose");
const redis = require("../config/redis");

async function getConnection(projectId) {
    const key = projectId.toString();

    // 1. Instant Cache Hit (Fastest Path for UX)
    if (registry.has(key)) {
        const cachedConn = registry.get(key);
        if (cachedConn.readyState === 1) {
            cachedConn.lastAccessed = new Date(); // Update access timestamp instantly
            return cachedConn;
        }
    }

    let dbUri;
    let plan = 'free'; // default

    // 2. Redis Cache Check (Saves Main DB load and Decryption CPU cycles)
    const redisKey = `project:uri:${key}`;
    const cachedDataStr = await redis.get(redisKey);

    if (cachedDataStr) {
        try {
            const cachedData = JSON.parse(cachedDataStr);
            dbUri = cachedData.dbUri;
            plan = cachedData.plan || 'free';
        } catch (e) {
            console.error("Failed to parse cached project data from Redis", e);
        }
    }

    // 3. Database Lookup & Decryption (Only runs if Redis is empty)
    if (!dbUri) {
        const projectDoc = await Project.findById(projectId)
            .select("+resources.db.config.encrypted +resources.db.config.iv +resources.db.config.tag resources.db.isExternal plan");

        if (!projectDoc) throw new Error("Project not found");

        if (!projectDoc.resources.db.isExternal) {
            return mongoose.connection;
        }

        try {
            const decryptedConfig = decrypt(projectDoc.resources.db.config);
            dbUri = JSON.parse(decryptedConfig).dbUri;
            plan = projectDoc.plan || 'free';
        } catch (err) {
            console.error("Decryption Error:", err);
            throw new Error("Invalid or corrupted external config");
        }

        // Save to Redis for 1 Hour so subsequent server processes can grab it instantly
        await redis.set(redisKey, JSON.stringify({ dbUri, plan }), 'EX', 3600);
    }

    // 4. ENTERPRISE CONFIGURATION FIX
    // We dynamically allocate pooling size depending on usage tiers to balance RAM & Throughput
    const isPremiumUser = plan === 'premium';

    const connectionOptions = {
        maxPoolSize: isPremiumUser ? 50 : 15,    // Cap free/hobby projects at 15 to prevent crashing your server
        minPoolSize: 2,                          // Keeps 2 warm sockets alive for instant response time
        maxIdleTimeMS: 15000,                    // Native driver automatically kills idle sockets after 15 seconds
        connectTimeoutMS: 5000,                  // Fail fast (5s) if user provides a bad/dead connection string
        socketTimeoutMS: 45000,
        waitQueueTimeoutMS: 5000                 // Prevents requests from stalling forever if pool is exhausted
    };

    // Initialize the pool with custom options
    const connection = mongoose.createConnection(dbUri, connectionOptions);

    // Track active query load on this connection to prevent overflow crashes
    connection.lastAccessed = new Date();

    connection.on("connected", () => {
        console.log(`✅ External DB pool opened for: ${projectId} (maxPoolSize: ${connectionOptions.maxPoolSize})`);
    });

    try {
        await connection.asPromise();
    } catch (err) {
        console.error("❌ Initial Connection Failed:", err.message);
        if (err.message.includes("Server selection timed out") || err.message.includes("Could not connect")) {
            const serverIp = await getPublicIp();
            throw new Error(`Access Denied: Please whitelist Server IP [${serverIp}] in MongoDB Atlas.`);
        }
        throw err;
    }

    connection.on("error", (err) => {
        console.error(`❌ DB Connection Error for project ${projectId}:`, err);
        registry.delete(key); // Clear bad connections immediately
    });

    connection.on("disconnected", () => {
        console.log(`🔌 External DB disconnected: ${projectId}`);
        registry.delete(key);
    });

    connection.on("close", () => {
        registry.delete(key);
        console.log(`🔌 Connection closed: ${key}`);
    });

    // Save back to your central in-memory store
    registry.set(key, connection);

    return connection;
}

module.exports = { getConnection };
