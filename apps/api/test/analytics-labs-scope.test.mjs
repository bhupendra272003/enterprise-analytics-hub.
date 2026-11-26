import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Leader lab listing is scoped to labs task assigned to the Leader team', async () => {
  const source = await readFile(new URL('../src/routes/analyticsLabs.js', import.meta.url), 'utf8');
  const leaderClause = source.match(/else if\(role==='LEADER'\)\{sql\+='([^']+)'\;args\.push\(([^)]+)\);\}/);
  assert.ok(leaderClause, 'Leader listing clause exists');
  assert.match(leaderClause[1], /l\.task_id IN \(SELECT t\.id FROM tasks t JOIN teams tm ON tm\.id=t\.team_id WHERE tm\.organization_id=\? AND tm\.leader_user_id=\?\)/);
  assert.doesNotMatch(leaderClause[1], /owner_user_id/);
  assert.equal(leaderClause[2], 'req.params.orgId,req.user.id');
});

test('Leader detail and event endpoints use task-team membership scope', async () => {
  const source = await readFile(new URL('../src/routes/analyticsLabs.js', import.meta.url), 'utf8');
  const scopeQuery = /SELECT 1 FROM tasks t JOIN teams tm ON tm\.id=t\.team_id WHERE t\.id=\? AND tm\.organization_id=\? AND tm\.leader_user_id=\? LIMIT 1/g;
  assert.equal([...source.matchAll(scopeQuery)].length, 2, 'detail and events should both verify task scope');
});
