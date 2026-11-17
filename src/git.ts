import { execFileSync } from "node:child_process";
import type {
  BranchInfo,
  ChangedFile,
  CommitSummary,
  Contributor,
  UserContributions,
} from "./types.js";

/**
 * Git subcommands this tool is allowed to run. Every one of them is read-only:
 * nothing here can create commits, move refs, push, fetch, or delete anything.
 */
const READ_ONLY_SUBCOMMANDS = new Set([
  "diff",
  "log",
  "for-each-ref",
  "rev-parse",
  "remote",
]);

function assertReadOnly(args: string[]): void {
  const [subcommand, action] = args;
  if (!READ_ONLY_SUBCOMMANDS.has(subcommand)) {
    throw new Error(`Refusing to run non read-only git command: git ${subcommand}`);
  }
  // `git remote` can add/remove remotes; only `get-url` is allowed.
  if (subcommand === "remote" && action !== "get-url") {
    throw new Error(`Refusing to run git remote ${action}: only 'get-url' is allowed`);
  }
}

function git(repositoryPath: string, args: string[]): string {
  assertReadOnly(args);
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    maxBuffer: 64 * 1024 * 1024,
    // GIT_OPTIONAL_LOCKS=0 stops git from opportunistically refreshing the index on read commands.
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0" },
  }).trim();
}

function tryGit(repositoryPath: string, args: string[]): string | undefined {
  try {
    return git(repositoryPath, args);
  } catch {
    return undefined;
  }
}

/** Rejects values that git would interpret as options (e.g. "--output=/etc/x"). */
function assertNotOption(value: string, label: string): void {
  if (value.startsWith("-")) {
    throw new Error(`Invalid ${label}: must not start with '-'`);
  }
}

const FIELD = "\x1f"; // unit separator between fields
const RECORD = "\x1e"; // record separator between commits

export function assertGitRepository(repositoryPath: string): void {
  if (tryGit(repositoryPath, ["rev-parse", "--is-inside-work-tree"]) !== "true") {
    throw new Error(`Not a Git working tree: ${repositoryPath}`);
  }
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  assertNotOption(base, "base ref");
  const output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`]);

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}

export function remoteUrl(repositoryPath: string, remote = "origin"): string | undefined {
  assertNotOption(remote, "remote name");
  return tryGit(repositoryPath, ["remote", "get-url", remote]) || undefined;
}

// ---------------------------------------------------------------------------
// Contributors
// ---------------------------------------------------------------------------

export function parseContributors(output: string): Contributor[] {
  const byEmail = new Map<string, Contributor>();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const [name, email, date] = line.split(FIELD);
    const key = (email || name).toLowerCase();
    const existing = byEmail.get(key);
    if (!existing) {
      byEmail.set(key, { name, email, commits: 1, firstCommit: date, lastCommit: date });
      continue;
    }
    existing.commits++;
    if (date < existing.firstCommit) existing.firstCommit = date;
    if (date > existing.lastCommit) existing.lastCommit = date;
  }
  return [...byEmail.values()].sort((a, b) => b.commits - a.commits || a.name.localeCompare(b.name));
}

/** All commit authors reachable from any branch (respects .mailmap via %aN/%aE). */
export function contributors(repositoryPath: string): Contributor[] {
  const output = git(repositoryPath, [
    "log",
    "--all",
    `--format=%aN${FIELD}%aE${FIELD}%aI`,
  ]);
  return parseContributors(output);
}

// ---------------------------------------------------------------------------
// A specific user's contributions
// ---------------------------------------------------------------------------

export function parseUserContributions(author: string, output: string, recentLimit = 20): UserContributions {
  const commits: CommitSummary[] = [];
  const fileChanges = new Map<string, number>();
  let additions = 0;
  let deletions = 0;

  for (const record of output.split(RECORD)) {
    const trimmed = record.replace(/^\n+/, "");
    if (!trimmed) continue;
    const [header, ...statLines] = trimmed.split("\n");
    const [hash, name, email, date, subject] = header.split(FIELD);
    let commitAdditions = 0;
    let commitDeletions = 0;
    for (const statLine of statLines) {
      if (!statLine) continue;
      const [added, deleted, ...pathParts] = statLine.split("\t");
      const path = pathParts.join("\t");
      // Binary files are reported as "-" by --numstat.
      const a = added === "-" ? 0 : Number(added);
      const d = deleted === "-" ? 0 : Number(deleted);
      commitAdditions += a;
      commitDeletions += d;
      fileChanges.set(path, (fileChanges.get(path) ?? 0) + 1);
    }
    additions += commitAdditions;
    deletions += commitDeletions;
    commits.push({ hash, name, email, date, subject, additions: commitAdditions, deletions: commitDeletions });
  }

  const topFiles = [...fileChanges.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([path, commitCount]) => ({ path, commits: commitCount }));

  return {
    author,
    commits: commits.length,
    additions,
    deletions,
    filesTouched: fileChanges.size,
    firstCommit: commits.at(-1)?.date,
    lastCommit: commits[0]?.date,
    topFiles,
    recentCommits: commits.slice(0, recentLimit),
  };
}

/**
 * Commits on any branch whose author name or email contains `author`
 * (case-insensitive, matched as a fixed string, not a regex).
 */
export function userContributions(
  repositoryPath: string,
  author: string,
  options: { since?: string } = {},
): UserContributions {
  if (!author.trim()) throw new Error("Author must not be empty");
  const args = [
    "log",
    "--all",
    "--no-merges",
    "--regexp-ignore-case",
    "--fixed-strings",
    `--author=${author}`,
    `--format=${RECORD}%H${FIELD}%aN${FIELD}%aE${FIELD}%aI${FIELD}%s`,
    "--numstat",
  ];
  if (options.since) {
    assertNotOption(options.since, "since");
    args.push(`--since=${options.since}`);
  }
  return parseUserContributions(author, git(repositoryPath, args));
}

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

export function parseBranches(output: string): BranchInfo[] {
  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [refname, name, lastCommit, lastCommitDate] = line.split(FIELD);
      return {
        name,
        type: refname.startsWith("refs/remotes/") ? ("remote" as const) : ("local" as const),
        lastCommit,
        lastCommitDate,
        refname,
      };
    })
    // Skip symbolic remote HEAD pointers like refs/remotes/origin/HEAD.
    .filter((branch) => !branch.refname.endsWith("/HEAD"))
    .map(({ refname: _refname, ...branch }) => branch);
}

/** Lists local and remote-tracking branches, most recently updated first. */
export function branches(repositoryPath: string): BranchInfo[] {
  const output = git(repositoryPath, [
    "for-each-ref",
    "--sort=-committerdate",
    `--format=%(refname)%1f%(refname:short)%1f%(objectname:short)%1f%(committerdate:iso-strict)`,
    "refs/heads",
    "refs/remotes",
  ]);
  return parseBranches(output);
}
