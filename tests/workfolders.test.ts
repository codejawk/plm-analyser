import os from 'os'
import path from 'path'
import { describe, expect, it } from 'vitest'
import { folderName, resolveWorkFolder } from '../src/main/workfolders'

const ws = { plmRoot: '/w/PLM', githubRoot: '/w/gh', githubRepos: { 'org/app': '/src/app' }, manualRoot: '~/Tasks' }

describe('work folders', () => {
  it('uses the chosen folder first', () => {
    expect(resolveWorkFolder({ title: 'x', source: 'plm', externalId: 'P1', repoPath: '/custom' }, ws)).toBe(path.resolve('/custom'))
  })
  it('puts PLMs under the PLM root by id', () => {
    expect(resolveWorkFolder({ title: 'Crash', source: 'plm', externalId: 'P260918-0412' }, ws)).toBe(path.join('/w/PLM', 'P260918-0412'))
  })
  it('maps GitHub repos to known clones or <root>/<repo>', () => {
    expect(resolveWorkFolder({ title: 'x', source: 'github', externalId: 'org/app#3' }, ws)).toBe(path.resolve('/src/app'))
    expect(resolveWorkFolder({ title: 'x', source: 'github', externalId: 'org/other#3' }, ws)).toBe(path.join('/w/gh', 'other'))
  })
  it('puts manual tasks under the manual root by title, expanding ~', () => {
    expect(resolveWorkFolder({ title: 'Build a demo: world clock?', source: 'manual' }, ws)).toBe(
      path.join(os.homedir(), 'Tasks', 'Build-a-demo-world-clock')
    )
  })
  it('makes safe folder names', () => {
    expect(folderName('  a/b\\c:*?  ')).toBe('a-b-c')
    expect(folderName('...')).toBe('task')
  })
})
