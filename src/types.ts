export type ChangedFile = {
  path: string;
  status: "added" | "modified" | "deleted" | "untracked";
};

export type ValidationResult = {
  command: string;
  status: "passed" | "failed";
  output: string;
};

export type ReviewRequest = {
  repositoryPath: string;
  baseRef?: string;
  validationCommands?: string[];
  format?: "markdown" | "json";
};

// ---------------------------------------------------------------------------
// Repository insights (read-only)
// ---------------------------------------------------------------------------

export type Contributor = {
  name: string;
  email: string;
  commits: number;
  firstCommit: string;
  lastCommit: string;
};

export type CommitSummary = {
  hash: string;
  name: string;
  email: string;
  date: string;
  subject: string;
  additions: number;
  deletions: number;
};

export type UserContributions = {
  author: string;
  commits: number;
  additions: number;
  deletions: number;
  filesTouched: number;
  firstCommit?: string;
  lastCommit?: string;
  topFiles: { path: string; commits: number }[];
  recentCommits: CommitSummary[];
};

export type BranchInfo = {
  name: string;
  type: "local" | "remote";
  lastCommit: string;
  lastCommitDate: string;
};

export type HostingProvider = "github" | "gitlab";

export type RemoteRepository = {
  provider: HostingProvider;
  host: string;
  /** "owner/repo" on GitHub, "group/subgroup/project" on GitLab. */
  projectPath: string;
};

export type PullRequestStats =
  | {
      status: "ok";
      provider: HostingProvider;
      projectPath: string;
      /** "pull requests" on GitHub, "merge requests" on GitLab. */
      label: string;
      open: number;
      merged: number;
    }
  | { status: "unavailable"; reason: string };

export type InsightSection = "pull_requests" | "contributors" | "branches";

export type InsightsRequest = {
  repositoryPath: string;
  sections?: InsightSection[];
};

export type RepositoryInsights = {
  repositoryPath: string;
  pullRequests?: PullRequestStats;
  contributors?: Contributor[];
  branches?: BranchInfo[];
};
