import fs from "node:fs";
import path from "node:path";
import { listProjects } from "../../services/project.service.js";
import { getToken } from "../../core/config.js";
import { saveWorkspaceConfig, getWorkspaceDir } from "../../core/workspace.js";
import { prompt } from "../../utils/prompt.js";
import { APIError } from "../../core/errors.js";
import { logger } from "../../core/logger.js";

export async function initCommand(projectIdOrName?: string): Promise<void> {
  const token = getToken();
  if (!token) {
    logger.error("You are not logged in. Run 'ub login' first.");
    process.exitCode = 1;
    return;
  }

  try {
    const projects = await listProjects();

    if (projects.length === 0) {
      logger.info("No projects found. Create one at dashboard.urbackend.bitbros.in");
      return;
    }

    let selectedId: string | undefined;
    let selectedName: string | undefined;

    if (projectIdOrName) {
      const match = projects.find(
        (p) =>
          p._id === projectIdOrName ||
          p.name.toLowerCase() === projectIdOrName.toLowerCase(),
      );
      if (!match) {
        logger.error(`No project found matching "${projectIdOrName}".`);
        logger.info("Run 'ub project list' to see available projects.");
        process.exitCode = 1;
        return;
      }
      selectedId = match._id;
      selectedName = match.name;
    } else {
      console.log("\nAvailable projects:\n");
      projects.forEach((p, i) => {
        console.log(`  [${i + 1}] ${p.name} (${p._id})`);
      });
      console.log();

      const answer = await prompt("Select a project to link this directory to: ");
      if (!/^\d+$/.test(answer)) {
        logger.error("Invalid selection.");
        process.exitCode = 1;
        return;
      }
      const index = Number(answer) - 1;
      if (isNaN(index) || index < 0 || index >= projects.length) {
        logger.error("Invalid selection.");
        process.exitCode = 1;
        return;
      }

      selectedId = projects[index]._id;
      selectedName = projects[index].name;
    }

    saveWorkspaceConfig({ projectId: selectedId, projectName: selectedName });

    // Update .gitignore if it exists
    const gitignorePath = path.join(process.cwd(), ".gitignore");
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, "utf8");
      const lines = gitignore.split(/\r?\n/).map(line => line.trim());
      if (!lines.includes(".ub") && !lines.includes("/.ub") && !lines.includes(".ub/")) {
        fs.appendFileSync(gitignorePath, "\n# urBackend local workspace\n.ub\n", "utf8");
        logger.info("Added .ub to .gitignore");
      }
    } else {
      fs.writeFileSync(gitignorePath, "# urBackend local workspace\n.ub\n", "utf8");
      logger.info("Created .gitignore and added .ub");
    }

    logger.success(`Successfully initialized urBackend workspace in .ub/`);
    logger.info(`Linked to project: ${selectedName} (${selectedId})`);
    console.log(`\nNext, run 'ub pull' to download your schemas.`);
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
