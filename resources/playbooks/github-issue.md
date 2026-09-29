# GitHub issue

**{{task.title}}**

Issue: {{task.externalUrl}}
Labels: {{task.labels}}

{{task.description}}

## How to work
1. Read the issue (and its comments if the GitHub MCP tools are available).
2. Work in `{{cwd}}`. If that folder is empty, clone the repository `{{task.repo}}` into it first (use `gh repo clone {{task.repo}} .` or `git clone`). If it is a git repository, create a branch named `agent/<issue-number>-<short-slug>`; never commit to the default branch.
3. Implement the fix or feature with tests where the project has them. Run the tests.
4. Commit on the branch. If `gh` is available and authenticated, open a **draft** PR that references the issue; otherwise leave the branch for the human.
5. Return `review` with the branch / PR URL as an artifact.
