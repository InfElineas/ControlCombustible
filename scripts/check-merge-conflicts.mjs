import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const MARKER_REGEX = /^(<<<<<<<|=======|>>>>>>>)\b/;
const IGNORE_DIRS = new Set(['.git', 'node_modules', 'dist', 'build', '.next', 'coverage']);
const TARGET_EXTENSIONS = new Set(['.js', '.jsx', '.ts', '.tsx', '.css', '.scss', '.json', '.md', '.sql', '.html']);

const hasAllowedExtension = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  return TARGET_EXTENSIONS.has(ext);
};

const findings = [];

function scanDirectory(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    const relativePath = path.relative(ROOT, absolutePath);

    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue;
      scanDirectory(absolutePath);
      continue;
    }

    if (!entry.isFile() || !hasAllowedExtension(absolutePath)) continue;

    const content = fs.readFileSync(absolutePath, 'utf8');
    const lines = content.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (MARKER_REGEX.test(line)) {
        findings.push(`${relativePath}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

scanDirectory(ROOT);

if (findings.length > 0) {
  console.error('❌ Se detectaron marcadores de conflicto de Git:');
  findings.forEach((line) => console.error(`  - ${line}`));
  process.exit(1);
}

console.log('✅ No se detectaron marcadores de conflicto de Git.');
