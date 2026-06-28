const express = require("express");
const router = express.Router();
const analyticsController = require("../controllers/analytics.controller");
const authMiddleware = require("../middlewares/authMiddleware");
const authFlexible = require("../middlewares/authFlexible");

router.get("/stats", authFlexible, analyticsController.getGlobalStats);
router.get("/activity", authFlexible, analyticsController.getRecentActivity);

// --- Metrics Stack ---
router.get("/funnel", authMiddleware, analyticsController.getActivationFunnel);
router.get("/retention", authMiddleware, analyticsController.getRetention);
router.get("/engagement", authMiddleware, analyticsController.getEngagement);
router.get("/north-star", authMiddleware, analyticsController.getNorthStar);

module.exports = router;
