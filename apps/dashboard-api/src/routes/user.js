const express = require('express');
const router = express.Router();
const authorization = require('../middlewares/authMiddleware');
const { getMe, updateOnboarding } = require('../controllers/auth.controller');
const { createPAT, listPATs, revokePAT } = require('../controllers/pat.controller');
const authenticateCLI = require("../middlewares/authenticateCLI");
const {getCLIProfile,} = require("../controllers/cli.controller");

router.get("/cli/me", authenticateCLI, getCLIProfile);
router.get('/me', authorization, getMe);
router.patch('/onboarding', authorization, updateOnboarding);

router.post('/pats', authorization, createPAT);
router.get('/pats', authorization, listPATs);
router.delete('/pats/:id', authorization, revokePAT);

module.exports = router;
