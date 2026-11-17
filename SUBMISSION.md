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
```
# Review Report: C:\Users\user\IdeaProjects\credhub

## Changed files
- credhub-ui/src/api/endpoints.ts (modified)
- credhub-ui/src/api/items.ts (modified)
- credhub-ui/src/auth/accept-invite/AcceptInvitePage.tsx (modified)
- credhub/src/main/java/net/sinam/credhub/controller/ItemController.java (modified)
- credhub/src/main/resources/db/changelog/changes/042-item-secret-history.yaml (added)
```
I most probablly  cant show full output but this is a simple demonstration of how output looked for me and how I investigated (and a little snapshot of what I am working on at work)

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
      "path": "credhub-ui/src/api/endpoints.ts",
      "status": "modified"
    },
    {
      "path": "credhub-ui/src/api/items.ts",
      "status": "modified"
    },
    {
      "path": "credhub-ui/src/auth/accept-invite/AcceptInvitePage.tsx",
      "status": "modified"
    },
    {
      "path": "credhub-ui/src/auth/change-password/ChangePasswordPage.tsx",
      "status": "modified"
    },
    {
      "path": "credhub-ui/src/auth/components/NewPasswordFields.tsx",
      "status": "added"
    },
    {
      "path": "credhub-ui/src/auth/components/password-validation.css",
      "status": "added"
    },
    {
      "path": "credhub-ui/src/auth/jwt.ts",
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
- Trust boundary and allowed capabilities:
- Reliability, discoverability, latency/context, and output tradeoffs:
- How supported interfaces remain consistent:
- Evidence that would change this decision:


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

```
Make validation safe 
The problem is that validation.ts uses exec(command), which runs any shell command. Over MCP, that means an AI agent can run rm -rf ~ or upload your secrets.
The fix:

Replace free-form commands with a fixed list of named checks, for example { test: ["npm", ["test"]], typecheck: ["npm", ["run","typecheck"]] }. MCP accepts only those names (z.enum([...])).
Use execFile (no shell) instead of exec.
Add timeout (for example 120 s) and maxBuffer, and cut long output (for example keep the last 200 lines).
The CLI can keep --validate "<anything>", because a developer typing a command is trusted. Explain this difference as your trust boundary.
```

For the next quick prototype I decided to add an AI agent to the system. However at first there was a bug in the implementation of the AI Agent where he was unable to start the git program and couldnt find Git in its path

```markdown
I couldn't compare HEAD against `main`, so I can't summarize the changed files.

**What happened:** I ran `review_repository` on `C:\Users\user\Documents\GitHub\TestCargo` with `main` as the base, and it failed with:


spawnSync git ENOENT


**What it means:** The tool couldn't start the `git` program. `ENOENT` means "file not found," so the tool's process can't find `git` on its PATH. The problem is with the tool's environment, not your repository. The comparison never ran, so this doesn't tell us anything about which files changed or about the state of HEAD or `main`.

**Possible fixes:**
1. **Check that Git is installed** by running `git --version` in PowerShell. If it isn't installed, get it from https://git-scm.com.
2. **Add Git to PATH.** On Windows it's usually in `C:\Program Files\Git\cmd`. Add that folder to your system PATH.
3. **Restart the inspector MCP server** (or Claude Code) so it picks up the new PATH. A running process won't see PATH changes until it restarts.

Once `git` is available to the tool, I can run the comparison again and summarize the changes. Or, if you run `git diff --stat main...HEAD` in the repository yourself and paste the output, I can summarize that.
```

After running the `mcp-server` using `npm run mcp-server` 
```
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> npm run mcp-server                                                             
                         
> ai-repo-inspector-assessment-v2@2.0.0 mcp-server
> tsx src/mcp-server.ts


```

AI Agent learned how to talk: 
```
PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> npm run agent -- "C:\Users\user\smartcargo\SmartCargo" "Compare HEAD against ma changed files."

> ai-repo-inspector-assessment-v2@2.0.0 agent
> tsx src/agents.ts C:\Users\user\smartcargo\SmartCargo Compare HEAD against main and summarize the changed files.

I ran the comparison, and **it returned no changed files between `main` and HEAD.**

**Report contents:**
# Review Report: C:\Users\user\smartcargo\SmartCargo
## Changed files
   (empty)
## Validation output
   (empty)

There was no tool error, but both sections came back empty. I couldn't summarize any files because none were listed.

**What this likely means:**
- HEAD is probably the same commit as `main`, or HEAD has no commits that `main` doesn't already have. For example, you may be onn a branch that has already been merged.
- The tool compares commits, so uncommitted or staged changes in your working tree won't show up.

**What this can't confirm:**
- The report doesn't show which branch HEAD is on or what commit it points to, so I can't tell which of the cases above applies.
- I can't tell whether `main` exists locally or is up to date with the remote. If your local `main` is old or missing, the compar you expected.
- The empty "Validation output" section doesn't mean validation passed. It may just mean nothing was checked.

PS C:\Users\user\TestXsolla\Xsolla-AI-Intern-MCP> npm run agent -- "C:\Users\user\smartcargo\SmartCargo" "Show all branches"   

> ai-repo-inspector-assessment-v2@2.0.0 agent
> tsx src/agents.ts C:\Users\user\smartcargo\SmartCargo Show all branches

I couldn't get the branch list. The tool that lists branches (`repository_insights`) needs your permission before it can run, andn't been granted yet, so it never ran.

The only other tool I can use, `review_repository`, only shows which files changed between a base branch and the current commit. es, so it wouldn't answer your question.

   ```

However after adding agents.ts test implementation I decided to scrap it since trying to resolve issues of AI Agent not being able to access tools will take way to much time. Additionally, implementation of the github actions(List Baranches, See Contributors, See Merge Requests, etc.) was also scrapped for the same reason. So, It was important now to focus on the more important task at hand - security vulnerability and bug fixes.. 

Its important to understant the scope So, I quickly moved on to implemeting security and bug fixes. 




## Where did you check, correct, or reject an AI suggestion? (required)

I checked AI Suggestions a lot during the process of finding bugs in the program. 
As stated above most of the AI Suggestions were mainly the fact errors produce raw output instead of using a try catch block.
There was quite a substantial amount of AI Suggestions that I have rejected. However one of the most prominent ones came after my implementation of the GitHub actions. Specifically Claude Code suggested to write the `insights-report.ts` that will be used to write all the 

In addition he implemented the report inside the insight-report.ts. I strongly believe that having a one unified report for now is sufficient. Unless there would be a lange scale implementation and there will be a good reason to split report.ts into seperate sections. 
For example, if the file is too long it is better so split report by “what is being reported” 

Also, the output of the report is submitted to the terminal instead of report-review.md 

I strongly believe that following the initial structure of the project is preffered unless there is a good reason for any deviations. Because the production application might rely on the report-review.md file for example to be used in further analysis. For example when implemeting the UI Dashboard (im taking a guess here , but thats what I would’ve personally implemented as the next stage)   

The fact that AI was deviating from the project’s initial structure shows how context and strict instructions are important event for a quick prototype phase. While opon writing the prompt it might not even occur that AI can deviate from the project structure. It is crucial to explain to AI coding agent the architecture and structure of the application. This is what I will try my best to achieve further. 




I was brainstorming on how to implement, I used ChatGPT Codex for a rapid prototyppe implementation 

my initial prompt looked as follows:
```
Role:
You are given a task to implement the fuctionality for my Git Inspector Program

Context:
I am preparing for a AI-First Engineering Internship at Xsolla. The Project is a small TypeScript developer tool that inspects changes in a Git repository, runs optional validation commands, and produces a Markdown report. It can be used both from a command line interface and exposed to AI clients through MCP.
The project is written in Typescript  
The core.ts which is the main file has the reviewRepository function. 
Moreover there is a git.ts file. It takes the repository checks for the changed files and outputs said files as (added) or (modified) accordingly
Currently there is a already a really simple MCP Server imlementation in place. 


Task:
Imlement 
1. How many open pull requests there are (Or how many merge requests (MR) there are if we use GitLab [P.s. I do at work])  
2. How many merge requests there are 
3. how many contributors 
4. review specific user’s contributions 
5. How many branches there are (and who created which branch)


Constraints:
It is stricktly forbidden to write code that modifies the repo in any way (e.g. git push)
It is stricktly forbidden to write code that deletes anything from repo  
```

So, he implemented it using hosting.ts, meaning he wrote all provider API called inside a hosting file. Which is not exactly the implementation I personally wanted. 
I initially considered that implementing github functions would be much better inside git.ts file 

However I would need to use official Github MCP Server in order to get access to my desired features: “Number of Branches, Open Pull requests and etc.” 
So, I went back to prototyping the best approach. 
With this knowlidge I decided to quickly redo my approach while fully specifying the scope and how the applicaiton currently works and state to AI that it is “strictly prohibited to deviate from the current architecture” 
However, I scrapped this Idea quickly and just told ai to implement result-review.md and result-insights.ts together and scrapped it in order to focus on Security and Bug fixes. 

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

#### ai agent rough rototype 
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



## Known limitations and the next three things you would do
One of the main known limitations is that the MCP adapter is behaviorally inconsistent with the CLI
It uses repoPath while the CLI uses --repo,
has no format parameter, so MCP callers can’t get JSON at all,
throws instead of returning a structured MCP error,
describes itself as “Inspects a Git repository” with no mention that it executes commands, and leaves baseRef/validationCommands undescribed.
So, the next thing I would do is implement this fixes 

## Approximate focused-work time

- Start: 
- Finish: 