## When you finish (required)

Write a JSON file to `{{resultFile}}` and then exit. Use exactly this shape:

```json
{
  "status": "review | needs_user | failed",
  "summary": "What you found and did, in a few sentences. Include root cause if known.",
  "question": "Only for needs_user: exactly what you need from the human.",
  "artifacts": [
    { "type": "scl | pr | patch | report | other", "ref": "changelist number, PR URL or file path", "note": "short note" }
  ]
}
```

- `review`: you produced something for a human to check (a shelved changelist, a PR, a patch, or a root-cause report).
- `needs_user`: you are blocked on a human action or decision (for example a Qualcomm case, missing logs, access). Put a precise request in `question`.
- `failed`: you could not make progress. Explain why in `summary`.

Hard rules:
- Never submit a Perforce changelist or merge a PR. Shelve or open as draft only.
- Never push to shared branches.
- Save any report you write inside `{{workspace}}`.
