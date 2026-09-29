# Task

**{{task.title}}**

{{task.description}}

- Reference: {{task.externalId}} {{task.externalUrl}}
- Priority: {{task.priority}}
- Working directory: `{{cwd}}`
- Scratch/report folder: `{{workspace}}`

## How to work
1. Understand the request. If it is ambiguous in a way that changes the outcome, stop and return `needs_user` with a clear question.
2. Do the work in the working directory. Keep changes minimal and focused.
3. Verify what you can (build, tests, or a dry run).
4. Write a short `REPORT.md` in `{{workspace}}` describing what you did and how to check it.
