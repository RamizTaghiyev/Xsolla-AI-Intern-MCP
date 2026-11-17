import { execFile } from "node:child_process";       
import { promisify } from "node:util"; 
import type { ValidationResult } from "./types.js";

const execFileAsync = promisify(execFile);  

export async function runValidation(command: string, cwd: string): Promise<ValidationResult> {
  const [file, ...args] = command.split(" ");
  try {
    const { stdout, stderr } = await execFileAsync(file, args, { cwd, shell: false });
    return { command, status: "passed", output: stdout || stderr };
  } catch (err: any) {
    return { command, status: "failed", output: err?.stderr || err?.message || "failed" };
  }
}

export async function runValidations(commands: string[], cwd: string): Promise<ValidationResult[]> {
  const results: ValidationResult[] = [];
  for (const command of commands) {
    results.push(await runValidation(command, cwd));
  }
  return results;
}