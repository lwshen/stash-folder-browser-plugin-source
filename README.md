# Stash Folder Browser Plugin Source

This repository publishes a Stash plugin source through GitHub raw files.

Use this source URL in Stash:

```text
https://raw.githubusercontent.com/Warden630/stash-folder-browser-plugin-source/main/index.yml
```

Use that URL in:

```text
Stash -> Settings -> Plugins -> Available Plugins -> Add Source
```

Then install `Folder Browser`.

## Published files

The repository root contains:

- `index.yml`
- `folderBrowser.zip`

## Plugin

Source files live in:

```text
plugins/folderBrowser/
```

## Quick publish

With GitHub CLI authenticated:

```bash
./publish.sh stash-folder-browser-plugin-source
```
