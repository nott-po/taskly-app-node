#!/usr/bin/env node
// claude -p --agent skips the skills preload and --json-schema, so the skills go into the system prompt
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib.mjs';

// Just enough YAML for agent and skill frontmatter
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text };
  const data = {};
  let listKey = null;
  for (const line of match[1].split(/\r?\n/)) {
    const item = /^\s+-\s+(.+)$/.exec(line);
    if (item && listKey) { data[listKey].push(item[1].trim()); continue; }
    const pair = /^([\w-]+):\s*(.*)$/.exec(line);
    if (!pair) { listKey = null; continue; }
    listKey = pair[2] === '' ? pair[1] : null;
    data[pair[1]] = pair[2] === '' ? [] : pair[2].trim();
  }
  return { data, body: text.slice(match[0].length) };
}

const list = (value) => (Array.isArray(value) ? value : String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean));

export function buildAgent(agentFile, readFile = (file) => readFileSync(file, 'utf8')) {
  const { data, body } = parseFrontmatter(readFile(agentFile));
  const skillsDir = path.posix.join(path.posix.dirname(path.posix.dirname(agentFile.replaceAll('\\', '/'))), 'skills');
  const skills = list(data.skills);
  const sections = skills.map((name) => {
    if (!/^[a-z0-9-]+$/.test(name)) throw new Error(`Invalid skill name: ${name}`);
    const dir = `${skillsDir}/${name}`;
    const skill = parseFrontmatter(readFile(`${dir}/SKILL.md`)).body.trim()
      // Skill links are relative to SKILL.md
      .replace(/\]\((?!https?:|#|\/)([^)]+)\)/g, (_, target) => `](${dir}/${target})`);
    return `<skill name="${name}" path="${dir}/SKILL.md">\n${skill}\n</skill>`;
  });
  const prompt = [
    body.trim(),
    '',
    `# Skills\n\nThese skills are loaded in full below. Follow each one at the step that names it. Files they link to can be opened with Read.`,
    '',
    ...sections,
  ].join('\n');
  return {
    name: data.name,
    // --json-schema adds StructuredOutput itself
    tools: list(data.tools).filter((tool) => tool !== 'StructuredOutput'),
    maxTurns: Number(data.maxTurns ?? 50),
    skills,
    prompt: `${prompt}\n`,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const agent = buildAgent(args.agent ?? '.claude/agents/unit-test-agent.md');
  writeFileSync(args['prompt-out'], agent.prompt);
  const { prompt, ...meta } = agent;
  writeFileSync(args.out, `${JSON.stringify(meta, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
