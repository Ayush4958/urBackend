import { getProfile } from "../../services/auth.service.js";
import { getToken, getCurrentProject } from "../../core/config.js";
import { label, formatDate } from "../../utils/format.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function whoamiCommand(): Promise<void> {
  const token = getToken();

  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
     process.exitCode = 1;
    return;
  }

  try {
    const profile = await getProfile();

    console.log(`${label("Email")} ${profile.developer.email}`);
    console.log(`${label("Plan")} ${profile.developer.plan}`);

    if (profile.developer.githubUsername) {
      console.log(`${label("GitHub")} ${profile.developer.githubUsername}`);
    }

    console.log(`${label("Token type")} ${profile.auth.tokenType}`);

    if (profile.auth.scopes.length > 0) {
      console.log(`${label("Scopes")} ${profile.auth.scopes.join(", ")}`);
    }

    const currentProject = getCurrentProject();
    if (currentProject) {
      console.log(`${label("Project")} ${currentProject}`);
    }
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Token is invalid or expired. Run 'ub login' to re-authenticate.");
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
