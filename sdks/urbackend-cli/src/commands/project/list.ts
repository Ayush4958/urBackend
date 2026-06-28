import { listProjects } from "../../services/project.service.js";
import { getCurrentProject, getToken } from "../../core/config.js";
import { formatBytes } from "../../utils/format.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function projectListCommand(): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
    return;
  }

  try {
    const projects = await listProjects();
    const currentProjectId = getCurrentProject();

    if (projects.length === 0) {
      logger.info("No projects found. Create one at dashboard.urbackend.bitbros.in");
      return;
    }

    console.log(`\nFound ${projects.length} project(s):\n`);

    for (const project of projects) {
      const active = project._id === currentProjectId ? " (active)" : "";
      const db = formatBytes(project.databaseUsed ?? 0);
      const colCount = project.collections?.length ?? 0;

      console.log(`  ${project.name}${active}`);
      console.log(`    ID          ${project._id}`);
      console.log(`    Collections ${colCount}`);
      console.log(`    DB used     ${db}`);

      if (project.description) {
        console.log(`    Description ${project.description}`);
      }

      console.log();
    }
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Token is invalid or expired. Run 'ub login' to re-authenticate.");
      } else {
        logger.error(error.message);
      }
      return;
    }
    logger.error("Unable to connect to the urBackend API.");
  }
}
