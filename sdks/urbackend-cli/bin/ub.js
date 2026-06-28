#!/usr/bin/env node

// Resolve the correct dist entry based on the module system
import("../dist/index.js").catch((err) => {
  console.error("Failed to start urBackend CLI:", err.message);
  process.exit(1);
});
