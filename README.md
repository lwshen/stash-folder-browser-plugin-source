# Stash Folder Browser Plugin Source

Folder Browser is a Stash plugin that adds a folder-first media browsing
experience for people who organize their library by directory structure. It
adds a dedicated `/folders` page with a directory tree, mixed media browsing,
mobile-friendly controls, and a more touch-oriented playback flow.

This repository publishes the plugin source through GitHub raw files so it can
be added directly as a Stash plugin source.

## What It Does

Folder Browser gives Stash a file-manager-style browsing surface on top of the
existing Stash media library. It does not replace Stash metadata, scanning,
playback, or GraphQL APIs; it reuses them and presents scenes and images around
folders.

It is especially useful when:

- your media is already organized into meaningful folders;
- you want to browse by directory before tags or performers;
- you use Stash from an iPhone or mobile browser;
- you want a denser wall view for mixed video and image libraries.

## Features

- Adds a `Folders` entry to the Stash navigation menu.
- Shows a folder tree with expandable nested folders.
- Opens folders into a media wall of videos or images.
- Displays HEIC/HEIF images when Stash has scanned them, using generated
  previews in the wall and the original file when opened or downloaded.
- Adds a mobile image viewer with swipe navigation, pinch zoom, double-tap
  landscape mode, progressive original loading, and edge-swipe return.
- Supports including or excluding child folders.
- Supports sorting, size presets, selection, move, rename, delete, and download
  actions for supported Stash media entries.
- Provides desktop and mobile layouts with separate density presets.
- Adds an iPhone-oriented mobile folder drawer.
- Remembers the selected folder and restores the drawer position when reopened.
- Adds mobile playback refinements for scene pages:
  - video-area tap toggles play/pause;
  - blank player areas reveal controls without toggling playback;
  - landscape/portrait orientation controls;
  - mobile sprite navigation strip;
  - session playback progress restore.
- Keeps the plugin self-contained in the Stash plugin system.

## Current Scope

The plugin is a frontend experience layer. It depends on Stash for media
scanning, thumbnails, sprites, streaming, file metadata, and backend mutations.
If Stash does not scan or generate a preview for a file format, the plugin
cannot fully support that format by itself.

Backend-level items, such as media scanning, old AVI sprite generation
robustness, full folder filesystem operations, and native offline iPhone
caching, remain outside this plugin's scope.

Use this source URL in Stash:

```text
https://raw.githubusercontent.com/Warden630/stash-folder-browser-plugin-source/main/index.yml
```

Use that URL in:

```text
Stash -> Settings -> Plugins -> Available Plugins -> Add Source
```

Then install `Folder Browser`.

After installing or updating the plugin, reload plugins in Stash and refresh the
browser page.

## Published files

The repository root contains:

- `index.yml`
- `folderBrowser.zip`

## Plugin

Source files live in:

```text
plugins/folderBrowser/
```

The distributable plugin package is:

```text
folderBrowser.zip
```

## Quick publish

With GitHub CLI authenticated:

```bash
./publish.sh stash-folder-browser-plugin-source
```
