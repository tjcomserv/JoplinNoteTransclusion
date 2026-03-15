const PLUGIN_ID = 'fastbat-note-transclusion';
const COMMAND_NAME = `${PLUGIN_ID}.exportCurrentNoteToPdf`;
const PREVIEW_COMMAND_NAME = `${PLUGIN_ID}.createPreviewNote`;
const SETTINGS_SECTION = `${PLUGIN_ID}.section`;
const BRAND_NAME = 'FastBat';
const TOOLS_MENU_LABEL = 'Note Transclusion';
const EXPORT_COMMAND_LABEL = 'Export current note to PDF with transclusions';
const PREVIEW_COMMAND_LABEL = 'Create preview note with transclusions';

const SETTINGS = {
	includeNoteTitle: `${PLUGIN_ID}.includeNoteTitle`,
	baseHeadingLevel: `${PLUGIN_ID}.baseHeadingLevel`,
	maxDepth: `${PLUGIN_ID}.maxDepth`,
};

const SETTING_ITEM_TYPE_INT = 1;
const SETTING_ITEM_TYPE_BOOL = 3;

const MENU_ITEM_LOCATION_NOTE = 'note';
const MENU_ITEM_LOCATION_TOOLS = 'tools';
const TOOLBAR_BUTTON_LOCATION_NOTE = 'noteToolbar';
const TRANSCLUSION_ICON = 'icon-link';

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function normalizeNewlines(text) {
	return String(text || '').replace(/\r\n/g, '\n');
}

function hasMeaningfulContent(line) {
	return String(line || '').trim().length > 0;
}

function sanitizeHeadingText(text) {
	return String(text || '').replace(/\s+/g, ' ').trim() || 'Untitled note';
}

function parseFence(line) {
	const match = line.match(/^\s*(`{3,}|~{3,})/);
	if (!match) return null;

	return {
		char: match[1][0],
		length: match[1].length,
	};
}

function isClosingFence(line, fence) {
	const match = line.match(/^\s*(`{3,}|~{3,})\s*$/);
	if (!match) return false;

	return match[1][0] === fence.char && match[1].length >= fence.length;
}

function parseTransclusionLine(line) {
	const match = line.match(/^\s*(&{1,2})?\s*\[([^\]]*)\]\(([^)]+)\)\s*$/);
	if (!match) return null;

	const leadingAmpersands = match[1] || '';
	let label = match[2].trim();
	let target = match[3].trim();
	let isTransclusion = Boolean(leadingAmpersands);
	let pageBreak = leadingAmpersands === '&&';

	if (target.startsWith('&&:/')) {
		isTransclusion = true;
		pageBreak = true;
		target = target.slice(2);
	} else if (target.startsWith('&:/')) {
		isTransclusion = true;
		target = target.slice(1);
	} else if (label.startsWith('&&') && target.startsWith(':/')) {
		isTransclusion = true;
		pageBreak = true;
		label = label.slice(2).trim();
	} else if (label.startsWith('&') && target.startsWith(':/')) {
		isTransclusion = true;
		label = label.slice(1).trim();
	}

	if (!isTransclusion) return null;

	const noteMatch = target.match(/^:\/([0-9a-fA-F]{32})(?:#.*)?$/);
	if (!noteMatch) return null;

	return {
		label,
		noteId: noteMatch[1],
		pageBreak,
	};
}

function buildWarningBlock(title, details) {
	const lines = [
		'<!-- joplin-note-transclusion warning -->',
		`**${title}**`,
	];

	if (details) lines.push(details);

	return `\n${lines.join('\n\n')}\n`;
}

function buildTransclusionBlock(note, expandedBody, options) {
	const lines = ['<!-- joplin-note-transclusion start -->'];
	const cleanBody = String(expandedBody || '').trim();

	if (options.pageBreak) {
		lines.push('<div style="page-break-before: always; break-before: page;"></div>');
	}

	if (options.includeNoteTitle) {
		const headingLevel = clamp(options.headingLevel, 1, 6);
		lines.push(`${'#'.repeat(headingLevel)} ${sanitizeHeadingText(note.title || options.fallbackLabel)}`);
	}

	if (cleanBody) {
		lines.push(cleanBody);
	} else {
		lines.push('_This transcluded note is empty._');
	}

	lines.push('<!-- joplin-note-transclusion end -->');

	return `\n${lines.join('\n\n')}\n`;
}

async function loadSettings() {
	return {
		includeNoteTitle: Boolean(await joplin.settings.value(SETTINGS.includeNoteTitle)),
		baseHeadingLevel: clamp(Number(await joplin.settings.value(SETTINGS.baseHeadingLevel)) || 2, 1, 6),
		maxDepth: clamp(Number(await joplin.settings.value(SETTINGS.maxDepth)) || 10, 1, 30),
	};
}

async function loadNote(noteId, noteCache) {
	if (noteCache.has(noteId)) return noteCache.get(noteId);

	const note = await joplin.data.get(['notes', noteId], {
		fields: ['id', 'parent_id', 'title', 'body'],
	});

	noteCache.set(noteId, note);
	return note;
}

async function expandMarkdown(markdown, context) {
	const lines = normalizeNewlines(markdown).split('\n');
	const output = [];
	let activeFence = null;
	let seenMeaningfulContent = false;

	for (const line of lines) {
		if (activeFence) {
			output.push(line);
			if (hasMeaningfulContent(line)) seenMeaningfulContent = true;

			if (isClosingFence(line, activeFence)) {
				activeFence = null;
			}

			continue;
		}

		const fence = parseFence(line);
		if (fence) {
			activeFence = fence;
			output.push(line);
			seenMeaningfulContent = true;
			continue;
		}

		const transclusion = parseTransclusionLine(line);
		if (!transclusion) {
			output.push(line);
			if (hasMeaningfulContent(line)) seenMeaningfulContent = true;
			continue;
		}

		context.stats.detected += 1;
		output.push(await renderTransclusion({
			...transclusion,
			pageBreak: transclusion.pageBreak && seenMeaningfulContent,
		}, context));
		seenMeaningfulContent = true;
	}

	return output.join('\n');
}

async function renderTransclusion(transclusion, context) {
	if (context.depth >= context.settings.maxDepth) {
		return buildWarningBlock(
			'Transclusion skipped',
			`Maximum transclusion depth of ${context.settings.maxDepth} reached for note \`${transclusion.noteId}\`.`,
		);
	}

	if (context.stack.includes(transclusion.noteId)) {
		return buildWarningBlock(
			'Transclusion skipped',
			`Circular note reference detected for note \`${transclusion.noteId}\`.`,
		);
	}

	let note = null;
	try {
		note = await loadNote(transclusion.noteId, context.noteCache);
	} catch (error) {
		return buildWarningBlock(
			'Transclusion skipped',
			`Could not load note \`${transclusion.noteId}\`: ${String(error && error.message ? error.message : error)}`,
		);
	}

	const expandedBody = await expandMarkdown(note.body || '', {
		...context,
		depth: context.depth + 1,
		stack: context.stack.concat(note.id),
	});

	context.stats.expanded += 1;

	return buildTransclusionBlock(note, expandedBody, {
		includeNoteTitle: context.settings.includeNoteTitle,
		headingLevel: context.settings.baseHeadingLevel + context.depth,
		fallbackLabel: transclusion.label,
		pageBreak: transclusion.pageBreak,
	});
}

async function buildExpandedNote(note, settings) {
	const stats = {
		detected: 0,
		expanded: 0,
	};

	const body = await expandMarkdown(note.body || '', {
		depth: 0,
		noteCache: new Map(),
		settings,
		stack: [note.id],
		stats,
	});

	return {
		body,
		stats,
	};
}

async function exportCurrentNoteToPdf() {
	const note = await joplin.workspace.selectedNote();
	if (!note || !note.id) {
		await joplin.views.dialogs.showMessageBox('Select a note before exporting.');
		return;
	}

	const settings = await loadSettings();
	const expandedNote = await buildExpandedNote(note, settings);

	if (!expandedNote.stats.detected) {
		await joplin.views.dialogs.showMessageBox(
			'No transclusion links were detected.\n\nUse &[Note Title](:/noteId) or [Note Title](&:/noteId) on its own line.',
		);
		return;
	}

	let temporaryNoteId = null;

	try {
		const temporaryNote = await joplin.data.post(['notes'], null, {
			parent_id: note.parent_id,
			title: note.title || 'Untitled note',
			body: expandedNote.body,
		});

		temporaryNoteId = temporaryNote.id;
		await joplin.commands.execute('exportPdf', [temporaryNoteId]);
	} catch (error) {
		console.error(`${PLUGIN_ID}: export failed`, error);
		await joplin.views.dialogs.showMessageBox(
			`PDF export with transclusions failed.\n\n${String(error && error.message ? error.message : error)}`,
		);
	} finally {
		if (temporaryNoteId) {
			try {
				await joplin.data.delete(['notes', temporaryNoteId], { permanent: 1 });
			} catch (cleanupError) {
				console.error(`${PLUGIN_ID}: failed to delete temporary note`, cleanupError);
			}
		}
	}
}

async function createPreviewNote() {
	const note = await joplin.workspace.selectedNote();
	if (!note || !note.id) {
		await joplin.views.dialogs.showMessageBox('Select a note before creating a preview.');
		return;
	}

	const settings = await loadSettings();
	const expandedNote = await buildExpandedNote(note, settings);

	if (!expandedNote.stats.detected) {
		await joplin.views.dialogs.showMessageBox(
			'No transclusion links were detected.\n\nUse &[Note Title](:/noteId) or [Note Title](&:/noteId) on its own line.',
		);
		return;
	}

	const previewNote = await joplin.data.post(['notes'], null, {
		parent_id: note.parent_id,
		title: `${note.title || 'Untitled note'} (Transclusion Preview)`,
		body: expandedNote.body,
	});

	await joplin.commands.execute('openNote', previewNote.id);
	await joplin.views.dialogs.showMessageBox(
		`Created preview note with ${expandedNote.stats.expanded} expanded transclusion${expandedNote.stats.expanded === 1 ? '' : 's'}.`,
	);
}

async function registerSettings() {
	await joplin.settings.registerSection(SETTINGS_SECTION, {
		label: `${BRAND_NAME} Note Transclusion`,
		description: `${BRAND_NAME} PDF export-time transclusion settings.`,
		iconName: TRANSCLUSION_ICON,
	});

	await joplin.settings.registerSettings({
		[SETTINGS.includeNoteTitle]: {
			public: true,
			section: SETTINGS_SECTION,
			type: SETTING_ITEM_TYPE_BOOL,
			value: true,
			label: 'Include transcluded note titles',
			description: 'Insert the included note title before each transcluded note body.',
		},
		[SETTINGS.baseHeadingLevel]: {
			public: true,
			section: SETTINGS_SECTION,
			type: SETTING_ITEM_TYPE_INT,
			value: 2,
			minimum: 1,
			maximum: 6,
			step: 1,
			label: 'Base heading level',
			description: 'Heading level used for the first transcluded note title.',
		},
		[SETTINGS.maxDepth]: {
			public: true,
			section: SETTINGS_SECTION,
			type: SETTING_ITEM_TYPE_INT,
			value: 10,
			minimum: 1,
			maximum: 30,
			step: 1,
			label: 'Maximum transclusion depth',
			description: 'Protects against runaway nested transclusions.',
		},
	});
}

async function registerCommand() {
	await joplin.commands.register({
		name: COMMAND_NAME,
		label: EXPORT_COMMAND_LABEL,
		iconName: TRANSCLUSION_ICON,
		enabledCondition: 'oneNoteSelected',
		execute: async () => {
			await exportCurrentNoteToPdf();
		},
	});

	await joplin.commands.register({
		name: PREVIEW_COMMAND_NAME,
		label: PREVIEW_COMMAND_LABEL,
		iconName: 'fas fa-copy',
		enabledCondition: 'oneNoteSelected',
		execute: async () => {
			await createPreviewNote();
		},
	});

	await joplin.views.menuItems.create(`${PLUGIN_ID}.menu.note`, COMMAND_NAME, MENU_ITEM_LOCATION_NOTE);
	await joplin.views.menuItems.create(`${PLUGIN_ID}.menu.preview.note`, PREVIEW_COMMAND_NAME, MENU_ITEM_LOCATION_NOTE);
	await joplin.views.menus.create(`${PLUGIN_ID}.menu.toolsGroup`, TOOLS_MENU_LABEL, [
		{
			commandName: COMMAND_NAME,
			label: EXPORT_COMMAND_LABEL,
		},
		{
			commandName: PREVIEW_COMMAND_NAME,
			label: PREVIEW_COMMAND_LABEL,
		},
	], MENU_ITEM_LOCATION_TOOLS);
	await joplin.views.toolbarButtons.create(
		`${PLUGIN_ID}.toolbar.note`,
		COMMAND_NAME,
		TOOLBAR_BUTTON_LOCATION_NOTE,
	);
}

async function onStart() {
	await registerSettings();
	await registerCommand();
}

if (typeof joplin !== 'undefined' && joplin.plugins && joplin.plugins.register) {
	joplin.plugins.register({
		onStart,
	});
}

if (typeof module !== 'undefined') {
	module.exports = {
		buildExpandedNote,
		buildTransclusionBlock,
		buildWarningBlock,
		expandMarkdown,
		parseTransclusionLine,
		parseFence,
		isClosingFence,
		renderTransclusion,
		sanitizeHeadingText,
	};
}
