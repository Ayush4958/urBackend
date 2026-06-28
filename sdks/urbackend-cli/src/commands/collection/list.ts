import { getProject } from "../../services/project.service.js";
import { getToken, getCurrentProject } from "../../core/config.js";
import { label } from "../../utils/format.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function collectionListCommand(projectId?: string): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
    return;
  }

  const id = projectId ?? getCurrentProject();
  if (!id) {
    logger.error("No active project. Run 'ub project use' to select one.");
    return;
  }

  try {
    const project = await getProject(id);
    const collections = project.collections ?? [];

    if (collections.length === 0) {
      logger.info(`No collections in project "${project.name}".`);
      return;
    }

    console.log(`\nCollections in "${project.name}" (${collections.length}):\n`);

    for (const col of collections) {
      const fieldCount = col.model?.length ?? 0;
      const rlsMode = col.rls?.enabled ? col.rls.mode : "disabled";

      console.log(`  ${col.name}`);
      console.log(`    ${label("Fields", 10)} ${fieldCount}`);
      console.log(`    ${label("RLS", 10)} ${rlsMode}`);

      if (col.model && col.model.length > 0) {
        const fieldSummary = col.model
          .slice(0, 5)
          .map((f) => `${f.key}: ${f.type}${f.required ? "*" : ""}`)
          .join(", ");
        const extra = col.model.length > 5 ? ` +${col.model.length - 5} more` : "";
        console.log(`    ${label("Schema", 10)} ${fieldSummary}${extra}`);
      }

      console.log();
    }

    console.log("  * = required field");
    console.log();
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Token is invalid or expired. Run 'ub login' to re-authenticate.");
      } else if (error.status === 404) {
        logger.error("Project not found or access denied.");
      } else {
        logger.error(error.message);
      }
      return;
    }
    logger.error("Unable to connect to the urBackend API.");
  }
}
