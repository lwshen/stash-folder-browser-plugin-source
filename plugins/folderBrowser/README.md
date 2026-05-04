# Folder Browser

Adds a Stash UI page at `/folders` for folder-first browsing.

## Current features

- Adds a `Folders` button to the main navigation.
- Shows scanned library root folders.
- Opens folders and lists direct sub-folders.
- Mixes scenes and images in one grid for the selected folder.
- Displays scanned HEIC/HEIF images when the Stash backend supports them.
- Opens media through the native Stash detail pages:
  - scenes -> `/scenes/:id`
  - images -> `/images/:id`
- Filters the currently visible folder by name/path.

## Install

Copy this `folderBrowser` directory into your Stash plugins directory, then reload plugins from Stash settings and refresh the browser page.

For example:

```text
<stash config dir>/plugins/folderBrowser/
  folderBrowser.yml
  folderBrowser.js
  folderBrowser.css
```

## Notes

This is a first-pass UI plugin. It only shows scanned Stash objects, not arbitrary files that have not been scanned into Stash. It also limits media to the selected folder itself; recursive browsing can be added later with an "include sub-folders" toggle.
