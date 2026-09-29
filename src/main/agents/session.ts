import { spawn as crossSpawn } from 'cross-spawn'
import { spawn, spawnSync } from 'child_process'
import type { ChildProcess } from 'child_process'
import * as pty from 'node-pty'
import { formatAgentLine } from './cli'

/** A running agent process, either a real terminal (interactive) or a background process (headless). */
export interface Session {
  interactive: boolean
  write(data: string): void
  resize(cols: number, rows: number): void
  kill(): void
  onData(cb: (data: string) => void): void
  onExit(cb: (code: number | null, error?: string) => void): void
}

export interface SessionOptions {
  command: string
  args: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  cols?: number
  rows?: number
}

/** Background run: parses the CLI's JSON event stream into readable terminal lines. */
export function startHeadless(o: SessionOptions): Session {
  const dataCbs: ((d: string) => void)[] = []
  const exitCbs: ((c: number | null, e?: string) => void)[] = []
  const emit = (d: string): void => dataCbs.forEach((cb) => cb(d))
  let exited = false
  const exit = (c: number | null, e?: string): void => {
    if (exited) return
    exited = true
    exitCbs.forEach((cb) => cb(c, e))
  }

  let child: ChildProcess
  try {
    child = crossSpawn(o.command, o.args, { cwd: o.cwd, env: o.env, stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    setTimeout(() => exit(null, (e as Error).message))
    return { interactive: false, write() {}, resize() {}, kill() {}, onData: (cb) => dataCbs.push(cb), onExit: (cb) => exitCbs.push(cb) }
  }

  let buf = ''
  child.stdout?.setEncoding('utf8')
  child.stdout?.on('data', (chunk: string) => {
    buf += chunk
    const lines = buf.split(/\r?\n/)
    buf = lines.pop() ?? ''
    for (const line of lines) {
      const text = formatAgentLine(line)
      if (text) emit(toCrlf(text + '\n'))
    }
  })
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => emit(toCrlf(chunk)))
  child.on('error', (err) => {
    const hint = (err as NodeJS.ErrnoException).code === 'ENOENT' ? ' Is the CLI installed and on PATH?' : ''
    exit(null, `${err.message}.${hint}`)
  })
  child.on('close', (code) => {
    const text = buf.trim() ? formatAgentLine(buf) : null
    if (text) emit(toCrlf(text + '\n'))
    exit(code)
  })

  return {
    interactive: false,
    write() {},
    resize() {},
    kill: () => killTree(child.pid, () => child.kill('SIGTERM')),
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => exitCbs.push(cb)
  }
}

/** Interactive run: the real CLI in a pseudo-terminal, so the user can answer prompts and approvals. */
export function startInteractive(o: SessionOptions): Session {
  const dataCbs: ((d: string) => void)[] = []
  const exitCbs: ((c: number | null, e?: string) => void)[] = []
  let exited = false
  const exit = (c: number | null, e?: string): void => {
    if (exited) return
    exited = true
    exitCbs.forEach((cb) => cb(c, e))
  }

  const { file, args } = resolveForPty(o.command, o.args)
  let term: pty.IPty
  try {
    term = pty.spawn(file, args, {
      name: 'xterm-256color',
      cols: o.cols ?? 120,
      rows: o.rows ?? 32,
      cwd: o.cwd,
      env: { ...o.env, TERM: 'xterm-256color', COLORTERM: 'truecolor' } as Record<string, string>
    })
  } catch (e) {
    setTimeout(() => exit(null, `Could not start "${o.command}": ${(e as Error).message}. Is the CLI installed and on PATH?`))
    return { interactive: true, write() {}, resize() {}, kill() {}, onData: (cb) => dataCbs.push(cb), onExit: (cb) => exitCbs.push(cb) }
  }
  term.onData((d) => dataCbs.forEach((cb) => cb(d)))
  term.onExit(({ exitCode }) => exit(exitCode))

  return {
    interactive: true,
    write: (d) => term.write(d),
    resize: (c, r) => {
      if (c > 0 && r > 0) term.resize(c, r)
    },
    kill: () => killTree(term.pid, () => term.kill()),
    onData: (cb) => dataCbs.push(cb),
    onExit: (cb) => exitCbs.push(cb)
  }
}

function toCrlf(s: string): string {
  return s.replace(/\r?\n/g, '\r\n')
}

function killTree(pid: number | undefined, fallback: () => void): void {
  if (pid !== undefined && process.platform === 'win32') {
    // CLIs on Windows often run through .cmd shims; kill the whole tree.
    spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    fallback()
  }
}

/**
 * node-pty needs a real executable. On Windows, npm-installed CLIs are .cmd shims,
 * so those run through cmd.exe. Everything else is passed through unchanged.
 */
function resolveForPty(command: string, args: string[]): { file: string; args: string[] | string } {
  if (process.platform !== 'win32') return { file: command, args }
  const found = spawnSync('where', [command], { encoding: 'utf8' }).stdout?.split(/\r?\n/).filter(Boolean) ?? []
  const exe = found.find((f) => f.toLowerCase().endsWith('.exe'))
  if (exe) return { file: exe, args }
  const shim = found.find((f) => /\.(cmd|bat)$/i.test(f)) ?? command
  const line = [shim, ...args].map(quoteForCmd).join(' ')
  return { file: process.env.ComSpec || 'cmd.exe', args: `/d /s /c "${line}"` }
}

function quoteForCmd(a: string): string {
  // cmd.exe: wrap in quotes, double embedded quotes, escape metacharacters with ^.
  return '"' + a.replace(/"/g, '""').replace(/([&|<>^%])/g, '^$1') + '"'
}
