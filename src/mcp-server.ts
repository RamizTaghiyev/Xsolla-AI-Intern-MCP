#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authorContributionsReport, repositoryInsightsReport, reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

const agentRepository = process.env.INSPECTOR_AGENT_REPO;

server.tool(
  "review_repository",
  "Lists files changed between a Git base ref and HEAD.",
  {
    repo_path: z.string().describe("Absolute path to the Git repository."),
    baseRef: z.string().optional(),
  },
  async ({ repo_path, baseRef }) => {
    if (agentRepository && repo_path !== agentRepository) {
      return {
        isError: true,
        content: [{ type: "text", text: "Use the repository selected at startup." }],
      };
    }

    const report = await reviewRepository({
      repositoryPath: agentRepository ?? repo_path,
      baseRef,
    });

    return { content: [{ type: "text", text: report }] };
  },
);

function toolError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return { isError: true, content: [{ type: "text" as const, text: message }] };
}

server.tool(
  "repository_insights",
  "Read-only repository statistics: open and merged pull requests (GitHub) or merge requests (GitLab), " +
    "contributors with commit counts, and branches with their likely creator. Never modifies the repository.",
  {
    repo_path: z.string().describe("Path to a local Git working tree."),
    sections: z
      .array(z.enum(["pull_requests", "contributors", "branches"]))
      .optional()
      .describe("Sections to include. Defaults to all."),
    base_ref: z
      .string()
      .optional()
      .describe("Base branch used to guess branch creators. Defaults to origin/HEAD, main or master."),
    format: z.enum(["markdown", "json"]).optional().describe("Output format. Defaults to markdown."),
  },
  async (input) => {
    try {
      const text = await repositoryInsightsReport(
        { repositoryPath: input.repo_path, sections: input.sections, baseRef: input.base_ref },
        input.format,
      );
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return toolError(error);
    }
  },
);

server.tool(
  "user_contributions",
  "Read-only summary of one author's contributions across all branches: commit count, lines added/deleted, " +
    "most-touched files and recent commits. Matches author name or email, case-insensitive.",
  {
    repo_path: z.string().describe("Path to a local Git working tree."),
    author: z.string().min(1).describe("Author name or email (substring, case-insensitive)."),
    since: z.string().optional().describe('Only commits after this date, e.g. "2025-01-01" or "3 months ago".'),
    format: z.enum(["markdown", "json"]).optional().describe("Output format. Defaults to markdown."),
  },
  async (input) => {
    try {
      const text = authorContributionsReport(input.repo_path, input.author, {
        since: input.since,
        format: input.format,
      });
      return { content: [{ type: "text", text }] };
    } catch (error) {
      return toolError(error);
    }
  },
);

await server.connect(new StdioServerTransport());