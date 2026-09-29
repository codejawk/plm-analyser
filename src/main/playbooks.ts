import fs from 'fs'
import { createHash } from 'crypto'
import path from 'path'
import type { Task } from '@shared/types'
import { repoOf } from './workfolders'

/**
 * Copies bundled playbooks into the user's folder. A user copy is replaced by a newer bundled
 * version only if the user never edited it (tracked by the hash of what was last installed).
 */
export function installPlaybooks(bundledDir: string, userDir: string): void {
  fs.mkdirSync(userDir, { recursive: true })
  if (!fs.existsSync(bundledDir)) return
  const manifestPath = path.join(userDir, '.installed.json')
  // Installs from before the manifest existed have never been edited through the app yet.
  const firstManifest = !fs.existsSync(manifestPath)
  const manifest: Record<string, string> = !firstManifest
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    : {}
  for (const file of fs.readdirSync(bundledDir)) {
    const bundled = fs.readFileSync(path.join(bundledDir, file), 'utf8')
    const target = path.join(userDir, file)
    const current = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : undefined
    const untouched = current === undefined || firstManifest || hash(current) === manifest[file]
    if (untouched && current !== bundled) fs.writeFileSync(target, bundled)
    if (untouched) manifest[file] = hash(bundled)
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2))
}

function hash(s: string): string {
  return createHash('sha1').update(s).digest('hex')
}

export function listPlaybooks(dir: string): string[] {
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .sort()
}

export function pickPlaybook(task: Task): string {
  if (task.playbook) return task.playbook
  if (task.source === 'github') return 'github-issue'
  if (task.source === 'plm') {
    switch (task.plmType) {
      case 'CVE':
        return 'plm-cve'
      case 'GVOC':
        return 'plm-gvoc'
      case 'BIGDATA':
        return 'plm-bigdata'
      case 'SET':
        return 'plm-set'
      default:
        return 'plm-generic'
    }
  }
  return 'generic'
}

export interface PromptContext {
  task: Task
  workspace: string
  cwd: string
  resultFile: string
  /** Real terminal session: the user can answer questions and approvals directly. */
  interactive?: boolean
  userReply?: string
  previousSummary?: string
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, key: string) => (key in vars ? vars[key] : m))
}

function templateVars(ctx: PromptContext): Record<string, string> {
  const t = ctx.task
  return {
    'task.title': t.title,
    'task.description': t.description || '(no description)',
    'task.source': t.source,
    'task.externalId': t.externalId ?? '',
    'task.externalUrl': t.externalUrl ?? '',
    'task.plmType': t.plmType ?? '',
    'task.priority': t.priority,
    'task.labels': t.labels.join(', '),
    'task.repo': repoOf(t) ?? '',
    workspace: ctx.workspace,
    cwd: ctx.cwd,
    resultFile: ctx.resultFile
  }
}

/** Builds the full instruction file the agent reads (PROMPT.md in the task workspace). */
export function buildPrompt(playbooksDir: string, playbook: string, ctx: PromptContext): string {
  const file = path.join(playbooksDir, `${playbook}.md`)
  const fallback = path.join(playbooksDir, 'generic.md')
  const body = fs.existsSync(file)
    ? fs.readFileSync(file, 'utf8')
    : fs.existsSync(fallback)
      ? fs.readFileSync(fallback, 'utf8')
      : 'Resolve the task described below.'
  const contractFile = path.join(playbooksDir, '_result-contract.md')
  const contract = fs.existsSync(contractFile) ? fs.readFileSync(contractFile, 'utf8') : DEFAULT_CONTRACT
  const vars = templateVars(ctx)

  const parts = [renderTemplate(body, vars)]
  if (ctx.previousSummary || ctx.userReply) {
    parts.push(
      '## Follow-up from the user',
      ctx.previousSummary ? `Previous run summary:\n${ctx.previousSummary}` : '',
      ctx.userReply ? `User's reply:\n${ctx.userReply}` : '',
      'Continue the task from where the previous run stopped, using this information.'
    )
  }
  parts.push(renderTemplate(contract, vars))
  return parts.filter(Boolean).join('\n\n')
}

export function shortPrompt(ctx: PromptContext, promptFile: string): string {
  // Kept free of quotes and shell metacharacters so it passes safely through cmd.exe on Windows.
  const title = ctx.task.title.replace(/["'`&|<>^%$]/g, ' ').replace(/\s+/g, ' ').trim()
  const base =
    `You are an engineering agent working on the task: ${title}. ` +
    `Read the full instructions in ${promptFile} and follow them. ` +
    `When done, write the result JSON to ${ctx.resultFile} as described there.`
  if (!ctx.interactive) return base
  return (
    base +
    ' A human is watching this session and can answer you here. If you need a decision, information or an action ' +
    '(for example a Qualcomm case), first write the result file with status needs_user and your question, then ask ' +
    'the question here and wait. After the answer, continue and write the final result file.'
  )
}

const DEFAULT_CONTRACT = `## When you finish
Write a JSON file to {{resultFile}} with this shape:
{"status": "review" | "needs_user" | "failed", "summary": "...", "question": "...", "artifacts": [{"type": "scl|pr|patch|report|other", "ref": "...", "note": "..."}]}`
