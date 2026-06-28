# @urbackend/cli

The official CLI for urBackend. Manage your projects, schemas, and more directly from your terminal.

## Installation

You can run the CLI directly using `npx`:

```bash
npx @urbackend/cli <command>
```

Or install it globally:

```bash
npm install -g @urbackend/cli
```

*(Note: The global binary is exposed as `ub`)*

## Authentication

Before using the CLI, you must authenticate using a Personal Access Token (PAT). You can generate a PAT in your urBackend Dashboard under your account settings.

### `ub login`
Authenticate your machine with urBackend using your Personal Access Token.
```bash
ub login
```

### `ub whoami`
Displays the currently authenticated developer profile.
```bash
ub whoami
```

### `ub logout`
Removes the stored credentials from your local machine.
```bash
ub logout
```

## Projects

Manage and navigate your urBackend projects.

### `ub project list` (alias: `ls`)
List all projects you have access to.
```bash
ub project list
```

### `ub project use [projectIdOrName]`
Set a project as the "active" project for subsequent CLI commands, so you don't need to specify the project ID every time.
```bash
ub project use "My Project"
```

### `ub project info [projectId]`
Show detailed information about the active project or a specific project.
```bash
ub project info
```

## Collections

Manage your database collections within the active project.

### `ub collection list` (alias: `col ls`)
List all collections inside the active project.
```bash
ub collection list
```
*Options:*
- `-p, --project <projectId>`: Target a specific project ID instead of the active one.

### `ub collection delete <collectionName>` (alias: `col rm`)
Delete a collection and all of its associated data. **Use with caution.**
```bash
ub collection delete "users"
```
*Options:*
- `-f, --force`: Skip the confirmation prompt.
- `-p, --project <projectId>`: Target a specific project ID.

## Utilities

### `ub status`
Show your account usage and recent API activity.
```bash
ub status
```

### `ub doctor`
Run diagnostic checks on your CLI setup and network connectivity to the urBackend servers.
```bash
ub doctor
```
*Options:*
- `--json`: Output the diagnostic results as a JSON string (useful for CI environments or AI agents).

## License

MIT
