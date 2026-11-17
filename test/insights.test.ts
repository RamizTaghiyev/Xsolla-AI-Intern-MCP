import { describe, expect, it, vi } from "vitest";
import {
  branches,
  parseBranches,
  parseContributors,
  parseUserContributions,
  userContributions,
} from "../src/git.js";
import { parseRemoteUrl, pullRequestStats } from "../src/hosting.js";
import { contributionsMarkdown, insightsMarkdown } from "../src/report.js";

const F = "\x1f";
const R = "\x1e";

describe("parseContributors", () => {
  it("groups commits by email (case-insensitive) and tracks first/last commit", () => {
    const output = [
      `Alice${F}alice@x.io${F}2025-03-01T10:00:00+00:00`,
      `Bob${F}bob@x.io${F}2025-02-01T10:00:00+00:00`,
      `Alice${F}ALICE@x.io${F}2025-01-01T10:00:00+00:00`,
    ].join("\n");

    const result = parseContributors(output);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      name: "Alice",
      commits: 2,
      firstCommit: "2025-01-01T10:00:00+00:00",
      lastCommit: "2025-03-01T10:00:00+00:00",
    });
    expect(result[1]).toMatchObject({ name: "Bob", commits: 1 });
  });

  it("returns an empty list for a repository with no commits", () => {
    expect(parseContributors("")).toEqual([]);
  });
});

describe("parseUserContributions", () => {
  it("sums numstat lines, treats binary files as 0 and ranks touched files", () => {
    const output =
      `${R}bbb${F}Alice${F}a@x.io${F}2025-02-01T00:00:00Z${F}Second | change\n\n` +
      `10\t2\tsrc/a.ts\n-\t-\tlogo.png\n` +
      `${R}aaa${F}Alice${F}a@x.io${F}2025-01-01T00:00:00Z${F}First\n\n` +
      `5\t0\tsrc/a.ts\n1\t1\tsrc/b.ts\n`;

    const result = parseUserContributions("alice", output);

    expect(result).toMatchObject({
      commits: 2,
      additions: 16,
      deletions: 3,
      filesTouched: 3,
      firstCommit: "2025-01-01T00:00:00Z",
      lastCommit: "2025-02-01T00:00:00Z",
    });
    expect(result.topFiles[0]).toEqual({ path: "src/a.ts", commits: 2 });
    expect(result.recentCommits[0]).toMatchObject({ hash: "bbb", additions: 10, deletions: 2 });
  });

  it("escapes pipes in commit subjects when rendering Markdown", () => {
    const output = `${R}bbb${F}Alice${F}a@x.io${F}2025-02-01T00:00:00Z${F}Second | change\n\n1\t0\tx\n`;
    const markdown = contributionsMarkdown("/repo", parseUserContributions("alice", output));
    expect(markdown).toContain("Second \\| change");
  });

  it("reports no commits clearly", () => {
    const markdown = contributionsMarkdown("/repo", parseUserContributions("nobody", ""));
    expect(markdown).toContain("No non-merge commits found");
  });
});

describe("parseBranches", () => {
  it("separates local and remote branches and drops origin/HEAD", () => {
    const output = [
      `refs/heads/main${F}main${F}abc1234${F}Alice${F}<a@x.io>${F}2025-01-01T00:00:00Z`,
      `refs/remotes/origin/HEAD${F}origin${F}abc1234${F}Alice${F}<a@x.io>${F}2025-01-01T00:00:00Z`,
      `refs/remotes/origin/feature${F}origin/feature${F}def5678${F}Bob${F}<b@x.io>${F}2025-01-02T00:00:00Z`,
    ].join("\n");

    const result = parseBranches(output);

    expect(result.map((b) => [b.name, b.type])).toEqual([
      ["main", "local"],
      ["origin/feature", "remote"],
    ]);
    expect(result[1].lastCommitAuthor).toBe("Bob <b@x.io>");
  });
});

describe("read-only guards", () => {
  it("rejects option-like author/since/base values before running git", () => {
    expect(() => userContributions(".", "alice", { since: "--output=/tmp/x" })).toThrow(/must not start/);
    expect(() => branches(".", { baseRef: "--output=/tmp/x" })).toThrow(/must not start/);
    expect(() => userContributions(".", "  ")).toThrow(/must not be empty/);
  });
});

describe("parseRemoteUrl", () => {
  it.each([
    ["https://github.com/acme/tool.git", { provider: "github", host: "github.com", projectPath: "acme/tool" }],
    ["git@github.com:acme/tool.git", { provider: "github", host: "github.com", projectPath: "acme/tool" }],
    ["git@gitlab.com:group/sub/proj.git", { provider: "gitlab", host: "gitlab.com", projectPath: "group/sub/proj" }],
    ["ssh://git@gitlab.example.com:2222/team/app.git", { provider: "gitlab", host: "gitlab.example.com", projectPath: "team/app" }],
  ])("parses %s", (url, expected) => {
    expect(parseRemoteUrl(url)).toEqual(expected);
  });

  it("uses the provider override for unrecognised self-hosted hosts", () => {
    expect(parseRemoteUrl("https://git.corp.local/team/app.git")).toBeUndefined();
    expect(parseRemoteUrl("https://git.corp.local/team/app.git", "gitlab")?.provider).toBe("gitlab");
  });
});

describe("pullRequestStats", () => {
  it("queries GitHub search with GET only and returns open/merged counts", async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.method).toBe("GET");
      const total = decodeURIComponent(url).includes("is:open") ? 3 : 42;
      return new Response(JSON.stringify({ total_count: total }), { status: 200 });
    });

    const stats = await pullRequestStats("https://github.com/acme/tool.git", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: { GITHUB_TOKEN: "t" },
    });

    expect(stats).toEqual({
      status: "ok",
      provider: "github",
      projectPath: "acme/tool",
      label: "pull requests",
      open: 3,
      merged: 42,
    });
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer t");
  });

  it("reads GitLab merge request totals from the X-Total header", async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain("/api/v4/projects/group%2Fsub%2Fproj/merge_requests");
      const total = url.includes("state=opened") ? "7" : "120";
      return new Response("[]", { status: 200, headers: { "x-total": total } });
    });

    const stats = await pullRequestStats("git@gitlab.com:group/sub/proj.git", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
    });

    expect(stats).toMatchObject({ status: "ok", label: "merge requests", open: 7, merged: 120 });
  });

  it("degrades to 'unavailable' instead of throwing on API errors", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 404, statusText: "Not Found" }));
    const stats = await pullRequestStats("https://github.com/acme/private.git", {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      env: {},
    });
    expect(stats).toMatchObject({ status: "unavailable" });
    expect(insightsMarkdown({ repositoryPath: "/r", pullRequests: stats })).toContain("Unavailable");
  });

  it("reports a missing remote", async () => {
    expect(await pullRequestStats(undefined)).toMatchObject({ status: "unavailable" });
  });
});
