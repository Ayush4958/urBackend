export interface CLIConfig {
  apiBase: string;
  pat?: string;
  currentProject?: string;
}

export interface WorkspaceConfig {
  projectId?: string;
  projectName?: string;
}
