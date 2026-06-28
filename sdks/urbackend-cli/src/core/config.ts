import fs from "node:fs";
import path from "node:path";
import type { CLIConfig } from "../types/config.js";
import { CONFIG_DIR, CONFIG_PATH, DEFAULT_API_BASE } from "./constants.js";

const DEFAULT_CONFIG: CLIConfig = {
  apiBase: DEFAULT_API_BASE,
};

export function loadConfig(): CLIConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = fs.readFileSync(CONFIG_PATH, "utf8");
    return {
      ...DEFAULT_CONFIG,
      ...JSON.parse(raw),
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: CLIConfig): void {
  if (!fs.existsSync(CONFIG_DIR)) {
   fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  }

  // Atomic write: write to temp file then rename to avoid corruption on crash
  const tmp = CONFIG_PATH + ".tmp";
 fs.writeFileSync(tmp, JSON.stringify(config, null, 2), {
    encoding: "utf8",
    mode: 0o600,
  });
  fs.renameSync(tmp, CONFIG_PATH);
  fs.chmodSync(CONFIG_DIR, 0o700);
  fs.chmodSync(CONFIG_PATH, 0o600);
}

export function saveToken(token: string): void {
  const config = loadConfig();
   const nextConfig: CLIConfig = { ...config, pat: token };
  if (config.pat && config.pat !== token) {
    delete nextConfig.currentProject;
  }
  saveConfig(nextConfig);
}

export function clearToken(): void {
  const config = loadConfig();
  delete config.pat;
  delete config.currentProject;
  saveConfig(config);
}

export function getToken(): string | undefined {
  return loadConfig().pat;
}

export function saveCurrentProject(projectId: string): void {
  const config = loadConfig();
  saveConfig({ ...config, currentProject: projectId });
}

export function getCurrentProject(): string | undefined {
  return loadConfig().currentProject;
}

export function configFilePath(): string {
  return CONFIG_PATH;
}

export function configDirPath(): string {
  return path.dirname(CONFIG_PATH);
}
