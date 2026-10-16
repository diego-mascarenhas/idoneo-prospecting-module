import assert from 'node:assert/strict'
import test from 'node:test'
import { defaultProspectingPaths } from './paths.ts'

test('default prospecting paths stay on the mailer endpoints', () => {
  assert.equal(defaultProspectingPaths.index, '/mailer/prospects')
  assert.equal(defaultProspectingPaths.search, '/mailer/prospects/search')
  assert.equal(defaultProspectingPaths.import, '/mailer/prospects/import')
})
