import { changedFiles } from "./git.js";
import { markdownReport, jsonReport } from "./report.js";
import type { ReviewRequest } from "./types.js";
import { runValidations } from "./validation.js";


export async function reviewRepository(request: ReviewRequest): Promise<string> {
  const format = request.format ?? "markdown";
  if (format !== "markdown" && format !== "json") {
    throw new Error(`Unsupported format "${format}". Use "markdown" or "json".`);
  }

  const files = changedFiles(request.repositoryPath, request.baseRef);
  const validations = await runValidations(
    request.validationCommands ?? [],
    request.repositoryPath,
  );

  if (format === "markdown") {
    return markdownReport({
      repositoryPath: request.repositoryPath,
      changedFiles: files,
      validationResults: validations,
    });
  }

  return jsonReport({
    repositoryPath: request.repositoryPath,
    changedFiles: files,
    validationResults: validations,
  });
}
