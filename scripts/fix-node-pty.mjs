// npm drops the executable bit on node-pty's macOS helper; interactive sessions fail without it.
import fs from 'fs'
import path from 'path'

const dir = path.join('node_modules', 'node-pty', 'prebuilds')
if (fs.existsSync(dir)) {
  for (const platform of fs.readdirSync(dir)) {
    const helper = path.join(dir, platform, 'spawn-helper')
    if (fs.existsSync(helper)) fs.chmodSync(helper, 0o755)
  }
}
