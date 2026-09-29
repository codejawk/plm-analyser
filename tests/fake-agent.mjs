// Fake agent CLI for tests: fake-agent.mjs <workspace> <status> [exitCode]
import fs from 'fs'
import path from 'path'
const [, , workspace, status, code = '0'] = process.argv
console.log(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: `fake agent: ${status}` }] } }))
if (status !== 'none') {
  fs.writeFileSync(
    path.join(workspace, '.orchestrator', 'result.json'),
    JSON.stringify({ status, summary: `summary ${status}`, question: status === 'needs_user' ? 'Raise a Qualcomm case?' : undefined, artifacts: [{ type: 'scl', ref: '123' }] })
  )
}
process.exit(Number(code))
