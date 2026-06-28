import { authenticate } from "../../services/auth.service.js";
import { saveToken } from "../../core/config.js";
import { isValidPAT } from "../../utils/token.js";
import { promptSecret } from "../../utils/prompt.js";
import { label } from "../../utils/format.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function loginCommand(): Promise<void> {
  console.log("Generate a Personal Access Token from the urBackend dashboard:");
  console.log("  Settings → Access Tokens → New Token\n");

  const token = await promptSecret("Paste your Personal Access Token: ");

  if (!isValidPAT(token)) {
    logger.error(
      "Invalid token format. urBackend PATs start with 'ubpat_' followed by at least 10 characters.",
    );
      process.exitCode = 1;
    return;
  }

  try {
    const profile = await authenticate(token);

     try {
      saveToken(token);
    } catch {
      logger.error("Authenticated, but failed to persist the token locally.");
      process.exitCode = 1;
     return;
   }

    logger.success("Logged in successfully.\n");
    console.log(`${label("Email")} ${profile.developer.email}`);
    console.log(`${label("Plan")} ${profile.developer.plan}`);

    if (profile.developer.githubUsername) {
      console.log(`${label("GitHub")} ${profile.developer.githubUsername}`);
    }

    if (profile.auth.scopes.length > 0) {
      console.log(`${label("Scopes")} ${profile.auth.scopes.join(", ")}`);
    }
  } catch (error) {
    if (error instanceof APIError) {
      if (error.status === 401) {
        logger.error("Invalid or expired token. Generate a new one from the dashboard.");
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
