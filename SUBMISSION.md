# Submission

## What did you investigate first, and why?
first and foremost I investigtes how the program itself is structured how it works. How the code is written, what functions there are. Moreover, I tried my best to understand what files is responsible for what purpose. 
After reviewing README.md and source codes I understood how the program works: 

1. `Core.ts` is the one responsible for the using the async function reviewRepository (Moreover it is `async` because it waits for the `runValidations` to finish before it can build the report)
2. Both `cli.ts` and `mcp-server.ts` use it in order to review the changed files 
3. `cli.ts` takes arguments from the terminal, calls reviewRepository(), and saves the report as review-report.md.
4. `mcp-server.ts` lets an MCP client call reviewRepository() and receive the report as text.
5. `git.ts` uses git diff to list files changed between the branch’s common ancestor with the base branch and HEAD.
6. `validation.ts` runs optional commands like npm test one at a time and collects their output.
7. `report.ts` outputs changed files into Markdown.

So, given this structire it was quite possible and resonable to write the functions that I want fully by myself


Secondly, I followed all the commands given inside the README.md file, ran both `npm run typecheck` and `npm test` and both worked with no errors.


After that I used my work laptop and tested in on the password manager project that I am currently working on in Sinam called “CredHub” in GitLad work repository (TypeScript + Java) 

#### npm audit

So, after checking around I used `npm audit` in to check for vulnerabilities and there was 

"18 vulnerabilities (5 moderate, 12 high, 1 critical)"

Critical being:

 `"proxy-addr vulnerable to IP spoofing via IPv4-mapped IPv6 trust subnet - https://github.com/advisories/GHSA-jqcg-44mw-7w3h"`

I addressed it by using `npm audit fix`

As an Aftermath It went down to "8 vulnerabilities (1 moderate, 7 high)"

Other Solution would include doing this: 

`To address all issues (including breaking changes), run:`
  
`npm audit fix --force
`

But even then its not that severe and sometimes some developers even ignore it. 
`npm audit fix --force` would force-change the MCP SDK to a different version than the one deliberately locked to and risk breaking the tool for no real security gain.
So, I strongly believe that it is fine to move on here.


#### After that I investigated the source code for any errors or bugs 

#### **Bugs Found**

#### **First Bug - The MCP tool's argument mismatch** 
```
server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  {
    repo_path: z.string().describe("Repository path to inspect."),
    baseRef: z.string().optional(),
    validationCommands: z.array(z.string()).optional(),
  },
  async (input: any) => {
    const report = await reviewRepository({
      repositoryPath: input.repoPath,
      baseRef: input.baseRef,
      validationCommands: input.validationCommands,
    });
```


First thing that caught my eye is the fact that the tool declares `repo_path`, however, the reviewRepository handler reads `input.repoPath` this mismatch will cause an error in the future implementations 
The MCP tool fails on every call, because git runs with no folder. (input: any) only hid it so the typecheck returned absolutely 0 errors 

PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npm.cmd run typecheck

> ai-repo-inspector-assessment-v2@2.0.0 typecheck
tsc -p tsconfig.json --noEmit
> 

The simplest fix for this is to declare the repo path argument same and consistent throught the mcp-server.ts

#### **Second Security Vulnerability**


Second find was that validation commands run in a full shell with no limits 
This particular error i first found with the help of Claude Code 

In the mcp-server.ts there is a line `validationCommands: z.array(z.string()).optional(),`  After that then in validation.ts `exec(command, { cwd }, (error, stdout, stderr) => {`

validation.ts uses exec(command), which hands the whole string to a shell. The shell runs anything in it, including ;, &&, | and $(...).


exec(command) runs any text as a shell command. Through MCP, an AI agent can send commands such as like rm -rf ~ 


This matters a lot since this tool is mainly used by the AI agents. A security flaw like this can allow tricked AI Agents by the prompt injection to execute  commands such as " rm -rf ~" that can delete the entire repository. 
Where these commands basically act like a "Red Button" and completely annihilate the entire repo without any confirmation. Therefore, most of the time this is not quite what we want, so to speak...

So, I tested a safe version of this confiring that 
```
npx tsx -e "import {runValidation} from './src/validation.ts'; runValidation('echo safe & whoami', '.').then(r => console.log(r.output))"

Output:
safe 
windows-bf4jnkl\user 
```
The fact that whoami ran means runValidation handed string to the shell.


>P.s. I initially wrongly assumed it was AI  hallucinating. Because of how weirdly Claude Code explained it. 

`exec("npm test; rm -rf ~")   // runs BOTH commands`

>I thought he ment that this is inside the code... Moreover he never specified it was simply an example. Nevertheless, I looked forward and researched further and as I will show later fixed this severe security vulnurability. 
>

**Moreover, a failing validation crashes the program**
```
 exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      } 
```
The whole review throws an error while the reject type exists 
So, the solution is to implement a try catch (Which I already completed at the same time while solving the Command Injection which I will describe in details below)

#### **Third "Bug" - `--format json` is ignored**
However, no a full bug more like a lack of implementation, For that It would need It also accepts any value . 
`  format?: "markdown" | "json";` we can see it is used here 





#### **Second  Small Bug - `-repo` split on spaces**
I found this bug with the Help of claude code in the cli.ts, the path is cut at the first space:

`args.repositoryPath = argv[++index]?.split(" ")[0];`

So, assuming the repo is saved in the folder with a whitespace such as 

"/Users/user/Smart Cargo/smartcargo" 

It will become "/Users/user/Smart" and it doesn’t exist. It breaks path after a space. 
So, he suggested to remove the .split.

`args.repositoryPath = argv[++index];`

#### **Hardcoded `main`**
Another finding of Claude Code was that the  
`const base = baseRef ?? "main";` as a hardcoded main and that there can be another naming such as "master". This can be rejected. Since defaulting as main is logical since it is the default branch. 
However His next claim points to another issue that there is no error handling around the git call, so a non-existent base ref crashes the entire program with an ugly, uninformative stack trace instead of a clear message like “base branch ‘main’ not found — pass --base-ref.”. 
The solution for this will be simple try catch with error message from above. 
(However, if someone is using old repositories that has "master" as the default branch they are probably Senior and can understand the stack trace too.. but thats just my guess here..)
 



  

## What did you choose to implement or fix?

First and foremost, I started with fixing the existing implementation. My fist observation was the inconsistency inside the `mcp-server.ts` file. So, I changed the source code to this: 

```
server.tool(
  "review_repository",
  "Inspects a Git repository and returns a review report.",
  {
    repoPath: z.string().describe("Repository path to inspect."),
    baseRef: z.string().optional(),
    validationCommands: z.array(z.string()).optional(),
  },
  async (input) => {
    const report = await reviewRepository({
      repositoryPath: input.repoPath,
      baseRef: input.baseRef,
      validationCommands: input.validationCommands,
    });
```

I made the variables consistent to "repoPath" and removed the unnecessary "any" keyword 

#### One of the most dangerous Vulnerabilites I found and fixed 
Command injection is one of the most dangerous vulnerabilities a web application can have. 

```
import { execFile } from "node:child_process";       
import { promisify } from "node:util"; 

.....

export async function runValidation(command: string, cwd: string): Promise<ValidationResult> {
  const [file, ...args] = command.split(" ");
  try {
    const { stdout, stderr } = await execFileAsync(file, args, { cwd, shell: false });
    return { command, status: "passed", output: stdout || stderr };
  } catch (err: any) {
    return { command, status: "failed", output: err?.stderr || err?.message || "failed" };
  }
}

```

So, now I am confirming that the Command Injection worked 
```
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npx tsx -e "import {runValidation} from './src/validation.ts'; runValidation('echo safe & whoami', '.').then(r => console.log(r.output))"
spawn echo ENOENT
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> 
```
So according to Claude Code and Stackoverflow `spawn echo ENOENT` is the fix working and it’s actually the cleanest possible proof on Windows

Moreover, failing validation crashes the program was also resolved 
```
try {
  const { stdout, stderr } = await execFileAsync(file, args, { cwd, shell: false });
  return { command, status: "passed", output: stdout || stderr };
} catch (err: any) {
  return { command, status: "failed", output: err?.stderr || err?.message || "failed" };
}
```

#### `--format json`being silently ignored fix

First step is that i needed to add the a JSON renderer in `report.ts`

So, initially Claude Code sugested to entirely delete this return function 
``` 
  return markdownReport({
    repositoryPath: request.repositoryPath,
    changedFiles: files,
    validationResults: validations,
  }); 
```
In favor of using conditional (ternary) operator: 
`return format === "json" ? jsonReport(input) : markdownReport(input);`


While can be a correct approach too, I personally strongly believe that keeping the strucutre as is will always help to keep the consistency in the code structure (Unless absolutely neccessary to change it). In addition, this practice will allow for easy acceess for other developers to recognize the structure more easily. (So, i did it to practice too)

Approach I went with is as follows: 
```
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
```

As we can see The function now handles both markdownReport and jsonReport. The markdown call keeps its original inline form and acts as the default and then json becomes a fallback.
(it’s only reached when the format isn’t markdown)

Then add the json format to the `report.ts`:
```

export function jsonReport(input: ReportInput): string {
  return JSON.stringify(input, null, 2);
}
```
After that, add this import to the `core.ts` 
`import { markdownReport, jsonReport } from "./report.js";`

So, after that i tested how this worked fully ready that it will be fully functional but was absolutely devastated: 
it saved the json SYNTAX inside the `review-report.md` but the file was not `review-report.json`. It is safe to assume that the user or even AI Agent for that matter requesting --format json does not expect file to be .md instead of .json
```
{
  "repositoryPath": "C:\\Users\\user\\IdeaProjects\\credhub",
  "changedFiles": [
    {
      "path": "credhub-ui/src/api/items.ts",
      "status": "modified"
    },
```
So, after looking around in code
It was about the fact that cli.ts still hardcodes review-report.md regardless of format.

```
  writeFileSync("review-report.md", report, "utf8");
  console.log("Review report written to review-report.md");
```
In order for it to be faster disscused this abnormality with Claude Code he kindly provided me with the solution which is a simple conditional (ternary) operator: 
```
  const outFile = format === "json" ? "review-report.json" : "review-report.md";
  writeFileSync(outFile, report, "utf8");
  console.log(`Review report written to ${outFile}`);
```
FInally , after running the `--format json` i was sure that AI Agents, Developers (and myself) will get json file as output. 

#### -repo split on spaces
So, this one was rediculusly easy especially after the fairly "complex" task (at least in comparison to previous fix. P.s. on my job I was completing tasks and fixes substantually more complex)

Just simply change 

`args.repositoryPath = argv[++index]?.split(" ")[0];` 

to 

`args.repositoryPath = argv[++index];` and call it a day.. 


#### try catch for main
while again can be fully rejected. However, for a clean implementation and practice I decided to really quickly implement it not to leave any gaps: 
```
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
```





## What did you intentionally not do?
There are multiple features I wanted to add. However due to time limitations I didnt implement. 
Ability for the Claude AI Agent to manually resolve merge conflicts and push them to the repo given the correct permission. 

While it is a great feature, given the scope, limitation and time constraints I did not implement it. 

Another "tragic sacrifice" is that I had to leave the implementation of Official GitHub MCP Server connection. Since I didn't have enought time to implement it. 

I used implementation from Claude Code that was using hosting.ts to test and prototype how it would look. 
However, even there it gave this 
```
## Pull / merge requests

_Unavailable: Could not query github API: 422 Unprocessable Entity from api.github.com_
```
So, there was no time to properly implement the Official GitHub MCP Server connection 
>Hopefully I will have a chance during the AI-First Engineering Internship at Xsolla :D 
>
One more implementation I wanted to instantly make upon first glancing thought the assignment is to make a full small UI chatbot with a Dashboard that displays all the information from the repo. The user would've been talking with AI agent though a standard chatbox and AI agent will display all the data in a dashboard form in the interface. However this will be way to complex to implement with the time constraint. 

## Interface decision

- Decision: Hybrid, with one shared core.ts
- Primary user and execution environment:
1. Developers and CI (e.g. GitHub Actions) use the CLI, locally or in a
    pipeline.
2.  AI coding agents use the MCP server, running on the developer's machine.
- Trust boundary and allowed capabilities:
  1. The CLI is trusted, because a human or a CI config chooses the commands.
  2. The MCP tool is not trusted, because an agent can be tricked by text in a repo (prompt injection) into requesting something harmful.
  3.  MCP should only read Git changes and run allowed checks such as test, lint and typecheck, with a timeout.
  4.  The MCP tool description must say that it runs commands, so clients ask the user first.
  5.  Neither interface uses a shell anymore, because I replaced `exec` with `execFile`.
- Reliability, discoverability, latency/context, and output tradeoffs:
  1. Reliability: shared core means a fix in one place fixes both.
  2. Discoverability: CLI has usage text; MCP depends on clear tool and
    parameter descriptions, which were missing.
  3. Latency/context: long test runs need a timeout; large output fills the
    agent's context, so it should be limited.
  4. Output: Markdown for humans, JSON for agents and CI. Both interfaces
    should support both formats.
- How supported interfaces remain consistent:
  1. Both go through the same `reviewRepository()` in `core.ts`, but they don't fully match yet. MCP uses `repoPath` instead of `--repo`, has no `format` option, and throws errors instead of returning them.
  2.  Next, I'd give them one shared input schema and add tests that check both return the same result.
- Evidence that would change this decision:
  1. If AI agents get more reliable and we can safely limit what commands they run, I'd switch to MCP-first and keep the CLI mainly for CI.
  

After branstorming what approach is the best The scope is hybrid for both CLI Developers and AI Agents to use

The reason why I choose hybrid is as follows, Developers and CI use the CLI and are trusted. AI agents use MCP, and their input is not trusted, because an agent can be tricked by text in a repo into requesting something harmful. Both interfaces call the same core.ts, so they behave the same.

## How did you use an AI coding agent?

I mainly used 2 AI Coding Agents: 

1. ChatGPT Codex for simple quick questiosn 
2. Claude Code for robust implementations

At first I was simply trying to debug for any errors or security vulnurabilities there are in the program. 
I find 5 bugs in the source codes of the project (1 of which i found myself.)
I verified thoughroughly whether what Claude Code proposed actually made sence and is an actual bug or whether he is just hallucinating. 

For the main robust implementations such as GitHub actions I used mainly Claude Code 

I managed to connect and set up Claude Code into the  terminal inside vs code  using the `claude` and was conviniently using him inside vs code's terminal. Moreover, I connected him to the repo and made him push, commit and create branches, etc.


I used Claude Code AI Coding Agent to prepare the implementation of the AI Agents. 
So, I decided to quickly prototype an implementation of AI agent using Claude Code to the system. 

After running the `mcp-server` using `npm run mcp-server` 
```
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> npm run mcp-server                                                             
                         
> ai-repo-inspector-assessment-v2@2.0.0 mcp-server
> tsx src/mcp-server.ts


```

AI Agent learned how to talk and help with the requests 


The agent was quickly implemented using anthropic's claude agent sdk import and connected to the custom MCP Server:
(All this in the testing branch) 
```
import { query } from "@anthropic-ai/claude-agent-sdk";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const serverEntry = fileURLToPath(new URL("./mcp-server.ts", import.meta.url));
```

The system prompt for the Claude AI Agent was as follows:
```
        "You are a Git repository inspection assistant.",
        `Always pass repo_path set to ${JSON.stringify(repositoryPath)}.`,
        "Use the tool before making claims about repository changes.",
        "Report tool errors and explain what the report can establish.",
``` 

So, These are the examples used on my Senior Design Project of how the AI Agents are implemented: 
[When we were writing Senior Design Project we were using GO as its backend language of choice, I really wanted to mention it this since Xsolla is using GoLang as its Backend language]:


#### Listing all contributors 
```
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> npm run agent -- "C:\Users\user\smartcargo\SmartCargo" "Show all contributors"

> ai-repo-inspector-assessment-v2@2.0.0 agent
> tsx src/agents.ts C:\Users\user\smartcargo\SmartCargo Show all contributors

The SmartCargo repository has **4 contributor identities**, with **191 commits** in total.

| Name | Email | Commits | First commit | Last commit |
| --- | --- | ---: | --- | --- |
| Muzahim | 37937980+MMMuzahim@users.noreply.github.com | 57 | 2026-01-26 | 2026-04-29 |
| google-labs-jules[bot] | 161369871+google-labs-jules[bot]@users.noreply.github.com | 56 | 2026-02-25 | 2026-04-28 |
| Ramiz Taghiyev | ramiz.tagiyev26@gmail.com | 40 | 2026-04-14 | 2026-04-28 |
| Ramiz Taghiyev | 91952906+RamizTaghiyev@users.noreply.github.com | 38 | 2026-04-02 | 2026-04-28 |

- **Ramiz Taghiyev is listed twice** because he committed under two email addresses. The report can't confirm these are the same person, but if they are, he has **78 commits**. That would make him the top contributor, ahead of Muzahim.
- **google-labs-jules[bot] is an automated AI coding agent**, not a person. It made 56 commits, which is close to a third of all commits.
- **No commits are dated after 2026-04-29.** Every contributor's last commit is between April 28 and 29. This only covers the local copy of the repository, so newer work on the remote won't show up until it's fetched.
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> 
```

#### Listing all branches: 

```
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> npm run agent -- "C:\Users\user\smartcargo\SmartCargo" "Show all Branches"    

> ai-repo-inspector-assessment-v2@2.0.0 agent
> tsx src/agents.ts C:\Users\user\smartcargo\SmartCargo Show all Branches

The SmartCargo repository has **33 branches**: 1 local branch and 32 remote-tracking branches on `origin`.

**Local**
| Branch | Last commit | Date |
| --- | --- | --- |
| main | `63a3911` | 2026-04-29 |

**Remote (origin)**
| Branch | Last commit | Date |
| --- | --- | --- |
| main | `63a3911` | 2026-04-29 |
| Fix-Directories-as-well-as-Admin-Management | `18fdbe6` | 2026-04-28 |
| Changes_2 | `136a765` | 2026-04-28 |
| test | `60e60d7` | 2026-04-28 |
| fix-courier-websocket-id-parsing-11684564044115678522 | `f9e060a` | 2026-04-28 |
| Messaging-System | `f36528c` | 2026-04-25 |
| path-optimization-integration | `cc5fb5f` | 2026-04-25 |
| courier-packages-integration | `7ca1c2b` | 2026-04-25 |
| Changes_922 | `cadb5d6` | 2026-04-25 |
| replace-tracking-code-to-id | `ea4e9fd` | 2026-04-25 |
| rename-tracking-code-to-package-id-13553892081617772708 | `7104ab7` | 2026-04-25 |
| Changes | `dea8223` | 2026-04-25 |
| add-map-to-active-route | `7089a60` | 2026-04-25 |
| vehicless | `c241a6b` | 2026-04-23 |
| PACJAKAGEEPACJAKAGEEPACJAKAGEE | `7fe227f` | 2026-04-23 |
| SEAARCHHHAAAAA-FIXX | `257232f` | 2026-04-23 |
| role-assignmenttPFP | `b9a5da6` | 2026-04-22 |
| feature/import-packages-modal-14857616208375280003 | `bdf86eb` | 2026-04-22 |
| fix-admin-profile-name-16143651633925251929 | `5fa9fd0` | 2026-04-22 |
| info_storoge | `65f142b` | 2026-04-22 |
| fix/auth0-integration-9434287857475273612 | `6a0596d` | 2026-04-22 |
| Role-Assignment | `5de1792` | 2026-04-22 |
| messages-WebSocket-fix | `5671aa6` | 2026-04-22 |
| real-time-messages-notifications | `0e92c52` | 2026-04-22 |
| real-time-messages-notifications2 | `6421160` | 2026-04-22 |
| feature/real-time-notifications-12657073594334459960 | `fdb2a2c` | 2026-04-22 |
| assign-role-for-new-users | `999da64` | 2026-04-22 |
| auth0-fix | `0fcdb7b` | 2026-04-21 |
| feature/real-time-courier-messaging-1485635017086307530 | `69ae17b` | 2026-04-21 |
| mobile-admin-menu | `8aee5b8` | 2026-04-17 |
| air/delete-access_token-and-id_token-after-logout-of-admin-cc2ce9f5-8 | `3f2bbaf` | 2026-04-17 |
| Filese_rebase | `29fb7ce` | 2026-04-16 |

- **Up to date:** Your local `main` points to the same commit as `origin/main` (`63a3911`).
- **No recent activity:** The newest commit on any branch is from 2026-04-29, so nothing has been committed in about 6½ months.
- **Branches only exist on origin:** All other branches are remote-tracking only. You haven't checked any of them out locally.
- **Merge status isn't covered:** This only shows each branch's latest commit, not whether it has been merged into `main`. I can look up open and merged pull requests to find branches that may be safe to delete.
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> 
```

I wish I had more time to refine this further using UI Chatbot Interface for example

## Where did you check, correct, or reject an AI suggestion? (required)

I checked AI Suggestions a lot during the process of finding bugs in the program. 
As stated above most of the AI Suggestions were mainly the fact errors produce raw output instead of using a try catch block.
There was quite a substantial amount of AI Suggestions that I have rejected. 



####
Moreover ne of the instant rejections I did when I saw is that  Claude Code proposed fixing one of the Bugs with exec() function. 
Specifically, A failing validation crashes the program
He proposed:
Chaning this part 
```
exec(command, { cwd }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
```
With this 
```
exec(command, { cwd, timeout: 120_000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
  resolve({ command, status: error ? "failed" : "passed", output: `${stdout}${stderr}` });
});
```
So, I instantly rejected this "suggestion" of his.



For the next AI Check, Correction and Rejections I will describe the full cycle of me adding additional GitHub actions
I was brainstorming on how to implement featurues of Github Actions, I used Claude Code for a rapid prototype implementation inside the `testing branch`

my initial prompt was as follows:
```
Role:
You are given a task to implement the fuctionality for my Git Inspector Program

Context:
I am preparing for a AI-First Engineering Internship at Xsolla. The Project is a small TypeScript developer tool that inspects changes in a Git repository, runs optional validation commands, and produces a Markdown report. It can be used both from a command line interface and exposed to AI clients through MCP.
The project is written in Typescript  
The core.ts which is the main file has the reviewRepository function. 
Moreover there is a git.ts file. It takes the repository checks for the changed files and outputs said files as (added) or (modified) accordingly
Currently there is a already a really simple MCP Server imlementation in place. 

Project layout:
- src/core.ts shared orchestration; contains reviewRepository() and four placeholder functions that I wrote modify them if needed:
1. getContributors
2. getOneContributor 
3. getPullRequests 
4. getBranches

- src/git.ts git helpers; runs git via execFileSync (no shell). Contains: 
1. resolveCommit(), which validates refs with
2. `git rev-parse --verify --end-of-options <ref>^{commit}` and rejects anything starting with "-". 
This is a security fix for git option injection — keep it and reuse the same pattern.

- src/cli.ts CLI adapter

- src/mcp-server.ts MCP adapter (currently one tool: review_repository)

- src/types.ts shared types

- test/ vitest tests; test/git.test.ts builds temporary git repos as fixtures

Before writing code, read every file in src/ and test/ and summarise the existing patterns
you will follow. 


Task:
Imlement 
1. How many open pull requests there are
2. how many contributors 
3. review specific user’s contributions 
4. How many branches there are


Constraints:
It is stricktly forbidden to write code that modifies the repo in any way (e.g. git push)
It is stricktly forbidden to write code that deletes anything from repo  
```

So, he implemented it using hosting.ts, meaning he wrote all provider API called inside a hosting file. Which is not exactly the implementation I personally expected. 
He connected dirrectly to GitHub API. Which is also one of the approaches. 
I initially considered that implementing github functions would be much better inside git.ts file 
I strongly believe that keeping the project structure as is crusial and writing the alongside the existing functions (reviewRepository function inside core.ts and git.ts) is the best architectural approach.  
After that then calling these functions for cli.ts and mcp-server.ts 

This approximatelly the structure Claude Code ended up going with. 
He wrote the functions first inside git.ts (He moved my functions from core.ts to git.ts for the reasons of writing "repositoryInsights" function that compiles entire report at ones) 
Then inside the core.ts he wrote function `export async function repositoryInsights` that provides the pullRequests , contributors and branches functions that are written inside git.ts and returns as insights output. All ot ones or one by one. 
```
  const sections = new Set(request.sections?.length ? request.sections : ALL_INSIGHT_SECTIONS);
  const insights: RepositoryInsights = { repositoryPath: request.repositoryPath };

  if (sections.has("pull_requests")) {
    insights.pullRequests = await pullRequestStats(remoteUrl(request.repositoryPath));
  }
  if (sections.has("contributors")) {
    insights.contributors = contributors(request.repositoryPath);
  }
  if (sections.has("branches")) {
    insights.branches = branches(request.repositoryPath);
  }
  return insights;
```

The functions mock functions that I wrote `getContributors`, `getOneContributor`, `getPullRequests` and `getBranches` were renamed and moved to git.ts in favor of core.ts having the function calls to them but the functionality remained the same. 
I strongly believe and it is requred so the architecture should stay the same with the existing architecture meaning that core.ts should create functions and then cli.ts and mcp-server.ts should call them. While git.ts only handles the Git Inspection. 
For example, for getContributors he wrote: 
```
export function contributors(repositoryPath: string): Contributor[] {
  const output = git(repositoryPath, [
    "log",
    "--all",
    `--format=%aN${FIELD}%aE${FIELD}%aI`,
  ]);
  return parseContributors(output);
}
```
For Branches it is:
```
export function branches(repositoryPath: string): BranchInfo[] {
  const output = git(repositoryPath, [
    "for-each-ref",
    "--sort=-committerdate",
    `--format=%(refname)%1f%(refname:short)%1f%(objectname:short)%1f%(committerdate:iso-strict)`,
    "refs/heads",
    "refs/remotes",
  ]);
  return parseBranches(output);
}
etc. 
```

Therefore, I wanted to get back to prototyping the best approach with the knowlidge I obtained. However, I needed to focus more 
It is crucial to fully specify the scope and how the applicaiton currently works and state to AI that it is “strictly prohibited to deviate from the current architecture” 
While I specified the current structure, I did the best It could and came up with the approach 
I quickly analyed what were the main issues. One of them is the fact the Claude Code implemented the 

Therefore, one of the most prominent AI Regections came came after my implementation of the GitHub actions. Specifically when Claude Code suggested to write the `insights-report.ts` that will be used to write all the actions in one place and output it inside the terminal instead of the review-report.md file. 

In addition he implemented the report inside the insight-report.ts. I strongly believe that having a one unified report for now is sufficient. Unless there would be a lange scale implementation and there will be a good reason to split report.ts into seperate sections. 
For example, if the file is too long it is better so split report by “what is being reported” 

Also, the output of the report is submitted to the terminal instead of report-review.md 

Therefore, In order not to lose time I quickly told AI to implement features of result-insights.ts inside the result-review.md and the output for both should be in the same .md (or.json) file. 

I strongly believe that following the initial structure of the project is preffered unless there is a good reason for any deviations. Because the production application might rely on the report-review.md file for example to be used in further analysis. For example when implemeting the UI Dashboard (im taking a guess here , but thats what I would’ve personally implemented as the next stage)   

The fact that AI was deviating from the project’s initial structure shows how context and strict instructions are important event for a quick prototype phase. While opon writing the prompt it might not even occur that AI can deviate from the project structure. It is crucial to explain to AI coding agent the architecture and structure of the application. This is what I will try my best to achieve further. 

Next step would be to implement this functionalities properly and fix the architecture. However, since some functionalities such as view pull requests required the GitHub API Set up and Debug. Specifically, I got this error (Which I mentioned In the "Blockers section")

```
## Pull / merge requests

_Unavailable: Could not query github API: 422 Unprocessable Entity from api.github.com_

```
Moreover, that opened a question for me whether it is better to implement GitHub's Official MCP Server Like how I initially wanted, Use Direct GitHub API Calls. 
From my quick research I gathered that using GitHub's Official MCP Server lets AI Agents to freely access wide array GitHub actions such as "list_branches" letting users request desired function using natural language. 
While the Direct API Calls can be beneficial for writing custom functions and making direct API Calls to execute them. 

So, Claude Code's Initial attempt proved that he somewhat understood the task, but wrote additional components such as hosting.ts 

The functionality worked perfectly and after my fixes with unified review-report.md exactly how on a surface level it would've been expected. However, Claude Code's needed further analysis. Therefore, I had to unfortunately abandon this part of the implementation and keep it as is due to time limitations.   





## Commands used to verify the result, with outcomes

#### npm run typecheck
```
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npm run typecheck

> ai-repo-inspector-assessment-v2@2.0.0 typecheck
> tsc -p tsconfig.json --noEmit

PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> 
```

#### npm test 
```
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npm test                 

> ai-repo-inspector-assessment-v2@2.0.0 test
> vitest run


 RUN  v4.1.10 C:/Users/user/Xsolla_InternShip_AI_First/Xsolla-AI-Intern-MCP

 ✓ test/report.test.ts (1 test) 6ms
   ✓ markdownReport (1)
     ✓ lists changed files and validation output 3ms

 Test Files  1 passed (1)
      Tests  1 passed (1)
   Start at  02:39:36
   Duration  673ms (transform 76ms, setup 0ms, import 127ms, tests 6ms, environment 0ms)

PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> 
```

#### CLI Commands
```
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npm run inspector -- review --repo C:\Users\user\IdeaProjects\credhub --format markdown 

> ai-repo-inspector-assessment-v2@2.0.0 inspector
> tsx src/cli.ts review --repo C:\Users\user\IdeaProjects\credhub --format markdown

Review report written to review-report.md
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> 
```

```
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npm run inspector -- review --repo C:\Users\user\IdeaProjects\credhub --format json    

> ai-repo-inspector-assessment-v2@2.0.0 inspector
> tsx src/cli.ts review --repo C:\Users\user\IdeaProjects\credhub --format json

Review report written to review-report.json
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> 
```


#### Commands for the prototype codes inside testing branch 
```
#### Everything at once
npm run inspector -- insights --repo <path>
This gives open/merged PRs or MRs, all contributors and all branches in one report.

Branches

#### All branches (local + remote) with commit, date and likely creator

npm run inspector -- insights --repo <path> --section branches
#### All contributors with commit counts and first/last commit dates

npm run inspector -- insights --repo <path> --section contributors

A specific contributor

#### By name or email; matches part of it and ignores case

npm run inspector -- contributions --repo <path> --author "alice"
npm run inspector -- contributions --repo <path> --author "alice@company.com"

#### Only commits after a date

npm run inspector -- contributions --repo <path> --author "alice" --since "2026-01-01"
npm run inspector -- contributions --repo <path> --author "alice" --since "3 months ago"

#### ai agent rough prototype 
 npm run agent -- "C:\Users\user\smartcargo\SmartCargo" "Show all branches" 
```

## A blocker you hit and how you approached it
I hit few blockers along the way ranging from simple ones to quite complex ones
One of the first blockers I faced was a simple npm error 
specifially 

"Cannot find name 'node:fs'. Do you need to install type definitions for node? Try `npm i --save-dev @types/node` and then add 'node' to the types field in your tsconfig.ts(2591)"

I resolved it simply by writing `npm i --save-dev @types/nod` in the terminal and adding `"types": ["node"]` to the `"compilerOptions"` inside tsconfig.json 

In addition, another blocker I hit while working on this project is that after adding a repo there was no output in the `review-report.md` 
After Inspecting everything i could myself I turned my attention to ChatGPT AI and Claude Code

From ChatGPT AI I mainly clarified why `- review --repo` wasnt giving main output in the `review-report.md`. As I suspected first it was simply since using home laptop I tried to clone my senior design project test repo (however there was no local changes yet) 

Another blocker is that my GitLab work repo didnt had the npm test scripts,
It had build command which is the same
```
PS C:\Users\user\Xsolla_InternShip_AI_First\Xsolla-AI-Intern-MCP> npm.cmd --prefix "C:\Users\user\IdeaProjects\credhub\credhub-ui" run
Scripts available in credhub-ui@0.0.0 via `npm run`:
  dev
  dev:remote
    vite --mode dev
  build
    tsc -b && vite build
  lint
    eslint .
    eslint . --fix
  typecheck
    tsc -b --noEmit
  preview
    vite preview
```
Using this I was able to sucessfuly 

One of the main blockers was that upon trying to access pull and merge request I get 
```
## Pull / merge requests

_Unavailable: Could not query github API: 422 Unprocessable Entity from api.github.com_

```

One of the additional minute blockers was that after implementing json implemenation the output was as .md file and not as .json. The reason I am mentioning this is becuase it caught me offguard at first. But I quickly realized what was the issue and quicky fixed and resolved it. (The review-report.md was hardcoded and there was no  .json check either in cli.ts)

Another blocker I encountered is how Claude Code initially implemented the Additional GItHub Actions that I described Above. 

## Known limitations and the next three things you would do

There are few additional finds that I found later 
MCP adapter is behaviorally inconsistent with the CLI, It uses repoPath while the CLI uses --repo,
the MCP tool should use `repositoryPath` in order to keep the naming consistent 

Moreover it has no format parameter, so MCP callers can’t get JSON at all, throws instead of returning a structured MCP error, describes itself as “Inspects a Git repository” with no mention that it executes commands, and leaves baseRef/validationCommands undescribed.
So, the next thing I would do is implement this fixes.
In order to address this next, I would add JSON output to MCP, return clear errors

Next known limitation it has a lot of unhandled error messages in MCP Server. It can be really easily resolved with a simple try catch 

#### Lack of native User Friendly UI 
So, the next step I would've implemented this tool in a small application written using React ts and GoLand. Using the existing rough prototype of the AI Agent. First and foremost, I would've refined the AI Agent and connected it to official GitHub MCP Server for wide array of commands for him to use. Next Step would be to build a frontend UI , The AI Agent Chatbox and the Dashboard, so that actions performed by the AI Agent such as "List all branches" or "List all contributors" would be displayed cleanly in a UI Dashboard (For example, the tables inside the dashboard can be written using React's UI framework "Material UI (MUI)")
The branches would be be dynamically displayed in a table format inside the dashboard and can be manipulated (e.g. delete branch). These actions can be performed using both AI Chatbot Agent or manually via UI Button on Dashboard (e.g. "Delete Branch"). 
So, the manual action structure would be really similar to the way Current CLI works while the Rought Prototype of the Agent was quickly implemented as well.


## Approximate focused-work time

- Start: Approximately 11/17/2026 ~4:25 
- Finish: Approximately 11/18/2026 ~12:45 

This is over the 90-minute limit. While the time included break total time would accumulate to approximately 120 minutes. I was working on the assessment periodically. 
Roughly the first hour went to investigating the code and the main fixes and starting the implementaiton on additional GitHUb Actions and AI Agent. While the extra time was mostly spent writing up SUBMISSION.md and checking the security-related findings.
