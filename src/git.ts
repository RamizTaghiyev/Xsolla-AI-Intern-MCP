import { execFileSync } from "node:child_process";
import type { ChangedFile } from "./types.js";

function git(repositoryPath: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd: repositoryPath,
    encoding: "utf8",
  }).trim();
}

export function changedFiles(repositoryPath: string, baseRef?: string): ChangedFile[] {
  const base = baseRef ?? "main";
  
  let output: string;
  try {
    output = git(repositoryPath, ["diff", "--name-status", `${base}...HEAD`]);
  } catch (err: any) {
    throw new Error(
      `Could not diff against base ref "${base}". ` +
      `Make sure that branch exists, or pass --base-ref <branch>.`
    );
  }

  return output
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      const [code, ...pathParts] = line.split("\t");
      const status = code === "A" ? "added" : code === "D" ? "deleted" : "modified";
      return { path: pathParts.join("\t"), status };
    });
}