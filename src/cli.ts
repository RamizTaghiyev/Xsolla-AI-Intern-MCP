#!/usr/bin/env node
import { writeFileSync } from "node:fs";
import {
  ALL_INSIGHT_SECTIONS,
  authorContributionsReport,
  repositoryInsightsReport,
  reviewRepository,
} from "./core.js";
import type { InsightSection } from "./types.js";

type Args = {
  command: string;
  repositoryPath?: string;
  baseRef?: string;
  format?: "markdown" | "json";
  validations: string[];
  sections: string[];
  author?: string;
  since?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = { command: argv[0] ?? "", validations: [], sections: [] };
  for (let index = 1; index < argv.length; index++) {
    const token = argv[index];
    if (token === "--repo") {
      args.repositoryPath = argv[++index]?.split(" ")[0];
    } else if (token === "--base-ref") {
      args.baseRef = argv[++index];
    } else if (token === "--format") {
      args.format = argv[++index] as Args["format"];
    } else if (token === "--validate") {
      args.validations.push(argv[++index]);
    } else if (token === "--section") {
      args.sections.push(argv[++index]);
    } else if (token === "--author") {
      args.author = argv[++index];
    } else if (token === "--since") {
      args.since = argv[++index];
    }
  }
  return args;
}

const USAGE = `Usage (every command writes review-report.md, or review-report.json with --format json):
  inspector review        --repo <path> [--base-ref <ref>] [--validate <command>]
  inspector insights      --repo <path> [--section pull_requests|contributors|branches]... [--base-ref <ref>] [--format markdown|json]
  inspector contributions --repo <path> --author <name-or-email> [--since <date>] [--format markdown|json]`;

function usageError(message?: string): void {
  if (message) console.error(message);
  console.error(USAGE);
  process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.repositoryPath) return usageError();
  if (args.format && args.format !== "markdown" && args.format !== "json") {
    return usageError(`Unknown --format: ${args.format}`);
  }

  let report: string;
  switch (args.command) {
    case "review":
      report = await reviewRepository({
        repositoryPath: args.repositoryPath,
        baseRef: args.baseRef,
        validationCommands: args.validations,
        format: args.format,
      });
      break;
    case "insights": {
      const unknown = args.sections.filter((s) => !ALL_INSIGHT_SECTIONS.includes(s as InsightSection));
      if (unknown.length) return usageError(`Unknown --section: ${unknown.join(", ")}`);
      report = await repositoryInsightsReport(
        {
          repositoryPath: args.repositoryPath,
          sections: args.sections as InsightSection[],
          baseRef: args.baseRef,
        },
        args.format,
      );
      break;
    }
    case "contributions":
      if (!args.author) return usageError("--author is required");
      report = authorContributionsReport(args.repositoryPath, args.author, {
        since: args.since,
        format: args.format,
      });
      break;
    default:
      return usageError();
  }

  // Every command writes its report to the same file, so all output is read the same way.
  const outputFile = args.format === "json" ? "review-report.json" : "review-report.md";
  writeFileSync(outputFile, report.endsWith("\n") ? report : `${report}\n`, "utf8");
  console.log(`Report written to ${outputFile}`);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
