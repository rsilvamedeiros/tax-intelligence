import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative } from 'node:path';

const root = process.cwd();
const files = [];
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (
      [
        'node_modules',
        '.git',
        '.local',
        '.next',
        'dist',
        '.turbo',
        'coverage',
      ].includes(entry.name)
    )
      continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    else if (entry.name.endsWith('.md')) files.push(path);
  }
}
await scan(root);
const problems = [];
let skills = 0;
for (const path of files) {
  const content = await readFile(path, 'utf8');
  for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const target = match[1].replace(/^<|>$/g, '').split('#')[0];
    if (!target || /^(https?:|mailto:|app:)/.test(target)) continue;
    const destination = resolve(dirname(path), decodeURIComponent(target));
    const local = relative(root, destination);
    if (local.startsWith('..'))
      problems.push(
        `${relative(root, path)}: link outside repository ${target}`,
      );
    else
      try {
        await stat(destination);
      } catch {
        problems.push(`${relative(root, path)}: missing link ${target}`);
      }
  }
  if (path.endsWith('SKILL.md')) {
    skills++;
    const frontmatter = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const name = frontmatter?.[1].match(/^name: ([a-z0-9-]+)$/m)?.[1];
    const description = frontmatter?.[1].match(/^description: (.+)$/m)?.[1];
    if (
      !name ||
      !description ||
      name !== relative(dirname(dirname(path)), dirname(path))
    ) {
      problems.push(`${relative(root, path)}: invalid skill metadata`);
    }
  }
}
if (problems.length) {
  console.error(problems.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    `Validated ${files.length} Markdown files, internal link targets and ${skills} skill manifests. External URLs and Markdown anchors are not checked.`,
  );
