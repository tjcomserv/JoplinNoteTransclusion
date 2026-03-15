const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const publishDir = path.join(projectRoot, 'publish');
const outputPath = path.join(publishDir, 'fastbat-note-transclusion.jpl');

const buildResult = spawnSync(process.execPath, [path.join(__dirname, 'build.js')], {
	stdio: 'inherit',
});

if (buildResult.error) throw buildResult.error;
if (buildResult.status !== 0) process.exit(buildResult.status);

fs.mkdirSync(publishDir, { recursive: true });
fs.rmSync(outputPath, { force: true });

const result = spawnSync(
	'tar',
	[
		'-cf',
		outputPath,
		'-C',
		distDir,
		'index.js',
		'manifest.json',
	],
	{ stdio: 'inherit' },
);

if (result.error) throw result.error;
process.exit(result.status === null ? 1 : result.status);
