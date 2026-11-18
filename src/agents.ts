import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverEntry = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));

async function main() {
  const [repoArg, ...questionParts] = process.argv.slice(2);
  const question = questionParts.join(" ").trim();

  if (!repoArg || !question) {
    throw new Error('Usage: npm run agent -- "<repo-path>" "<question>"');
  }

  const repositoryPath = resolve(repoArg);

  for await (const message of query({
    prompt: question,
    options: {
      cwd: projectRoot,
      systemPrompt: [
        "You are a Git repository inspection assistant.",
        `Always pass repo_path set to ${JSON.stringify(repositoryPath)}.`,
        "Use the tool before making claims about repository changes.",
        "Report tool errors and explain what the report can establish.",
      ].join("\n"),
      tools: [],
      allowedTools: ["mcp__inspector__review_repository", "mcp__inspector__repository_insights", "mcp__inspector__user_contributions"],
      settingSources: [],
      strictMcpConfig: true,
      maxTurns: 5,
      mcpServers: {
        inspector: {
          type: "stdio",
          command: process.execPath,
          args: ["--import", "tsx", serverEntry],
          env: { INSPECTOR_AGENT_REPO: repositoryPath },
        },
      },
    },
  })) {
    if (message.type !== "result") continue;

    if (message.subtype !== "success") {
      throw new Error(`Claude agent stopped with ${message.subtype}`);
    }

    console.log(message.result);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});