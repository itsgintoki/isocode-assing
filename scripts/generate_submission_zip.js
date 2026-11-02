const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { generateTddPdf } = require('./generate_tdd_pdf');

function createSubmissionZip() {
  const rootDir = path.join(__dirname, '..');
  const tddPdf = path.join(rootDir, 'docs/TDD.pdf');
  const deploymentMd = path.join(rootDir, 'deployment.md');
  const stagingDir = path.join(rootDir, 'staging_submission');
  const zipOutput = path.join(rootDir, 'submission.zip');

  console.log('Generating latest TDD PDF...');
  generateTddPdf();

  // Wait briefly for file stream flush
  setTimeout(() => {
    if (!fs.existsSync(tddPdf)) {
      throw new Error(`TDD PDF not found at ${tddPdf}`);
    }
    if (!fs.existsSync(deploymentMd)) {
      throw new Error(`deployment.md not found at ${deploymentMd}`);
    }

    if (!fs.existsSync(stagingDir)) {
      fs.mkdirSync(stagingDir, { recursive: true });
    }

    // Copy exact 2 required files
    fs.copyFileSync(tddPdf, path.join(stagingDir, 'TDD.pdf'));
    fs.copyFileSync(deploymentMd, path.join(stagingDir, 'deployment.md'));

    // Remove old zip if present
    if (fs.existsSync(zipOutput)) {
      fs.unlinkSync(zipOutput);
    }

    // Zip files using zip -j
    execSync(`zip -j "${zipOutput}" "${path.join(stagingDir, 'TDD.pdf')}" "${path.join(stagingDir, 'deployment.md')}"`, {
      cwd: rootDir,
      stdio: 'inherit'
    });

    // Clean up staging dir
    fs.rmSync(stagingDir, { recursive: true, force: true });

    const stats = fs.statSync(zipOutput);
    console.log('\n=============================================');
    console.log('SUCCESS: Submission ZIP Package Ready!');
    console.log(`File: ${zipOutput}`);
    console.log(`Size: ${(stats.size / 1024).toFixed(2)} KB (Limit: 25 MB)`);
    console.log('Archive contents:');
    execSync(`unzip -l "${zipOutput}"`, { stdio: 'inherit' });
    console.log('=============================================\n');
  }, 1000);
}

if (require.main === module) {
  createSubmissionZip();
}

module.exports = { createSubmissionZip };
