import {
  assertGitRepository,
  branches,
  changedFiles,
  contributors,
  remoteUrl,
  userContributions,
} from "./git.js";
import { pullRequestStats } from "./hosting.js";
import { contributionsMarkdown, insightsMarkdown } from "./insights-report.js";
import { markdownReport } from "./report.js";
import type {
  InsightSection,
  InsightsRequest,
  RepositoryInsights,
  ReviewRequest,
  UserContributions,
} from "./types.js";
import { runValidations } from "./validation.js";

export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const files = changedFiles(request.repositoryPath, request.baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );
  return markdownReport({
    repositoryPath: request.repositoryPath,
    changedFiles: files,
    validationResults: validations,
  });
}

export const ALL_INSIGHT_SECTIONS: InsightSection[] = ["pull_requests", "contributors", "branches"];

/** Read-only repository statistics: PR/MR counts, contributors and branches. */
export async function repositoryInsights(request: InsightsRequest): Promise<RepositoryInsights> {
  assertGitRepository(request.repositoryPath);
  const sections = new Set(request.sections?.length ? request.sections : ALL_INSIGHT_SECTIONS);
  const insights: RepositoryInsights = { repositoryPath: request.repositoryPath };

  if (sections.has("pull_requests")) {
    insights.pullRequests = await pullRequestStats(remoteUrl(request.repositoryPath));
  }
  if (sections.has("contributors")) {
    insights.contributors = contributors(request.repositoryPath);
  }
  if (sections.has("branches")) {
    insights.branches = branches(request.repositoryPath, { baseRef: request.baseRef });
  }
  return insights;
}

export async function repositoryInsightsReport(
  request: InsightsRequest,
  format: "markdown" | "json" = "markdown",
): Promise<string> {
  const insights = await repositoryInsights(request);
  return format === "json" ? JSON.stringify(insights, null, 2) : insightsMarkdown(insights);
}

export function authorContributions(
  repositoryPath: string,
  author: string,
  options: { since?: string } = {},
): UserContributions {
  assertGitRepository(repositoryPath);
  return userContributions(repositoryPath, author, options);
}

export function authorContributionsReport(
  repositoryPath: string,
  author: string,
  options: { since?: string; format?: "markdown" | "json" } = {},
): string {
  const result = authorContributions(repositoryPath, author, options);
  return options.format === "json"
    ? JSON.stringify(result, null, 2)
    : contributionsMarkdown(repositoryPath, result);
}
