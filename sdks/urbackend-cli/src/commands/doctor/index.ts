import { getProfile } from "../../services/auth.service.js";
import { getProject } from "../../services/project.service.js";
import {
  getToken,
  getCurrentProject,
  loadConfig,
  configFilePath,
} from "../../core/config.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

interface DoctorResult {
  configFound: boolean;
  patValid: boolean | null;
  projectSelected: boolean;
  projectAccessible: boolean | null;
  dashboardApiReachable: boolean;
  dashboardApiLatencyMs: number | null;
  email: string | null;
  plan: string | null;
  projectName: string | null;
}

export interface DoctorOptions {
  json?: boolean;
}

async function checkApiReachable(apiBase: string): Promise<number | null> {
  const start = Date.now();
  try {
   const response = await fetch(`${apiBase}/health`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return null;
    }
    return Date.now() - start;
  } catch {
    return null;
  }
}

export async function doctorCommand(options: DoctorOptions = {}): Promise<void> {
  const config = loadConfig();
  const token = getToken();
  const currentProjectId = getCurrentProject();

  const result: DoctorResult = {
    configFound: false,
    patValid: false,
    projectSelected: !!currentProjectId,
    projectAccessible: false,
    dashboardApiReachable: false,
    dashboardApiLatencyMs: null,
    email: null,
    plan: null,
    projectName: null,
  };

  // 1. Config file
  try {
    const fs = await import("node:fs");
    result.configFound = fs.existsSync(configFilePath());
  } catch {
    result.configFound = false;
  }

  // 2. API reachability (independent of auth)
  const latency = await checkApiReachable(config.apiBase);
  result.dashboardApiReachable = latency !== null;
  result.dashboardApiLatencyMs = latency;

  // 3. PAT validity
  if (token) {
    try {
      const profile = await getProfile();
      result.patValid = true;
      result.email = profile.developer.email;
      result.plan = profile.developer.plan;
    } catch (error) {
      if (error instanceof APIError && error.status === 401) {
        result.patValid = false;
      } else {
        result.patValid = null;
      }
    }
  }

  // 4. Project accessibility
  if (currentProjectId && result.patValid) {
    try {
      const project = await getProject(currentProjectId);
      result.projectAccessible = true;
      result.projectName = project.name;
    } catch (error) {
      if (error instanceof APIError && (error.status === 401 || error.status === 403)) {
        result.projectAccessible = false;
      } else {
        result.projectAccessible = null;
      }
    }
  }

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log("\n── urBackend CLI Doctor ─────────────────────────\n");

  const ok = "✓";
  const fail = "✖";
  const warn = "⚠";

  console.log(
    `  ${result.configFound ? ok : fail}  Config file           ${result.configFound ? configFilePath() : "Not found — run 'ub login'"}`,
  );

  console.log(
    `  ${result.dashboardApiReachable ? ok : fail}  Dashboard API         ${
      result.dashboardApiReachable
        ? `Reachable (${result.dashboardApiLatencyMs}ms)`
        : `Unreachable — ${config.apiBase}`
    }`,
  );

  if (!token) {
    console.log(`  ${fail}  PAT                   Not set — run 'ub login'`);
  } else if (result.patValid === null) {
    console.log(
      `  ${warn}  PAT                   Unable to validate — API unreachable or backend error`,
    );
  } else {
    console.log(
      `  ${result.patValid ? ok : fail}  PAT                   ${
        result.patValid
          ? `Valid (${result.email}, ${result.plan})`
          : "Invalid or expired — run 'ub login'"
      }`,
    );
  }

  if (!currentProjectId) {
    console.log(`  ${warn}  Active project        Not selected — run 'ub project use'`);
  } else if (result.projectAccessible === null) {
    console.log(
      `  ${warn}  Active project        Unable to validate — API unreachable or backend error`,
    );
  } else {
    console.log(
      `  ${result.projectAccessible ? ok : fail}  Active project        ${
        result.projectAccessible
          ? `${result.projectName} (${currentProjectId})`
          : `ID ${currentProjectId} — not found or access denied`
      }`,
    );
  }

  console.log();

  // Summary
  const allGood =
    result.configFound &&
    result.patValid === true &&
    result.dashboardApiReachable &&
    result.projectSelected &&
    result.projectAccessible === true;

  if (allGood) {
    logger.success("Everything looks good.");
  } else {
    logger.warn("Some checks failed. Review the output above.");
  }

  console.log();
}
