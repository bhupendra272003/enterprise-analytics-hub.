import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('Leader lab listing is scoped to labs task assigned to the Leader team', async () => {
  const source = await readFile(new URL('../src/routes/analyticsLabs.js', import.meta.url), 'utf8');
  assert.match(source, /l\.task_id IN \(SELECT t\.id FROM tasks t JOIN teams tm ON tm\.id=t\.team_id WHERE tm\.organization_id=\? AND tm\.leader_user_id=\?\)/);
  assert.doesNotMatch(source, /l\.project_id IN \(SELECT p\.id FROM projects p JOIN tasks t JOIN teams tm/);
});
