import fs from "node:fs";
import path from "node:path";
import type { WorkspaceConfig } from "../types/config.js";
import { logger } from "./logger.js";

const WORKSPACE_DIR = ".ub";
const CONFIG_FILE = "config.json";
const SCHEMAS_DIR = "schemas";

export function getWorkspaceDir(): string {
  return path.join(process.cwd(), WORKSPACE_DIR);
}

export function getWorkspaceConfigPath(): string {
  return path.join(getWorkspaceDir(), CONFIG_FILE);
}

export function getSchemasDir(): string {
  return path.join(getWorkspaceDir(), SCHEMAS_DIR);
}

export function loadWorkspaceConfig(): WorkspaceConfig | null {
  const configPath = getWorkspaceConfigPath();
  if (!fs.existsSync(configPath)) {
    return null;
  }
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return JSON.parse(raw) as WorkspaceConfig;
  } catch {
    return null;
  }
}

export function saveWorkspaceConfig(config: WorkspaceConfig): void {
  const dir = getWorkspaceDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const configPath = getWorkspaceConfigPath();
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf8");
}

export function isValidCollectionName(collectionName: string): boolean {
  return typeof collectionName === "string" && !collectionName.includes("/") && !collectionName.includes("\\") && !collectionName.includes("..");
}

export function saveSchemaFile(collectionName: string, schema: any): void {
  if (!isValidCollectionName(collectionName)) {
    throw new Error(`Invalid collection name: ${collectionName}`);
  }

  const schemasDir = getSchemasDir();
  if (!fs.existsSync(schemasDir)) {
    fs.mkdirSync(schemasDir, { recursive: true });
  }

  const filePath = path.join(schemasDir, `${collectionName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(schema, null, 2), "utf8");
}

export function getLocalSchemas(): { name: string; schema: any }[] {
  const schemasDir = getSchemasDir();
  if (!fs.existsSync(schemasDir)) {
    return [];
  }

  const files = fs.readdirSync(schemasDir).filter((file) => file.endsWith(".json"));
  const schemas = [];

  for (const file of files) {
    try {
      const filePath = path.join(schemasDir, file);
      const raw = fs.readFileSync(filePath, "utf8");
      schemas.push({
        name: file.replace(".json", ""),
        schema: JSON.parse(raw),
      });
    } catch (err) {
      logger.warn(`Failed to parse schema file: ${file}. Skipping.`);
    }
  }

  return schemas;
}

export function clearSchemaFiles(): void {
  const schemasDir = getSchemasDir();
  if (!fs.existsSync(schemasDir)) return;

  const files = fs.readdirSync(schemasDir);
  for (const file of files) {
    if (file.endsWith(".json")) {
      fs.unlinkSync(path.join(schemasDir, file));
    }
  }
}
