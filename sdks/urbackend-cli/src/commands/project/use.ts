import { listProjects, getProject } from "../../services/project.service.js";
import { saveCurrentProject, getToken } from "../../core/config.js";
import { prompt } from "../../utils/prompt.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function projectUseCommand(projectIdOrName?: string): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
    return;
  }

  try {
    const projects = await listProjects();

    if (projects.length === 0) {
      logger.info("No projects found. Create one at dashboard.urbackend.bitbros.in");
      return;
    }

    let selectedId: string | undefined;

    if (projectIdOrName) {
      // Try matching by ID or name
      const match = projects.find(
        (p) =>
          p._id === projectIdOrName ||
          p.name.toLowerCase() === projectIdOrName.toLowerCase(),
      );
      if (!match) {
        logger.error(`No project found matching "${projectIdOrName}".`);
        logger.info("Run 'ub project list' to see available projects.");
        return;
      }
      selectedId = match._id;
    } else {
      // Interactive selection
      console.log("\nAvailable projects:\n");
      projects.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.name} (${p._id})`);
      });
      console.log();

      const answer = await prompt("Enter project number: ");
      if (!/^\d+$/.test(answer)) {
        logger.error("Invalid selection.");
        return;
      }
      const index = Number(answer) - 1;
      if (isNaN(index) || index < 0 || index >= projects.length) {
        logger.error("Invalid selection.");
        return;
      }

      selectedId = projects[index]._id;
    }

    saveCurrentProject(selectedId);

    const project = projects.find((p) => p._id === selectedId)!;
    logger.success(`Switched to project: ${project.name} (${selectedId})`);
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
