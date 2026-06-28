import { clearToken } from "../../core/config.js";
import { logger } from "../../core/logger.js";

export async function logoutCommand(): Promise<void> {
  clearToken();
  logger.success("Logged out. Your token has been removed from this machine.");
}
