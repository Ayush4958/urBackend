import { deleteCollection } from "../../services/collection.service.js";
import { getProject } from "../../services/project.service.js";
import { getToken, getCurrentProject } from "../../core/config.js";
import { confirm } from "../../utils/prompt.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export interface CollectionDeleteOptions {
  force?: boolean;
  project?: string;
}

export async function collectionDeleteCommand(
  collectionName: string,
  options: CollectionDeleteOptions,
): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
    return;
  }

  const projectId = options.project ?? getCurrentProject();
  if (!projectId) {
    logger.error("No active project. Run 'ub project use' to select one.");
    return;
  }

  try {
    // Verify the collection actually exists before asking for confirmation
    const project = await getProject(projectId);
    const exists = project.collections?.some((c) => c.name === collectionName);

    if (!exists) {
      logger.error(
        `Collection "${collectionName}" not found in project "${project.name}".`,
      );
      return;
    }

    if (!options.force) {
      console.log(
        `\n⚠  This will permanently delete the collection "${collectionName}" and ALL its data.\n`,
      );
      const ok = await confirm("Are you sure?");
      if (!ok) {
        logger.info("Aborted.");
        return;
      }
    }

    await deleteCollection(projectId, collectionName);
    logger.success(`Collection "${collectionName}" deleted.`);
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Token is invalid or expired. Run 'ub login' to re-authenticate.");
      } else if (error.status === 404) {
        logger.error("Collection or project not found.");
      } else {
        logger.error(error.message);
      }
      return;
    }
    logger.error("Unable to connect to the urBackend API.");
  }
}
