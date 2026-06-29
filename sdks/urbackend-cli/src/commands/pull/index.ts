import { loadWorkspaceConfig, saveSchemaFile } from "../../core/workspace.js";
import { getProject } from "../../services/project.service.js";
import { getToken } from "../../core/config.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";
import { label } from "../../utils/format.js";

export async function pullCommand(): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
    process.exitCode = 1;
    return;
  }

  const workspaceConfig = loadWorkspaceConfig();
  if (!workspaceConfig || !workspaceConfig.projectId) {
    logger.error(
      "No project linked to this directory. Run 'ub init' to link a project first."
    );
    process.exitCode = 1;
    return;
  }

  const { projectId, projectName } = workspaceConfig;
  logger.info(`Fetching schemas for ${projectName ? projectName + " " : ""}(${projectId})...`);

  try {
    const project = await getProject(projectId);

    if (!project.collections || project.collections.length === 0) {
      logger.info("This project has no collections defined yet.");
      return;
    }

    let count = 0;
    for (const collection of project.collections) {
      saveSchemaFile(collection.name, {
        name: collection.name,
        model: collection.model,
        rls: collection.rls,
      });
      count++;
    }

    logger.success(`Successfully pulled ${count} collection schema(s) into .ub/schemas/`);
    console.log();
    for (const collection of project.collections) {
      console.log(`  ${label("schema")} ${collection.name}.json`);
    }
    console.log(`\nNext, run 'ub generate' to create your TypeScript types.`);
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Token is invalid or expired. Run 'ub login' to re-authenticate.");
      } else if (error.status === 403) {
        logger.error("You do not have permission to access this project.");
      } else {
        logger.error(error.message);
      }
      process.exitCode = 1;
      return;
    }
    logger.error("Unable to connect to the urBackend API.");
    process.exitCode = 1;
  }
}
