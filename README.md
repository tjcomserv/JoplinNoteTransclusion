<p align="center">
  <img src="assets/FastBat_Logo_batOnly.png" alt="FastBat logo" width="320">
</p>

# FastBat Note Transclusion

Export the current Joplin note to PDF with note transclusions expanded at export time.

This Joplin desktop plugin adds explicit PDF-time transclusion syntax, so linked notes can be pulled into the exported document instead of showing up as plain note links.

## What it does

Normal Joplin note links look like this:

```md
[Child Note](:/0123456789abcdef0123456789abcdef)
```

This plugin adds a transclusion form for PDF export:

```md
[Child Note](&:/0123456789abcdef0123456789abcdef)
```

It also accepts the exact leading-ampersand form:

```md
&[Child Note](:/0123456789abcdef0123456789abcdef)
```

To force the transcluded note onto a new PDF page, use a double ampersand:

```md
&&[Child Note](:/0123456789abcdef0123456789abcdef)
```

or:

```md
[Child Note](&&:/0123456789abcdef0123456789abcdef)
```

If a `&&` transclusion is the first meaningful line in the note, the initial page break is ignored so the PDF does not start with a blank page.

When you run the plugin export command, each transclusion link is replaced with the full body of the linked note before the PDF is generated.

## Highlights

- Leaves Joplin's built-in `Export to PDF` action unchanged
- Adds `Export current note to PDF with transclusions`
- Adds `Create preview note with transclusions` for quick inspection
- Supports nested transclusions
- Detects circular references and replaces them with a warning block
- Ignores fenced code blocks
- Lets you include or suppress inserted note titles
- Places commands under `Tools > Note Transclusion`

## Install

### Normal install

1. Run `npm run package`
2. In Joplin, open `Tools > Options > Plugins`
3. Choose the gear menu, then `Install from file`
4. Select `publish/fastbat-note-transclusion.jpl`
5. Restart Joplin

### Development install

1. Run `npm run dist`
2. In Joplin, open the plugin development settings
3. Point Joplin at this project folder
4. Restart Joplin

Joplin will load `dist/index.js` and `dist/manifest.json` from the project root.

## Usage

1. Copy a normal Joplin note link
2. Change it to either `&[Note](:/noteId)` or `[Note](&:/noteId)`
3. Use `&&` instead of `&` if that transcluded note should start on a new PDF page
4. Put that link on its own line where you want the other note to appear
5. Run `Export current note to PDF with transclusions` from the `Note` menu, the `Tools > Note Transclusion` submenu, or the toolbar button

## Debugging

If you want to confirm transclusion before exporting, run `Create preview note with transclusions`.
The plugin will create and open a sibling note containing the expanded markdown.

## Settings

- Include transcluded note titles
- Base heading level for inserted note titles
- Maximum nested transclusion depth
