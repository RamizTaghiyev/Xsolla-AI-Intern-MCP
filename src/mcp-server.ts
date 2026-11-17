#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { authorContributionsReport, repositoryInsightsReport, reviewRepository } from "./core.js";

const server = new McpServer({ name: "repository-inspector", version: "2.0.0" });

server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  {
    repoPath: z.string().describe("Repository path to inspect."),
    baseRef: z.string().optional(),
    validationCommands: z.array(z.string()).optional(),
  },
  async (input: any) => {
    const report = await reviewRepository({
      repositoryPath: input.repoPath,
      baseRef: input.baseRef,
      validationCommands: input.validationCommands,
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
    repoPath: z.string().describe("Path to a local Git working tree."),
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
        { repositoryPath: input.repoPath, sections: input.sections, baseRef: input.base_ref },
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
    repoPath: z.string().describe("Path to a local Git working tree."),
    author: z.string().min(1).describe("Author name or email (substring, case-insensitive)."),
    since: z.string().optional().describe('Only commits after this date, e.g. "2025-01-01" or "3 months ago".'),
    format: z.enum(["markdown", "json"]).optional().describe("Output format. Defaults to markdown."),
  },
  async (input) => {
    try {
      const text = authorContributionsReport(input.repoPath, input.author, {
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