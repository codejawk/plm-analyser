// Fake interactive CLI: asks for approval, waits for "y", then writes a review result.
import fs from 'fs'
import path from 'path'
import readline from 'readline'
const [, , workspace] = process.argv
process.stdout.write('Working on it…\r\nDo you want to proceed? (y/n) ')
const rl = readline.createInterface({ input: process.stdin })
rl.on('line', (answer) => {
  process.stdout.write(`\r\ngot: ${answer}\r\n`)
  fs.writeFileSync(
    path.join(workspace, '.orchestrator', 'result.json'),
    JSON.stringify({ status: 'review', summary: `approved with ${answer}` })
  )
  // A real CLI keeps running after the task; the orchestrator closes the session.
  setInterval(() => {}, 1000)
})
