#!/usr/bin/env node
/**
 * Build the two-file submission archive:
 *   submission.zip
 *     ├── TDD.pdf
 *     └── deployment.md
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { generateTddPdf } = require('./generate_tdd_pdf');

function assertPublicRepositoryUrl() {
  const tddMarkdown = fs.readFileSync(path.join(__dirname, '../docs/TDD.md'), 'utf8');
  const repository = tddMarkdown.match(/\*\*Public repository:\*\*\s*`?([^`\n]+)`?/i)?.[1]?.trim();

  if (!repository || !/^https:\/\/github\.com\/[^/\s]+\/[^/\s]+/i.test(repository)) {
    throw new Error(
      'docs/TDD.md needs a real public GitHub repository URL before packaging the submission.'
    );
  }
  if (/\[owner\]|your-org|your-repo|example\.com/i.test(repository)) {
    throw new Error(`Replace the placeholder repository URL in docs/TDD.md: ${repository}`);
  }
  return repository;
}

async function createSubmissionZip() {
  const rootDir = path.join(__dirname, '..');
  const tddPdf = path.join(rootDir, 'docs/TDD.pdf');
  const deploymentMd = path.join(rootDir, 'deployment.md');
  const stagingDir = path.join(rootDir, 'staging_submission');
  const zipOutput = path.join(rootDir, 'submission.zip');

  const repository = assertPublicRepositoryUrl();

  console.log('Generating latest TDD PDF...');
  await generateTddPdf({ quiet: false });

  if (!fs.existsSync(tddPdf)) throw new Error(`TDD PDF not found at ${tddPdf}`);
  if (!fs.existsSync(deploymentMd)) throw new Error(`deployment.md not found at ${deploymentMd}`);

  fs.rmSync(stagingDir, { recursive: true, force: true });
  fs.mkdirSync(stagingDir, { recursive: true });
  fs.copyFileSync(tddPdf, path.join(stagingDir, 'TDD.pdf'));
  fs.copyFileSync(deploymentMd, path.join(stagingDir, 'deployment.md'));

  fs.rmSync(zipOutput, { force: true });
  execFileSync('zip', ['-j', zipOutput, path.join(stagingDir, 'TDD.pdf'), path.join(stagingDir, 'deployment.md')], {
    cwd: rootDir,
    stdio: 'inherit'
  });
  fs.rmSync(stagingDir, { recursive: true, force: true });

  const size = fs.statSync(zipOutput).size;
  if (size > 25 * 1024 * 1024) {
    throw new Error(`submission.zip is ${(size / 1024 / 1024).toFixed(1)} MB, over the 25 MB limit.`);
  }

  const listing = execFileSync('unzip', ['-l', zipOutput], { encoding: 'utf8' });
  const files = listing
    .split('\n')
    .map((line) => line.trim().split(/\s+/))
    .filter((parts) => parts.length === 4 && /\d{2}-\d{2}-\d{4}/.test(parts[1]))
    .map((parts) => parts[3])
    .filter(Boolean)
    .sort();

  if (files.join(',') !== 'TDD.pdf,deployment.md') {
    throw new Error(`submission.zip contains unexpected files: ${files.join(', ')}`);
  }

  console.log('\n=============================================');
  console.log('SUCCESS: Submission ZIP package ready');
  console.log(`Repository: ${repository}`);
  console.log(`File: ${zipOutput}`);
  console.log(`Size: ${(size / 1024).toFixed(1)} KB (limit: 25 MB)`);
  console.log('Archive contents:');
  console.log(listing.trim());
  console.log('=============================================\n');
}

if (require.main === module) {
  createSubmissionZip().catch((error) => {
    console.error(`Submission packaging failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { createSubmissionZip };
