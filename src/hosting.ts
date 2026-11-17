import type { HostingProvider, PullRequestStats, RemoteRepository } from "./types.js";

/**
 * Read-only access to the Git hosting provider (GitHub or GitLab) for
 * pull request / merge request counts.
 *
 * Only HTTP GET requests are ever sent. Tokens are optional and read from the
 * environment: GITHUB_TOKEN / GH_TOKEN for GitHub, GITLAB_TOKEN for GitLab.
 * Self-hosted instances are detected from the remote host name, or can be forced
 * with INSPECTOR_HOSTING_PROVIDER=github|gitlab.
 */

const REQUEST_TIMEOUT_MS = 10_000;

/** Parses https://host/a/b(.git), git@host:a/b(.git) and ssh://git@host[:port]/a/b(.git). */
export function parseRemoteUrl(
  url: string,
  providerOverride?: string,
): RemoteRepository | undefined {
  let host: string;
  let path: string;

  const scpLike = /^[\w.-]+@([^:/]+):(.+)$/.exec(url);
  if (scpLike) {
    [, host, path] = scpLike;
  } else {
    try {
      const parsed = new URL(url);
      host = parsed.hostname;
      path = parsed.pathname;
    } catch {
      return undefined;
    }
  }

  const projectPath = path.replace(/^\/+/, "").replace(/\.git$/, "").replace(/\/+$/, "");
  if (!projectPath.includes("/")) return undefined;

  const provider = detectProvider(host, providerOverride);
  if (!provider) return undefined;
  return { provider, host, projectPath };
}

function detectProvider(host: string, override?: string): HostingProvider | undefined {
  if (override === "github" || override === "gitlab") return override;
  if (host.includes("github")) return "github";
  if (host.includes("gitlab")) return "gitlab";
  return undefined;
}

type Fetch = typeof fetch;

async function httpGet(fetchImpl: Fetch, url: string, headers: Record<string, string>) {
  const response = await fetchImpl(url, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText} from ${new URL(url).host}`);
  }
  return response;
}

async function githubCount(
  fetchImpl: Fetch,
  remote: RemoteRepository,
  qualifier: "is:open" | "is:merged",
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const apiBase = remote.host === "github.com" ? "https://api.github.com" : `https://${remote.host}/api/v3`;
  const query = encodeURIComponent(`repo:${remote.projectPath} is:pr ${qualifier}`);
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "repository-inspector",
  };
  const token = env.GITHUB_TOKEN ?? env.GH_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await httpGet(fetchImpl, `${apiBase}/search/issues?q=${query}&per_page=1`, headers);
  const body = (await response.json()) as { total_count?: number };
  if (typeof body.total_count !== "number") throw new Error("GitHub response had no total_count");
  return body.total_count;
}

async function gitlabCount(
  fetchImpl: Fetch,
  remote: RemoteRepository,
  state: "opened" | "merged",
  env: NodeJS.ProcessEnv,
): Promise<number> {
  const project = encodeURIComponent(remote.projectPath);
  const url = `https://${remote.host}/api/v4/projects/${project}/merge_requests?state=${state}&per_page=1`;
  const headers: Record<string, string> = { Accept: "application/json" };
  if (env.GITLAB_TOKEN) headers["PRIVATE-TOKEN"] = env.GITLAB_TOKEN;
  const response = await httpGet(fetchImpl, url, headers);
  const total = response.headers.get("x-total");
  // GitLab omits X-Total for very large result sets (> 10,000).
  if (total === null) throw new Error("GitLab did not return an X-Total header (too many results?)");
  return Number(total);
}

export async function pullRequestStats(
  remoteUrl: string | undefined,
  options: { fetchImpl?: Fetch; env?: NodeJS.ProcessEnv } = {},
): Promise<PullRequestStats> {
  const env = options.env ?? process.env;
  const fetchImpl = options.fetchImpl ?? fetch;

  if (!remoteUrl) return { status: "unavailable", reason: "Repository has no 'origin' remote." };
  const remote = parseRemoteUrl(remoteUrl, env.INSPECTOR_HOSTING_PROVIDER);
  if (!remote) {
    return {
      status: "unavailable",
      reason: "Remote is not a recognised GitHub or GitLab URL (set INSPECTOR_HOSTING_PROVIDER to override).",
    };
  }

  try {
    if (remote.provider === "github") {
      const [open, merged] = await Promise.all([
        githubCount(fetchImpl, remote, "is:open", env),
        githubCount(fetchImpl, remote, "is:merged", env),
      ]);
      return { status: "ok", provider: "github", projectPath: remote.projectPath, label: "pull requests", open, merged };
    }
    const [open, merged] = await Promise.all([
      gitlabCount(fetchImpl, remote, "opened", env),
      gitlabCount(fetchImpl, remote, "merged", env),
    ]);
    return { status: "ok", provider: "gitlab", projectPath: remote.projectPath, label: "merge requests", open, merged };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "unavailable", reason: `Could not query ${remote.provider} API: ${message}` };
  }
}
