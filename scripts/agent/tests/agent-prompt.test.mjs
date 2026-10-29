import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAgent, parseFrontmatter } from '../agent-prompt.mjs';

const files = {
  '.claude/agents/demo.md': '---\nname: demo\ntools: Read, Bash, StructuredOutput\nmaxTurns: 12\nskills:\n  - write-tests\n  - report\n---\n\nYou write tests.\n',
  '.claude/skills/write-tests/SKILL.md': '---\nname: write-tests\ndescription: x\n---\n\n# Write\n\nSee [examples.md](examples.md) and [docs](https://example.com).\n',
  '.claude/skills/report/SKILL.md': '---\nname: report\n---\nReport it.\n',
};
const read = (file) => {
  if (!(file in files)) throw new Error(`missing ${file}`);
  return files[file];
};

test('parses scalars, comma lists and item lists', () => {
  const { data, body } = parseFrontmatter(files['.claude/agents/demo.md']);
  assert.equal(data.name, 'demo');
  assert.deepEqual(data.skills, ['write-tests', 'report']);
  assert.equal(body.trim(), 'You write tests.');
});

test('inlines every listed skill and points its links at the repository', () => {
  const agent = buildAgent('.claude/agents/demo.md', read);
  assert.deepEqual(agent.tools, ['Read', 'Bash']);
  assert.equal(agent.maxTurns, 12);
  assert.deepEqual(agent.skills, ['write-tests', 'report']);
  assert.match(agent.prompt, /^You write tests\./);
  assert.match(agent.prompt, /<skill name="write-tests" path=".claude\/skills\/write-tests\/SKILL.md">/);
  assert.match(agent.prompt, /\]\(.claude\/skills\/write-tests\/examples.md\)/);
  assert.match(agent.prompt, /\]\(https:\/\/example.com\)/);
  assert.doesNotMatch(agent.prompt, /description: x/);
});

test('rejects skill names that could escape the skills directory', () => {
  const evil = { ...files, '.claude/agents/demo.md': '---\nskills:\n  - ../../secrets\n---\nx\n' };
  assert.throws(() => buildAgent('.claude/agents/demo.md', (file) => evil[file]), /Invalid skill name/);
});

test('builds the real agent with all of its skills', () => {
  const agent = buildAgent('.claude/agents/unit-test-agent.md');
  assert.ok(agent.skills.includes('review-test-quality'));
  for (const skill of agent.skills) assert.match(agent.prompt, new RegExp(`<skill name="${skill}"`));
  assert.ok(agent.prompt.length < 100_000, 'the prompt must fit in one command-line argument');
});
