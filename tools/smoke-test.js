const assert = require('assert');
const plugin = require('../src/index.js');

function installMockNotes(notes) {
	global.joplin = {
		data: {
			get: async (path) => {
				const noteId = path[1];
				if (!notes[noteId]) throw new Error(`Missing note: ${noteId}`);
				return notes[noteId];
			},
		},
	};
}

async function testNestedTransclusionIgnoresCodeFences() {
	installMockNotes({
		bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			title: 'Child Note',
			body: 'Child body\n\n[Grandchild](&:/cccccccccccccccccccccccccccccccc)\n\n```md\n[Ignored](&:/dddddddddddddddddddddddddddddddd)\n```',
		},
		cccccccccccccccccccccccccccccccc: {
			id: 'cccccccccccccccccccccccccccccccc',
			title: 'Grandchild',
			body: 'Nested body',
		},
		dddddddddddddddddddddddddddddddd: {
			id: 'dddddddddddddddddddddddddddddddd',
			title: 'Ignored',
			body: 'Should not render',
		},
	});

	const result = await plugin.buildExpandedNote(
		{
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			body: 'Intro\n\n[Child Note](&:/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)\n\nOutro',
		},
		{
			includeNoteTitle: true,
			baseHeadingLevel: 2,
			maxDepth: 10,
		},
	);
	const output = result.body;

	assert(output.includes('## Child Note'));
	assert(output.includes('### Grandchild'));
	assert(output.includes('[Ignored](&:/dddddddddddddddddddddddddddddddd)'));
	assert(!output.includes('Should not render'));
	assert.strictEqual(result.stats.detected, 2);
	assert.strictEqual(result.stats.expanded, 2);
}

async function testLeadingAmpersandSyntaxWorks() {
	installMockNotes({
		bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			title: 'Child Note',
			body: 'Child body',
		},
	});

	const result = await plugin.buildExpandedNote(
		{
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			body: '&[Child Note](:/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)',
		},
		{
			includeNoteTitle: true,
			baseHeadingLevel: 2,
			maxDepth: 10,
		},
	);
	const output = result.body;

	assert(output.includes('## Child Note'));
	assert(output.includes('Child body'));
	assert(!output.includes('&[Child Note]'));
	assert.strictEqual(result.stats.detected, 1);
	assert.strictEqual(result.stats.expanded, 1);
}

async function testDoubleAmpersandAddsPageBreak() {
	installMockNotes({
		bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			title: 'Child Note',
			body: 'Child body',
		},
	});

	const result = await plugin.buildExpandedNote(
		{
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			body: 'Before\n\n&&[Child Note](:/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)\n\nAfter',
		},
		{
			includeNoteTitle: true,
			baseHeadingLevel: 2,
			maxDepth: 10,
		},
	);
	const output = result.body;

	assert(output.includes('<div style="page-break-before: always; break-before: page;"></div>'));
	assert(output.includes('## Child Note'));
	assert.strictEqual(result.stats.detected, 1);
	assert.strictEqual(result.stats.expanded, 1);
}

async function testTopLevelDoubleAmpersandSkipsInitialPageBreak() {
	installMockNotes({
		bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			title: 'Child Note',
			body: 'Child body',
		},
	});

	const result = await plugin.buildExpandedNote(
		{
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			body: '\n\n&&[Child Note](:/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)',
		},
		{
			includeNoteTitle: true,
			baseHeadingLevel: 2,
			maxDepth: 10,
		},
	);
	const output = result.body;

	assert(!output.includes('<div style="page-break-before: always; break-before: page;"></div>'));
	assert(output.includes('## Child Note'));
	assert.strictEqual(result.stats.detected, 1);
	assert.strictEqual(result.stats.expanded, 1);
}

async function testNoteTitlesCanBeHidden() {
	installMockNotes({
		bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			title: 'Child Note',
			body: 'Child body',
		},
	});

	const result = await plugin.buildExpandedNote(
		{
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			body: '&[Child Note](:/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)',
		},
		{
			includeNoteTitle: false,
			baseHeadingLevel: 2,
			maxDepth: 10,
		},
	);
	const output = result.body;

	assert(output.includes('Child body'));
	assert(!output.includes('## Child Note'));
	assert.strictEqual(result.stats.detected, 1);
	assert.strictEqual(result.stats.expanded, 1);
}

async function testCircularTransclusionProducesWarning() {
	installMockNotes({
		bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb: {
			id: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
			title: 'Child Note',
			body: '[Root](&:/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa)',
		},
	});

	const result = await plugin.buildExpandedNote(
		{
			id: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
			body: '[Child Note](&:/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb)',
		},
		{
			includeNoteTitle: true,
			baseHeadingLevel: 2,
			maxDepth: 10,
		},
	);
	const output = result.body;

	assert(output.includes('Circular note reference detected'));
	assert.strictEqual(result.stats.detected, 2);
	assert.strictEqual(result.stats.expanded, 1);
}

(async () => {
	await testNestedTransclusionIgnoresCodeFences();
	await testLeadingAmpersandSyntaxWorks();
	await testDoubleAmpersandAddsPageBreak();
	await testTopLevelDoubleAmpersandSkipsInitialPageBreak();
	await testNoteTitlesCanBeHidden();
	await testCircularTransclusionProducesWarning();
	console.log('Smoke tests passed.');
})().catch((error) => {
	console.error(error);
	process.exit(1);
});
