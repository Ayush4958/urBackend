export interface CLIDeveloper {
  id: string;
  email: string;
  plan: "free" | "pro";
  githubUsername: string | null;
  avatarUrl: string | null;
}

export interface CLIAuth {
  scopes: string[];
  tokenType: "human" | "agent";
}

export interface CLIProfile {
  developer: CLIDeveloper;
  auth: CLIAuth;
}

export interface PAT {
  id: string;
  suffix: string;
  label: string;
  type: "human" | "agent";
  scopes: string[];
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  lastUsedIp: string | null;
}

export interface PATListResponse {
  pats: PAT[];
}

export interface PATCreateResponse {
  rawToken: string;
  pat: {
    suffix: string;
    label: string;
    type: string;
    scopes: string[];
    expiresAt: string;
  };
}
