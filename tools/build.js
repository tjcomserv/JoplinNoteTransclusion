const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const sourceDir = path.join(projectRoot, 'src');
const distDir = path.join(projectRoot, 'dist');

function copyFile(filename) {
	const sourcePath = path.join(sourceDir, filename);
	const distPath = path.join(distDir, filename);
	fs.copyFileSync(sourcePath, distPath);
	console.log(`Copied ${path.relative(projectRoot, sourcePath)} -> ${path.relative(projectRoot, distPath)}`);
}

fs.mkdirSync(distDir, { recursive: true });
copyFile('index.js');
copyFile('manifest.json');
