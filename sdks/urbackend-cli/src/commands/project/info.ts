import { getProject } from "../../services/project.service.js";
import { getCurrentProject, getToken } from "../../core/config.js";
import { formatBytes, label } from "../../utils/format.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function projectInfoCommand(projectId?: string): Promise<void> {
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

    console.log(`\n${project.name}\n`);
    console.log(`${label("ID")} ${project._id}`);

    if (project.description) {
      console.log(`${label("Description")} ${project.description}`);
    }

    console.log(`${label("Auth")} ${project.isAuthEnabled ? "Enabled" : "Disabled"}`);
    console.log(`${label("DB used")} ${formatBytes(project.databaseUsed ?? 0)}`);
    console.log(`${label("Storage")} ${formatBytes(project.storageUsed ?? 0)}`);
    console.log(`${label("Collections")} ${project.collections?.length ?? 0}`);

    if (project.collections && project.collections.length > 0) {
      console.log("\nCollections:");
      for (const col of project.collections) {
        const fieldCount = col.model?.length ?? 0;
        console.log(`  • ${col.name} (${fieldCount} field${fieldCount !== 1 ? "s" : ""})`);
      }
    }

    console.log();
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Token is invalid or expired. Run 'ub login' to re-authenticate.");
      } else if (error.status === 404) {
        logger.error("Project not found.");
      } else {
        logger.error(error.message);
      }
      return;
    }
    logger.error("Unable to connect to the urBackend API.");
  }
}
