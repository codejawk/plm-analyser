import { useEffect, useRef } from 'react'
import { Terminal as XTerm } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

const DARK = {
  background: '#1c1b19',
  foreground: '#ecebe6',
  cursor: '#ecebe6',
  selectionBackground: '#44443f'
}
const LIGHT = {
  background: '#fbfaf7',
  foreground: '#1f1e1c',
  cursor: '#1f1e1c',
  selectionBackground: '#d3d1c7',
  // Light backgrounds need darker "bright" colors to stay readable.
  brightWhite: '#5f5e5a',
  white: '#6b6a65',
  yellow: '#8a5a0b',
  brightYellow: '#854f0b'
}

/**
 * Shows one run's terminal. Replays everything so far, then streams live output.
 * When the run is alive and interactive, keystrokes go to the CLI.
 */
export function RunTerminal({ runId }: { runId: string }): React.JSX.Element {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = host.current
    if (!el) return
    const dark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const term = new XTerm({
      fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, Menlo, monospace",
      fontSize: 13,
      cursorBlink: true,
      scrollback: 20000,
      convertEol: false,
      theme: dark ? DARK : LIGHT,
      allowProposedApi: true
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)

    let disposed = false
    let attached = false
    let interactive = false
    let alive = false

    // Output that arrives before the snapshot is already part of the snapshot (IPC is ordered),
    // so only data received after attach resolves is written.
    const off = window.api.onTerminalData((id, data) => {
      if (id === runId && attached) term.write(data)
    })

    const doFit = (): void => {
      if (disposed || el.clientWidth === 0) return
      try {
        fit.fit()
        if (alive && interactive) void window.api.resizeTerminal(runId, term.cols, term.rows)
      } catch {
        /* element not laid out yet */
      }
    }

    void window.api.attachTerminal(runId).then((snap) => {
      if (disposed) return
      attached = true
      interactive = snap.interactive
      alive = snap.alive
      term.write(snap.text)
      if (!snap.alive) term.write('\r\n\x1b[2m— session ended —\x1b[0m\r\n')
      doFit()
      if (alive && interactive) term.focus()
    })

    const input = term.onData((d) => {
      if (alive && interactive) void window.api.writeTerminal(runId, d)
    })
    const ro = new ResizeObserver(() => doFit())
    ro.observe(el)

    return () => {
      disposed = true
      off()
      input.dispose()
      ro.disconnect()
      term.dispose()
    }
  }, [runId])

  return <div className="terminal-host" ref={host} />
}
