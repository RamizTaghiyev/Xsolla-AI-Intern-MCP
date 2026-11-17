import type { RepositoryInsights, UserContributions } from "./types.js";

/** Escapes characters that would break a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function day(isoDate: string | undefined): string {
  return isoDate ? isoDate.slice(0, 10) : "-";
}

export function insightsMarkdown(insights: RepositoryInsights): string {
  const lines = [`# Repository Insights: ${insights.repositoryPath}`];

  if (insights.pullRequests) {
    const pr = insights.pullRequests;
    lines.push("", "## Pull / merge requests");
    if (pr.status === "ok") {
      lines.push(
        `Provider: ${pr.provider} (\`${pr.projectPath}\`)`,
        "",
        `- Open ${pr.label}: **${pr.open}**`,
        `- Merged ${pr.label}: **${pr.merged}**`,
      );
    } else {
      lines.push(`_Unavailable: ${pr.reason}_`);
    }
  }

  if (insights.contributors) {
    const list = insights.contributors;
    lines.push("", "## Contributors", "", `Total contributors: **${list.length}**`);
    if (list.length > 0) {
      lines.push("", "| Name | Email | Commits | First commit | Last commit |", "| --- | --- | ---: | --- | --- |");
      for (const c of list) {
        lines.push(`| ${cell(c.name)} | ${cell(c.email)} | ${c.commits} | ${day(c.firstCommit)} | ${day(c.lastCommit)} |`);
      }
    }
  }

  if (insights.branches) {
    const { baseRef, branches } = insights.branches;
    const local = branches.filter((b) => b.type === "local").length;
    const remote = branches.length - local;
    lines.push(
      "",
      "## Branches",
      "",
      `Total branches: **${branches.length}** (${local} local, ${remote} remote-tracking)`,
      `Base branch used for creator detection: ${baseRef ? `\`${baseRef}\`` : "_none found_"}`,
      "",
      "> Git does not record who created a branch. \"Created by\" is the author of the first",
      "> commit unique to the branch; if there is none, the author of the branch tip (marked *).",
    );
    if (branches.length > 0) {
      lines.push("", "| Branch | Type | Created by | Last commit | Last commit date |", "| --- | --- | --- | --- | --- |");
      for (const b of branches) {
        const creator = b.createdByMethod === "tip-author" ? `${b.createdBy} *` : b.createdBy;
        lines.push(`| ${cell(b.name)} | ${b.type} | ${cell(creator)} | \`${b.lastCommit}\` | ${day(b.lastCommitDate)} |`);
      }
    }
  }

  return lines.join("\n");
}

export function contributionsMarkdown(repositoryPath: string, c: UserContributions): string {
  const lines = [`# Contributions by "${c.author}" in ${repositoryPath}`, ""];
  if (c.commits === 0) {
    lines.push("No non-merge commits found for this author (name or email, case-insensitive).");
    return lines.join("\n");
  }
  lines.push(
    `- Commits (excluding merges): **${c.commits}**`,
    `- Lines added / deleted: **+${c.additions} / -${c.deletions}**`,
    `- Files touched: **${c.filesTouched}**`,
    `- Active: ${day(c.firstCommit)} → ${day(c.lastCommit)}`,
    "",
    "## Most-touched files",
    "",
    "| File | Commits |",
    "| --- | ---: |",
    ...c.topFiles.map((f) => `| ${cell(f.path)} | ${f.commits} |`),
    "",
    `## Recent commits (latest ${c.recentCommits.length})`,
    "",
    "| Date | Commit | Author | Subject | +/- |",
    "| --- | --- | --- | --- | ---: |",
    ...c.recentCommits.map(
      (commit) =>
        `| ${day(commit.date)} | \`${commit.hash.slice(0, 8)}\` | ${cell(commit.name)} | ${cell(commit.subject)} | +${commit.additions}/-${commit.deletions} |`,
    ),
  );
  return lines.join("\n");
}
