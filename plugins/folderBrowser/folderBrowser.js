(function () {
  const api = window.PluginApi;
  if (!api) return;

  const React = api.React;
  const ReactDOM = api.ReactDOM;
  const { Button, Form } = api.libraries.Bootstrap;
  const { Link, NavLink } = api.libraries.ReactRouterDOM;
  const { FontAwesomeIcon } = api.libraries.ReactFontAwesome;
  const {
    faArrowLeft,
    faChevronLeft,
    faChevronRight,
    faDownload,
    faEllipsisV,
    faFolder,
    faFolderOpen,
    faInfo,
    faPause,
    faPlay,
    faRedoAlt,
    faSyncAlt,
    faTrashAlt,
  } = api.libraries.FontAwesomeSolid;

  const ROUTE = "/folders";
  const PLUGIN_PACKAGE_ID = "folderBrowser";
  const STATE_KEY = "folderBrowser.state.v1";
  const SCENE_PROGRESS_KEY_PREFIX = "folderBrowser.sceneProgress.v1";
  const SCENE_RETURN_PARAM = "folderBrowserReturn";
  const SCENE_PAGE_ROWS = 4;
  const IMAGE_PAGE_ROWS = 5;
  const WALL_GAP = 4;
  const MOBILE_MEDIA_WINDOW_LIMIT = 1000;
  const MOBILE_LAYOUT_QUERY = "(max-width: 900px)";
  const DEFAULT_SIDEBAR_WIDTH = 320;
  const MIN_SIDEBAR_WIDTH = 220;
  const MAX_SIDEBAR_WIDTH = 640;
  const SIZE_PRESETS = [
    { sceneWidth: 220, imageWidth: 160, wallHeight: 130 },
    { sceneWidth: 280, imageWidth: 190, wallHeight: 170 },
    { sceneWidth: 340, imageWidth: 212, wallHeight: 220 },
    { sceneWidth: 420, imageWidth: 212, wallHeight: 280 },
  ];
  const VIDEO_SIZE_PRESETS = SIZE_PRESETS;
  const IMAGE_SIZE_PRESETS = [
    { imageWidth: 190, wallHeight: 170 },
    { imageWidth: 212, wallHeight: 220 },
    { imageWidth: 260, wallHeight: 280 },
    { imageWidth: 320, wallHeight: 340 },
  ];
  const MOBILE_SIZE_LABELS = ["小", "中", "大"];
  const MOBILE_VIDEO_SIZE_PRESETS = [
    { wallHeight: 128, columns: 3 },
    { wallHeight: 158, columns: 2 },
    { wallHeight: 230, columns: 1 },
  ];
  const MOBILE_IMAGE_SIZE_PRESETS = [
    { wallHeight: 98, columns: 4 },
    { wallHeight: 128, columns: 3 },
    { wallHeight: 190, columns: 2 },
  ];
  const PDF_PREVIEW_EXTENSIONS = new Set([".pdf"]);
  const TEXT_PREVIEW_EXTENSIONS = new Set([
    ".txt",
    ".log",
    ".md",
    ".markdown",
    ".nfo",
    ".srt",
    ".vtt",
    ".json",
    ".xml",
    ".csv",
  ]);
  const SORT_OPTIONS = [
    { key: "filename", label: "文件名" },
    { key: "file_mod_time", label: "修改时间" },
    { key: "created_at", label: "入库时间" },
    { key: "filesize", label: "文件大小" },
  ];
  const baseURL = document.querySelector("base")?.getAttribute("href") ?? "/";
  const touchPreviewEnabled =
    window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches ||
    navigator.maxTouchPoints > 0;

  function iconNode(icon, fallback, className = "fa-icon") {
    return FontAwesomeIcon && icon
      ? React.createElement(FontAwesomeIcon, { icon, className })
      : fallback;
  }

  function mobileLayoutNow() {
    return window.matchMedia?.(MOBILE_LAYOUT_QUERY)?.matches ?? window.innerWidth <= 900;
  }

  function refreshCurrentPage() {
    window.location.reload();
  }

  async function updateFolderBrowserPluginPackage() {
    const data = await callGQL(INSTALLED_PLUGIN_PACKAGES_QUERY, {});
    const pluginPackage = data.installedPackages?.find((pkg) => pkg.package_id === PLUGIN_PACKAGE_ID);
    if (!pluginPackage?.sourceURL) {
      throw new Error("找不到 Folder Browser 的插件源。");
    }
    const fromVersion = pluginPackage.version || "?";
    const toVersion = pluginPackage.source_package?.version || "?";
    await callGQL(UPDATE_PLUGIN_PACKAGES_MUTATION, {
      packages: [{ id: pluginPackage.package_id, sourceURL: pluginPackage.sourceURL }],
    });
    return { fromVersion, toVersion };
  }

  function readFolderBrowserState() {
    try {
      const raw = window.sessionStorage?.getItem(STATE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function writeFolderBrowserState(state) {
    try {
      window.sessionStorage?.setItem(STATE_KEY, JSON.stringify(state));
    } catch (e) {
      // Ignore storage failures. Navigation should still work without state restore.
    }
  }

  function pageScrollElement() {
    return document.scrollingElement || document.documentElement || document.body;
  }

  function pageScrollY() {
    const element = pageScrollElement();
    return Math.max(
      window.scrollY || 0,
      window.pageYOffset || 0,
      element?.scrollTop || 0,
      document.documentElement?.scrollTop || 0,
      document.body?.scrollTop || 0
    );
  }

  function setPageScrollY(top) {
    const value = Math.max(0, Number(top) || 0);
    const element = pageScrollElement();
    if (element) element.scrollTop = value;
    if (document.documentElement) document.documentElement.scrollTop = value;
    if (document.body) document.body.scrollTop = value;
    window.scrollTo(0, value);
  }

  function restorePageScrollY(top) {
    const value = Math.max(0, Number(top) || 0);
    [0, 50, 150, 350, 700, 1200].forEach((delay) => {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => setPageScrollY(value));
      }, delay);
    });
  }

  function restoreSceneIntoView(sceneID, fallbackScrollY) {
    [0, 50, 150, 350, 700, 1200, 1800].forEach((delay) => {
      window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          const target = sceneID
            ? [...document.querySelectorAll(".folder-browser-video-wall-tile")]
                .find((node) => node.getAttribute("data-folder-scene-id") === String(sceneID))
            : null;
          if (target) {
            target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
          } else {
            setPageScrollY(fallbackScrollY || 0);
          }
        });
      }, delay);
    });
  }

  function restoreMediaIntoView(saved, fallbackScrollY) {
    if (saved?.activeView === "image" && saved.lastOpenedImageID) {
      [0, 50, 150, 350, 700, 1200, 1800].forEach((delay) => {
        window.setTimeout(() => {
          window.requestAnimationFrame(() => {
            const target = document.querySelector(`[data-folder-browser-image-id="${saved.lastOpenedImageID}"]`);
            if (target) {
              target.scrollIntoView({ block: "center", inline: "nearest", behavior: "auto" });
            } else {
              setPageScrollY(fallbackScrollY || 0);
            }
          });
        }, delay);
      });
      return;
    }
    restoreSceneIntoView(saved?.lastOpenedSceneID, fallbackScrollY);
  }

  async function callGQL(query, variables) {
    const response = await fetch(`${baseURL}graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query, variables }),
    });
    const json = await response.json();
    if (json.errors?.length) {
      throw new Error(json.errors.map((e) => e.message).join("; "));
    }
    return json.data;
  }

  async function callUploadGQL(query, variables, fileMappings, onProgress) {
    const form = new FormData();
    const map = {};
    form.append("operations", JSON.stringify({ query, variables }));
    fileMappings.forEach((mapping, index) => {
      map[String(index)] = [mapping.path];
    });
    form.append("map", JSON.stringify(map));
    fileMappings.forEach((mapping, index) => {
      form.append(String(index), mapping.file, mapping.file.name);
    });

    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${baseURL}graphql`);
      xhr.withCredentials = true;
      xhr.setRequestHeader("Accept", "application/json");
      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable || !onProgress) return;
        onProgress(event.loaded / Math.max(1, event.total), event.loaded, event.total);
      };
      xhr.onload = () => {
        let json = null;
        try {
          json = xhr.responseText ? JSON.parse(xhr.responseText) : null;
        } catch (e) {
          reject(new Error(xhr.responseText || "上传响应无法解析"));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error(json?.errors?.map((e) => e.message).join("; ") || xhr.statusText || `HTTP ${xhr.status}`));
          return;
        }
        if (json?.errors?.length) {
          reject(new Error(json.errors.map((e) => e.message).join("; ")));
          return;
        }
        resolve(json?.data);
      };
      xhr.onerror = () => reject(new Error("上传失败，请检查网络连接。"));
      xhr.onabort = () => reject(new Error("上传已取消。"));
      xhr.send(form);
    });
  }

  const FOLDER_FIELDS = `
    id
    path
    basename
    parent_folders {
      id
      path
      basename
    }
    sub_folders {
      id
    }
  `;

  const ROOT_FOLDERS_QUERY = `
    query FolderBrowserRootFolders($folderFilter: FolderFilterType!, $filter: FindFilterType) {
      findFolders(folder_filter: $folderFilter, filter: $filter) {
        folders { ${FOLDER_FIELDS} }
      }
    }
  `;

  const INSTALLED_PLUGIN_PACKAGES_QUERY = `
    query FolderBrowserInstalledPluginPackages {
      installedPackages(type: Plugin) {
        package_id
        sourceURL
        version
        source_package {
          version
        }
      }
    }
  `;

  const UPDATE_PLUGIN_PACKAGES_MUTATION = `
    mutation FolderBrowserUpdatePluginPackages($packages: [PackageSpecInput!]!) {
      updatePackages(type: Plugin, packages: $packages)
    }
  `;

  const FOLDER_CHILDREN_QUERY = `
    query FolderBrowserFolderChildren($folderID: ID!) {
      findFolder(id: $folderID) {
        sub_folders { ${FOLDER_FIELDS} }
      }
    }
  `;

  const FOLDER_LIST_ENTRIES_QUERY = `
    query FolderBrowserListEntries($path: String) {
      folderListEntries(path: $path) {
        path
        parent_path
        entries {
          path
          basename
          type
          media_type
          extension
          size
          mod_time
        }
      }
    }
  `;

  const FOLDER_CREATE_MUTATION = `
    mutation FolderBrowserFolderCreate($path: String!) {
      folderCreate(path: $path) { path basename type media_type }
    }
  `;

  const FOLDER_RENAME_MUTATION = `
    mutation FolderBrowserFolderRename($path: String!, $basename: String!) {
      folderRename(path: $path, basename: $basename) { path basename type media_type }
    }
  `;

  const FOLDER_MOVE_MUTATION = `
    mutation FolderBrowserFolderMove($path: String!, $destination: String!, $basename: String) {
      folderMove(path: $path, destination_folder: $destination, destination_basename: $basename) {
        path
        basename
        type
        media_type
      }
    }
  `;

  const FOLDER_COPY_MUTATION = `
    mutation FolderBrowserFolderCopy($path: String!, $destination: String!, $basename: String) {
      folderCopy(path: $path, destination_folder: $destination, destination_basename: $basename)
    }
  `;

  const FOLDER_DELETE_MUTATION = `
    mutation FolderBrowserFolderDelete($path: String!) {
      folderDelete(path: $path)
    }
  `;

  const FILE_RENAME_MUTATION = `
    mutation FolderBrowserFileRename($path: String!, $basename: String!) {
      fileRename(path: $path, basename: $basename) { path basename type media_type }
    }
  `;

  const FILE_MOVE_MUTATION = `
    mutation FolderBrowserFileMove($path: String!, $destination: String!, $basename: String) {
      fileMove(path: $path, destination_folder: $destination, destination_basename: $basename) {
        path
        basename
        type
        media_type
      }
    }
  `;

  const FILE_COPY_MUTATION = `
    mutation FolderBrowserFileCopy($path: String!, $destination: String!, $basename: String) {
      fileCopy(path: $path, destination_folder: $destination, destination_basename: $basename)
    }
  `;

  const FILE_UPLOAD_MUTATION = `
    mutation FolderBrowserFileUpload($input: FolderBrowserUploadFileInput!) {
      fileUpload(input: $input) {
        path
        basename
        type
        media_type
        extension
        size
        mod_time
      }
    }
  `;

  const FOLDER_UPLOAD_MUTATION = `
    mutation FolderBrowserFolderUpload($input: FolderBrowserUploadFolderInput!) {
      folderUpload(input: $input) {
        path
        basename
        type
        media_type
        extension
        size
        mod_time
      }
    }
  `;

  const FIND_JOB_QUERY = `
    query FolderBrowserFindJob($input: FindJobInput!) {
      findJob(input: $input) {
        id
        status
        subTasks
        description
        progress
        startTime
        endTime
        addTime
        error
      }
    }
  `;

  const FILE_DELETE_MUTATION = `
    mutation FolderBrowserFileDelete($path: String!) {
      fileDelete(path: $path)
    }
  `;

  const SCENES_QUERY = `
    query FolderBrowserScenes(
      $folderCriterion: HierarchicalMultiCriterionInput!
      $mediaFilter: FindFilterType
    ) {
      findScenes(
        scene_filter: { files_filter: { parent_folder: $folderCriterion } }
        filter: $mediaFilter
      ) {
        count
        scenes {
          id
          title
          details
          date
          rating100
          organized
          o_counter
          resume_time
          interactive_speed
          paths { screenshot preview stream vtt interactive_heatmap }
          files {
            id
            path
            basename
            duration
            format
            width
            height
            size
            video_codec
            audio_codec
            frame_rate
            bit_rate
            mod_time
            created_at
            updated_at
            parent_folder { id path }
            fingerprints { type value }
          }
          studio { id name image_path }
          tags { id name }
          performers { id name disambiguation image_path }
          groups { group { id name } scene_index }
          scene_markers { id title seconds primary_tag { id name } }
          galleries { id title }
        }
      }
    }
  `;

  const SCENE_SPRITES_QUERY = `
    query FolderBrowserSceneSprites($id: ID!) {
      findScene(id: $id) {
        id
        paths { vtt }
        files { duration }
      }
    }
  `;

  const IMAGES_QUERY = `
    query FolderBrowserImages(
      $folderCriterion: HierarchicalMultiCriterionInput!
      $mediaFilter: FindFilterType
    ) {
      findImages(
        image_filter: { files_filter: { parent_folder: $folderCriterion } }
        filter: $mediaFilter
      ) {
        count
        images {
          id
          title
          date
          details
          photographer
          rating100
          o_counter
          created_at
          updated_at
          custom_fields
          visual_files {
            __typename
            ... on ImageFile {
              id
              path
              width
              height
              format
              mod_time
              created_at
              updated_at
              fingerprints { type value }
            }
            ... on VideoFile {
              id
              path
              width
              height
              video_codec
              mod_time
              created_at
              updated_at
            }
          }
          galleries { id title files { path } folder { path } }
          paths { thumbnail preview image }
          files {
            id
            path
            basename
            parent_folder { id path }
            width
            height
            size
            format
            mod_time
            created_at
            updated_at
            fingerprints { type value }
          }
        }
      }
    }
  `;

  const MOVE_FILES_MUTATION = `
    mutation FolderBrowserMoveFiles($input: MoveFilesInput!) {
      moveFiles(input: $input)
    }
  `;

  const IMAGES_DESTROY_MUTATION = `
    mutation FolderBrowserImagesDestroy($input: ImagesDestroyInput!) {
      imagesDestroy(input: $input)
    }
  `;

  const SCENES_DESTROY_MUTATION = `
    mutation FolderBrowserScenesDestroy($input: ScenesDestroyInput!) {
      scenesDestroy(input: $input)
    }
  `;

  const METADATA_CLEAN_MUTATION = `
    mutation FolderBrowserMetadataClean($input: CleanMetadataInput!) {
      metadataClean(input: $input)
    }
  `;

  function rootFolderFilter() {
    return {
      parent_folder: { modifier: "IS_NULL" },
      zip_file: { modifier: "IS_NULL" },
    };
  }

  function mediaSortKey(sort) {
    return sort === "filename" ? "path" : sort;
  }

  function findFilter(sort, direction, perPage, page) {
    return {
      sort: mediaSortKey(sort),
      direction,
      per_page: perPage,
      page,
    };
  }

  function pageSizeForRows(contentWidth, itemWidth, rows, gap) {
    const usableWidth = contentWidth || 1200;
    const columns = Math.max(1, Math.floor((usableWidth + gap) / (itemWidth + gap)));
    return columns * rows;
  }

  function mobilePageSizeForRows(columns, rows) {
    return Math.max(1, columns || 1) * rows;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function mediaAspect(width, height, fallback) {
    if (!width || !height) return fallback;
    return Math.max(0.35, Math.min(3.2, width / height));
  }

  function imageAspect(item) {
    return mediaAspect(item.width, item.height, 1);
  }

  function completeWallItems(items, contentWidth, wallHeight, allLoaded, aspectForItem, fixedColumns) {
    if (allLoaded || items.length <= 1) return items;

    if (fixedColumns) {
      const completeCount = Math.floor(items.length / fixedColumns) * fixedColumns;
      return completeCount > 0 ? items.slice(0, completeCount) : items;
    }

    const usableWidth = contentWidth || 1200;
    let rowWidth = 0;
    let lastCompleteEnd = 0;

    items.forEach((item, index) => {
      const itemWidth = aspectForItem(item) * wallHeight;
      const nextWidth = rowWidth === 0 ? itemWidth : rowWidth + WALL_GAP + itemWidth;

      if (rowWidth > 0 && nextWidth > usableWidth) {
        lastCompleteEnd = index;
        rowWidth = itemWidth;
      } else {
        rowWidth = nextWidth;
      }
    });

    return lastCompleteEnd > 0 ? items.slice(0, lastCompleteEnd) : items;
  }

  function sceneAspect(scene) {
    const file = primarySceneFile(scene);
    return mediaAspect(file?.width, file?.height, 16 / 9);
  }

  function formatBytes(value) {
    if (!value) return "";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let size = value;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
      size /= 1024;
      unit += 1;
    }
    return `${size.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
  }

  function formatDuration(seconds) {
    if (!seconds && seconds !== 0) return "";
    const total = Math.max(0, Math.floor(seconds));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const secs = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }

  function formatBitrate(value) {
    const bitrate = Number(value);
    if (!Number.isFinite(bitrate) || bitrate <= 0) return "";
    if (bitrate >= 1000 * 1000) return `${(bitrate / 1000 / 1000).toFixed(2)} Mbps`;
    if (bitrate >= 1000) return `${(bitrate / 1000).toFixed(0)} Kbps`;
    return `${bitrate} bps`;
  }

  function formatFrameRate(value) {
    const frameRate = Number(value);
    if (!Number.isFinite(frameRate) || frameRate <= 0) return "";
    return `${Number.isInteger(frameRate) ? frameRate : frameRate.toFixed(2)} fps`;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function videoQualityLabel(file) {
    if (!file?.height) return "";
    return `${file.height}p`;
  }

  function detailValue(value) {
    if (value === null || value === undefined || value === "") return "-";
    if (Array.isArray(value)) return value.length ? value.join(", ") : "-";
    if (typeof value === "object") {
      const entries = Object.entries(value);
      if (!entries.length) return "-";
      return entries.map(([key, val]) => `${key}: ${val}`).join("\n");
    }
    return String(value);
  }

  function detailRow(label, value) {
    return [
      React.createElement("dt", { key: `${label}-label` }, label),
      React.createElement("dd", { key: `${label}-value` }, detailValue(value)),
    ];
  }

  function folderCriterion(folderID, includeChildren) {
    const criterion = {
      value: [folderID],
      modifier: "EQUALS",
    };

    if (includeChildren) {
      criterion.depth = -1;
    }

    return criterion;
  }

  function primarySceneFile(scene) {
    return scene.files?.[0];
  }

  function primaryImageFile(image) {
    return image.files?.[0];
  }

  function fileFormat(file) {
    const format = String(file?.format || "").toLowerCase();
    if (format) return format;
    const basename = String(file?.basename || file?.path || "").toLowerCase();
    const match = /\.([a-z0-9]+)$/.exec(basename);
    return match ? match[1] : "";
  }

  function isHEIFFile(file) {
    return ["heic", "heif"].includes(fileFormat(file));
  }

  function imageDisplayPath(image, file) {
    const paths = image?.paths || {};
    if (isHEIFFile(file)) {
      return paths.image || paths.preview || paths.thumbnail;
    }
    return paths.image || paths.preview || paths.thumbnail;
  }

  function imagePreviewPath(image) {
    const paths = image?.paths || {};
    return paths.thumbnail || paths.preview || paths.image;
  }

  function imageItems(images) {
    return (images ?? []).map((image) => {
      const file = primaryImageFile(image);
      const displayPath = imageDisplayPath(image, file);
      const previewPath = imagePreviewPath(image);
      return {
        id: `image-${image.id}`,
        imageID: image.id,
        fileID: file?.id,
        parentFolderID: file?.parent_folder?.id,
        title: image.title || file?.basename || "Untitled image",
        path: file?.path || "",
        basename: file?.basename || image.title || "Untitled image",
        meta: file?.width && file?.height ? `${file.width}x${file.height}` : "",
        width: file?.width,
        height: file?.height,
        thumb: image.paths?.thumbnail || image.paths?.preview || image.paths?.image,
        preview: previewPath,
        full: displayPath,
        original: image.paths?.image || displayPath,
        href: `/images/${image.id}`,
        image,
      };
    });
  }

  function lightboxImage(item) {
    return {
      id: item.imageID,
      title: item.title,
      rating100: item.image?.rating100,
      o_counter: item.image?.o_counter,
      paths: item.image?.paths || {
        thumbnail: item.thumb,
        preview: item.full,
        image: item.full,
      },
      visual_files: item.image?.visual_files || [],
      galleries: item.image?.galleries || [],
    };
  }

  function asTreeNode(folder) {
    const knownChildCount = Array.isArray(folder.sub_folders) ? folder.sub_folders.length : undefined;
    return {
      ...folder,
      children: knownChildCount === 0 ? [] : undefined,
      expanded: knownChildCount === 0,
      loading: false,
    };
  }

  function findTreeNode(nodes, folderID) {
    for (const node of nodes) {
      if (node.id === folderID) return node;
      if (node.children) {
        const found = findTreeNode(node.children, folderID);
        if (found) return found;
      }
    }
    return undefined;
  }

  function findTreeNodeByPath(nodes, path) {
    if (!path) return undefined;
    for (const node of nodes) {
      if (node.path === path) return node;
      if (node.children) {
        const found = findTreeNodeByPath(node.children, path);
        if (found) return found;
      }
    }
    return undefined;
  }

  function isPathOnlyFolder(folder) {
    return Boolean(folder?.id && String(folder.id).startsWith("path:"));
  }

  function normalizePathKey(path) {
    return String(path || "").replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function pathBasename(path) {
    const normalized = normalizePathKey(path);
    if (!normalized) return "";
    const parts = normalized.split("/");
    return parts[parts.length - 1] || normalized;
  }

  function parentPathForPath(path, basename = pathBasename(path)) {
    const normalized = normalizePathKey(path);
    if (!normalized || !basename || !normalized.endsWith(basename)) return "";
    return normalized.slice(0, Math.max(0, normalized.length - basename.length)).replace(/[\\/]$/, "");
  }

  function pathOnlyParentFolders(path, explicitParentPath = "") {
    const parents = [];
    const seen = new Set();
    let currentPath = normalizePathKey(explicitParentPath) || parentPathForPath(path);
    while (currentPath && !seen.has(currentPath)) {
      seen.add(currentPath);
      const basename = pathBasename(currentPath);
      parents.push({
        id: `path:${currentPath}`,
        path: currentPath,
        basename,
        parent_path: parentPathForPath(currentPath, basename),
        parent_folders: [],
        sub_folders: [{ id: `${currentPath}/child` }],
      });
      currentPath = parentPathForPath(currentPath, basename);
    }
    parents.forEach((parent, index) => {
      parent.parent_folders = parents.slice(index + 1);
    });
    return parents;
  }

  function folderFromEntry(entry) {
    return {
      id: `path:${entry.path}`,
      path: entry.path,
      basename: entry.basename || pathBasename(entry.path),
      parent_path: entry.parent_path,
      parent_folders: pathOnlyParentFolders(entry.path, entry.parent_path),
      sub_folders: [{ id: `${entry.path}/child` }],
    };
  }

  function folderParentPath(folder) {
    if (folder?.parent_path) return normalizePathKey(folder.parent_path);
    return parentPathForPath(folder?.path, folder?.basename || pathBasename(folder?.path));
  }

  function folderActionEntry(folder) {
    if (!folder?.path) return null;
    return {
      path: folder.path,
      basename: folder.basename || pathBasename(folder.path),
      parent_path: folderParentPath(folder),
      type: "DIRECTORY",
      media_type: "DIRECTORY",
    };
  }

  function canMutateFolder(folder) {
    if (!folder?.path) return false;
    return Boolean(folderParentPath(folder) || isPathOnlyFolder(folder));
  }

  function joinFolderPath(parent, basename) {
    const cleanParent = normalizePathKey(parent);
    const cleanName = String(basename || "").replace(/^\/+|\/+$/g, "");
    return cleanParent ? `${cleanParent}/${cleanName}` : cleanName;
  }

  function mediaTypeLabel(entry) {
    if (entry.type === "DIRECTORY" || entry.media_type === "DIRECTORY") return "文件夹";
    if (entry.media_type === "VIDEO") return "视频";
    if (entry.media_type === "IMAGE") return "图片";
    if (entry.media_type === "GALLERY") return "图库";
    return "文件";
  }

  function isDirectoryEntry(entry) {
    return entry?.type === "DIRECTORY" || entry?.media_type === "DIRECTORY";
  }

  const COPY_JOB_TERMINAL_STATUSES = new Set(["FINISHED", "FAILED", "CANCELLED"]);

  function isTerminalCopyJob(job) {
    return COPY_JOB_TERMINAL_STATUSES.has(job?.status);
  }

  function copyJobStatusLabel(status) {
    switch (status) {
      case "READY":
        return "等待";
      case "RUNNING":
        return "复制中";
      case "FINISHED":
        return "完成";
      case "FAILED":
        return "失败";
      case "CANCELLED":
        return "已取消";
      case "STOPPING":
        return "停止中";
      default:
        return status || "未知";
    }
  }

  function formatJobProgress(progress) {
    if (!Number.isFinite(progress)) return "";
    const percent = progress <= 1 ? progress * 100 : progress;
    return `${Math.max(0, Math.min(100, percent)).toFixed(0)}%`;
  }

  function uploadStatusLabel(status) {
    switch (status) {
      case "RUNNING":
        return "上传中";
      case "FINISHED":
        return "上传完成";
      case "FAILED":
        return "上传失败";
      default:
        return status || "";
    }
  }

  function uploadRelativePath(file) {
    return String(file?.webkitRelativePath || file?.relativePath || file?.name || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "");
  }

  function entryExtension(entry) {
    const name = String(entry?.basename || entry?.path || "");
    const dot = name.lastIndexOf(".");
    const ext = entry?.extension || (dot >= 0 ? name.slice(dot) : "");
    return String(ext).toLowerCase();
  }

  function previewKindForEntry(entry) {
    if (!entry || isDirectoryEntry(entry)) return "";
    const ext = entryExtension(entry);
    if (PDF_PREVIEW_EXTENSIONS.has(ext)) return "pdf";
    if (TEXT_PREVIEW_EXTENSIONS.has(ext)) return "text";
    return "";
  }

  function canPreviewEntry(entry) {
    return Boolean(previewKindForEntry(entry));
  }

  function previewLabelForEntry(entry) {
    switch (previewKindForEntry(entry)) {
      case "pdf":
        return "PDF 预览";
      case "text":
        return "文本预览";
      default:
        return "";
    }
  }

  function folderBrowserFileURL(filePath, options = {}) {
    const endpoint = `${baseURL.replace(/\/$/, "")}/folder-browser/file`;
    const query = new URLSearchParams({ path: filePath || "" });
    if (options.download) query.set("download", "1");
    return `${endpoint}?${query.toString()}`;
  }

  function fileEntrySortValue(entry, sortKey) {
    if (sortKey === "filesize") return Number(entry.size) || 0;
    if (sortKey === "file_mod_time" || sortKey === "created_at") return new Date(entry.mod_time || 0).getTime() || 0;
    if (sortKey === "path") return String(entry.path || entry.basename || "").toLowerCase();
    return String(entry.basename || entry.path || "").toLowerCase();
  }

  function sortFileEntries(entries, sortState) {
    const direction = sortState.direction === "ASC" ? 1 : -1;
    return [...(entries ?? [])].sort((a, b) => {
      const aDir = isDirectoryEntry(a);
      const bDir = isDirectoryEntry(b);
      if (aDir !== bDir) return aDir ? -1 : 1;
      const aValue = fileEntrySortValue(a, sortState.key);
      const bValue = fileEntrySortValue(b, sortState.key);
      if (typeof aValue === "number" && typeof bValue === "number") return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue), undefined, { sensitivity: "base", numeric: true }) * direction;
    });
  }

  function friendlyFileApiError(error) {
    const message = error?.message || String(error || "");
    if (message.includes("delete_trash_path")) {
      return "删除失败：后端仍要求配置回收站路径，请确认 Stash fork 已更新并重启。";
    }
    return message;
  }

  function expandedFolderIDs(nodes) {
    const ids = [];
    function walk(items) {
      items.forEach((item) => {
        if (item.expanded) ids.push(item.id);
        if (item.children) walk(item.children);
      });
    }
    walk(nodes);
    return ids;
  }

  function sortFolders(folders) {
    return (folders ?? [])
      .slice()
      .sort((a, b) =>
        (a.basename || a.path).localeCompare(b.basename || b.path, undefined, {
          sensitivity: "base",
        })
      );
  }

  async function loadFolderChildren(folderID) {
    const data = await callGQL(FOLDER_CHILDREN_QUERY, { folderID });
    return sortFolders(data.findFolder.sub_folders).map(asTreeNode);
  }

  async function restoreTreeState(rootFolders, savedState) {
    if (!savedState) return rootFolders;

    let tree = rootFolders;
    const savedExpandedIDs = new Set(savedState.expandedFolderIDs ?? []);
    const savedFolder = savedState.currentFolder;
    const savedPathIDs = [
      ...((savedFolder?.parent_folders ?? []).map((folder) => folder.id).reverse()),
      savedFolder?.id || savedState.currentFolderID,
    ].filter(Boolean);
    const expansionOrder = [
      ...savedPathIDs,
      ...[...savedExpandedIDs].filter((id) => !savedPathIDs.includes(id)),
    ];

    for (const folderID of expansionOrder) {
      const node = findTreeNode(tree, folderID);
      if (!node) continue;
      if (Array.isArray(node.children)) {
        tree = updateTreeNode(tree, folderID, (current) => ({
          ...current,
          expanded: current.children.length > 0,
        }));
        continue;
      }

      try {
        const children = await loadFolderChildren(folderID);
        tree = updateTreeNode(tree, folderID, (current) => ({
          ...current,
          children,
          expanded: children.length > 0,
          loading: false,
        }));
      } catch (e) {
        console.error("[Folder Browser] Failed to restore folder tree", e);
      }
    }

    return tree;
  }

  function updateTreeNode(nodes, folderID, updater) {
    return nodes.map((node) => {
      if (node.id === folderID) {
        return updater(node);
      }
      if (!node.children) return node;
      return { ...node, children: updateTreeNode(node.children, folderID, updater) };
    });
  }

  function FolderTreeNode({ folder, depth, currentID, onSelect, onToggle, onContextMenu }) {
    const isActive = folder.id === currentID;
    const hasLoadedChildren = Array.isArray(folder.children);
    const hasChildren = hasLoadedChildren ? folder.children.length > 0 : true;
    const canExpand = folder.loading || hasChildren;

    return React.createElement(
      React.Fragment,
      null,
      React.createElement(
        "div",
        {
          className: "folder-browser-tree-row" + (isActive ? " active" : ""),
          onClick: () => onSelect(folder),
          onDoubleClick: (event) => {
            event.preventDefault();
            window.getSelection()?.removeAllRanges();
            onToggle(folder);
          },
          onContextMenu: (event) => onContextMenu?.(event, folder),
          style: { "--folder-depth": depth },
        },
        React.createElement(
          "button",
          {
            className: "folder-browser-tree-toggle",
            disabled: !canExpand,
            onClick: (event) => {
              event.stopPropagation();
              onToggle(folder);
            },
            title: folder.expanded ? "Collapse" : "Expand",
          },
          folder.loading ? "..." : !hasChildren ? "v" : folder.expanded ? "v" : ">"
        ),
        React.createElement(
          "button",
          {
            className: "folder-browser-tree-label",
            title: folder.path,
            onClick: (event) => {
              event.stopPropagation();
              onSelect(folder);
            },
          },
          FontAwesomeIcon
            ? React.createElement(FontAwesomeIcon, {
                icon: folder.expanded ? faFolderOpen : faFolder,
                className: "folder-browser-tree-icon",
              })
            : null,
          React.createElement("span", null, folder.basename || folder.path)
        )
      ),
      folder.expanded && hasLoadedChildren
        ? folder.children.map((child) =>
            React.createElement(FolderTreeNode, {
              key: child.id,
              folder: child,
              depth: depth + 1,
              currentID,
              onSelect,
              onToggle,
              onContextMenu,
            })
          )
        : null
    );
  }

  function CopyJobIndicator({ jobs, onClear }) {
    const [open, setOpen] = React.useState(false);
    const rootRef = React.useRef(null);
    const list = React.useMemo(
      () => Object.values(jobs || {}).sort((a, b) => (b.updatedAt || b.startedAt || 0) - (a.updatedAt || a.startedAt || 0)),
      [jobs]
    );
    const activeCount = list.filter((job) => !isTerminalCopyJob(job)).length;
    const failedCount = list.filter((job) => job.status === "FAILED").length;
    const hasJobs = list.length > 0;

    React.useEffect(() => {
      if (!open) return undefined;
      function closeOnOutside(event) {
        if (rootRef.current?.contains(event.target)) return;
        setOpen(false);
      }
      window.addEventListener("pointerdown", closeOnOutside, true);
      return () => window.removeEventListener("pointerdown", closeOnOutside, true);
    }, [open]);

    if (!hasJobs) return null;

    const buttonLabel = activeCount
      ? `复制 ${activeCount}`
      : failedCount
        ? `失败 ${failedCount}`
        : "复制完成";

    return React.createElement(
      "div",
      { className: "folder-browser-copy-jobs", ref: rootRef },
      React.createElement(
        "button",
        {
          type: "button",
          className: "folder-browser-copy-jobs-button" + (activeCount ? " active" : "") + (failedCount ? " failed" : ""),
          onClick: () => setOpen((current) => !current),
          title: "复制任务状态",
        },
        React.createElement("span", { className: "folder-browser-copy-jobs-icon", "aria-hidden": "true" }),
        React.createElement("span", null, buttonLabel)
      ),
      open
        ? React.createElement(
            "div",
            { className: "folder-browser-copy-jobs-panel" },
            React.createElement(
              "div",
              { className: "folder-browser-copy-jobs-head" },
              React.createElement("strong", null, "复制任务"),
              React.createElement("button", { type: "button", onClick: onClear }, "清除")
            ),
            list.map((job) =>
              React.createElement(
                "div",
                { key: job.id, className: "folder-browser-copy-job-row" },
                React.createElement(
                  "div",
                  { className: "folder-browser-copy-job-main" },
                  React.createElement("span", { className: "folder-browser-copy-job-title" }, job.description || job.title || `复制任务 ${job.id}`),
                  React.createElement(
                    "span",
                    { className: "folder-browser-copy-job-status" },
                    copyJobStatusLabel(job.status),
                    formatJobProgress(job.progress) ? ` · ${formatJobProgress(job.progress)}` : ""
                  )
                ),
                job.subTasks?.length
                  ? React.createElement("div", { className: "folder-browser-copy-job-subtask" }, job.subTasks[job.subTasks.length - 1])
                  : null,
                job.error ? React.createElement("div", { className: "folder-browser-copy-job-error" }, job.error) : null
              )
            )
          )
        : null
    );
  }

  function UploadStatus({ status, onClear }) {
    if (!status) return null;
    const isActive = status.status === "RUNNING";
    const isFailed = status.status === "FAILED";
    const progressLabel = formatJobProgress(status.progress);

    return React.createElement(
      "div",
      { className: "folder-browser-upload-status" + (isActive ? " active" : "") + (isFailed ? " failed" : "") },
      React.createElement("span", { className: "folder-browser-upload-status-icon", "aria-hidden": "true" }),
      React.createElement(
        "div",
        { className: "folder-browser-upload-status-body" },
        React.createElement(
          "div",
          { className: "folder-browser-upload-status-main" },
          React.createElement("strong", null, status.title || "上传"),
          React.createElement("span", null, uploadStatusLabel(status.status), progressLabel ? ` · ${progressLabel}` : "")
        ),
        status.description ? React.createElement("div", { className: "folder-browser-upload-status-detail" }, status.description) : null,
        Number.isFinite(status.progress)
          ? React.createElement(
              "div",
              { className: "folder-browser-upload-status-track" },
              React.createElement("span", { style: { width: `${Math.max(0, Math.min(100, status.progress <= 1 ? status.progress * 100 : status.progress))}%` } })
            )
          : null,
        status.error ? React.createElement("div", { className: "folder-browser-upload-status-error" }, status.error) : null
      ),
      !isActive
        ? React.createElement("button", { type: "button", onClick: onClear, title: "关闭上传状态" }, "×")
        : null
    );
  }

  function Breadcrumbs({
    currentFolder,
    includeChildren,
    activeView,
    sortState,
    sizeIndex,
    sizeMax,
    previewAllVisible,
    mediaCount,
    allSelected,
    someSelected,
    copyJobs,
    onClearCopyJobs,
    onSelectAllChange,
    onIncludeChildrenChange,
    onActiveViewChange,
    onSortChange,
    onSizeChange,
    onPreviewAllVisibleChange,
    onOpen,
  }) {
    if (!currentFolder) {
      return React.createElement("div", { className: "folder-browser-pathbar" });
    }

    const parents = [...(currentFolder.parent_folders ?? [])].reverse();
    const pathFolders = [...parents, currentFolder];
    const crumbs = pathFolders.flatMap((folder, index) => {
      const isCurrent = folder.id === currentFolder.id;
      const name = folder.basename || folder.path;
      const crumb = React.createElement(
        Button,
        {
          key: folder.id,
          size: "sm",
          variant: "link",
          "aria-current": isCurrent ? "page" : undefined,
          onClick: isCurrent ? undefined : () => onOpen(folder),
          title: folder.path,
          className: "folder-browser-path-crumb" + (isCurrent ? " current" : ""),
        },
        name
      );

      if (index === 0) return [crumb];
      return [
        React.createElement("span", { key: `${folder.id}-slash`, className: "folder-browser-path-separator" }, "/"),
        crumb,
      ];
    });

    return React.createElement(
      "div",
      { className: "folder-browser-pathbar" },
      React.createElement("div", { className: "folder-browser-breadcrumbs" }, crumbs),
      React.createElement(
        "div",
        { className: "folder-browser-view-buttons" },
        React.createElement(CopyJobIndicator, { jobs: copyJobs, onClear: onClearCopyJobs }),
        activeView === "video"
          ? React.createElement(
              "button",
              {
                type: "button",
                className: "folder-browser-preview-toggle" + (previewAllVisible ? " active" : ""),
                onClick: () => onPreviewAllVisibleChange(!previewAllVisible),
                title: previewAllVisible ? "关闭自动播放可见预览" : "打开自动播放可见预览",
              },
              iconNode(previewAllVisible ? faPause : faPlay, previewAllVisible ? "Ⅱ" : "▶")
            )
          : null,
        onSelectAllChange
          ? React.createElement(
              "label",
              { className: "folder-browser-media-summary" },
              React.createElement("input", {
                type: "checkbox",
                checked: allSelected,
                ref: (input) => {
                  if (input) input.indeterminate = Boolean(someSelected && !allSelected);
                },
                onChange: (event) => onSelectAllChange(event.target.checked),
              }),
              React.createElement("span", null, `全选 ${mediaCount}`)
            )
          : React.createElement("span", { className: "folder-browser-media-summary" }, mediaCount),
        React.createElement(
          "div",
          { className: "folder-browser-sort-buttons" },
          SORT_OPTIONS.map((option) =>
            React.createElement(
              Button,
              {
                key: option.key,
                size: "sm",
                variant: sortState.key === option.key ? "primary" : "secondary",
                onClick: () => onSortChange(option.key),
              },
              `${option.label} ${sortState.key === option.key ? (sortState.direction === "DESC" ? "↓" : "↑") : ""}`
            )
          )
        ),
        activeView !== "other"
          ? React.createElement(
              "label",
              { className: "folder-browser-size-control" },
              React.createElement("span", null, "大小"),
              React.createElement(Form.Control, {
                type: "range",
                min: 0,
                max: sizeMax,
                value: sizeIndex,
                onChange: (event) => onSizeChange(Number(event.target.value)),
              })
            )
          : null,
        React.createElement(
          Button,
          {
            size: "sm",
            variant: includeChildren ? "primary" : "secondary",
            onClick: () => onIncludeChildrenChange(!includeChildren),
          },
          "包括子文件夹"
        ),
        React.createElement(
          Button,
          {
            size: "sm",
            variant: activeView === "video" ? "primary" : "secondary",
            onClick: () => onActiveViewChange("video"),
          },
          "视频"
        ),
          React.createElement(
            Button,
            {
              size: "sm",
              variant: activeView === "image" ? "primary" : "secondary",
              onClick: () => onActiveViewChange("image"),
            },
            "图片"
          ),
          React.createElement(
            Button,
            {
              size: "sm",
              variant: activeView === "other" ? "primary" : "secondary",
              onClick: () => onActiveViewChange("other"),
            },
            "其他"
          )
        )
      );
  }

  function MediaViewHeader({ title, count, checked, indeterminate, onSelectAllChange }) {
    return React.createElement(
      "div",
      { className: "folder-browser-view-header" },
      onSelectAllChange
        ? React.createElement("input", {
            type: "checkbox",
            className: "folder-browser-section-check",
            checked,
            ref: (input) => {
              if (input) input.indeterminate = Boolean(indeterminate);
            },
            onChange: (event) => onSelectAllChange(event.target.checked),
          })
        : null,
      React.createElement("span", { className: "folder-browser-section-title" }, title),
      React.createElement("span", { className: "folder-browser-section-count" }, count)
    );
  }

  function MobileToolbar({
    currentFolder,
    activeView,
    mediaCount,
    sortState,
    includeChildren,
    previewAllVisible,
    sizeIndex,
    copyJobs,
    canActOnCurrentFolder,
    onClearCopyJobs,
    onOpenFolders,
    onCreateFolder,
    onUploadFiles,
    onUploadFolder,
    onRenameFolder,
    onMoveFolder,
    onCopyFolder,
    onDeleteFolder,
    onControlsToggle,
    controlsOpen,
    onActiveViewChange,
    onSortChange,
    onSizeChange,
    onIncludeChildrenChange,
    onPreviewAllVisibleChange,
  }) {
    const title = currentFolder ? currentFolder.basename || currentFolder.path : "选择目录";
    const subtitle = currentFolder ? currentFolder.path : "点目录选择媒体位置";

    return React.createElement(
      "div",
      { className: "folder-browser-mobile-toolbar" },
      React.createElement(
        "div",
        { className: "folder-browser-mobile-topbar" },
        React.createElement(Button, { size: "sm", variant: "secondary", onClick: onOpenFolders }, "目录"),
        React.createElement(
          "div",
          { className: "folder-browser-mobile-title", title: subtitle },
          React.createElement("span", null, title),
          React.createElement("small", null, subtitle)
        ),
        React.createElement(CopyJobIndicator, { jobs: copyJobs, onClear: onClearCopyJobs }),
        activeView === "video"
          ? React.createElement(
              "button",
              {
                type: "button",
                className: "folder-browser-preview-toggle folder-browser-mobile-preview-toggle" + (previewAllVisible ? " active" : ""),
                onClick: () => onPreviewAllVisibleChange(!previewAllVisible),
                title: previewAllVisible ? "关闭自动预览" : "打开自动预览",
                "aria-label": previewAllVisible ? "关闭自动预览" : "打开自动预览",
              },
              iconNode(previewAllVisible ? faPause : faPlay, previewAllVisible ? "Ⅱ" : "▶")
            )
          : null,
        React.createElement(
          Button,
          {
            size: "sm",
            variant: controlsOpen ? "primary" : "secondary",
            className: "folder-browser-mobile-more-button",
            onClick: onControlsToggle,
            title: "更多选项",
            "aria-label": "更多选项",
          },
          iconNode(faEllipsisV, "⋮")
        )
      ),
      React.createElement(
        "div",
        { className: "folder-browser-mobile-viewbar" },
        React.createElement(
          "div",
          { className: "folder-browser-mobile-view-switch folder-browser-mobile-control-cluster" },
          React.createElement(
            Button,
            { size: "sm", variant: activeView === "video" ? "primary" : "secondary", onClick: () => onActiveViewChange("video") },
            "视频"
          ),
          React.createElement(
            Button,
            { size: "sm", variant: activeView === "image" ? "primary" : "secondary", onClick: () => onActiveViewChange("image") },
            "图片"
          ),
          React.createElement(
            Button,
            { size: "sm", variant: activeView === "other" ? "primary" : "secondary", onClick: () => onActiveViewChange("other") },
            "其他"
          )
        ),
        activeView !== "other" ? React.createElement("span", { className: "folder-browser-mobile-divider" }) : null,
        activeView !== "other"
          ? React.createElement(
              "div",
              { className: "folder-browser-mobile-size-actions folder-browser-mobile-control-cluster" },
              MOBILE_SIZE_LABELS.map((label, index) =>
                React.createElement(
                  Button,
                  {
                    key: label,
                    size: "sm",
                    variant: sizeIndex === index ? "primary" : "secondary",
                    onClick: () => onSizeChange(index),
                  },
                  label
                )
              )
            )
          : null,
        React.createElement("span", { className: "folder-browser-mobile-divider" }),
        React.createElement(
          "div",
          { className: "folder-browser-mobile-quick-actions folder-browser-mobile-control-cluster" },
          React.createElement(
            Button,
            { size: "sm", variant: includeChildren ? "primary" : "secondary", onClick: () => onIncludeChildrenChange(!includeChildren) },
            "子文件夹"
          )
        ),
        React.createElement("span", { className: "folder-browser-mobile-divider" }),
        React.createElement(
          "div",
          { className: "folder-browser-mobile-count-group folder-browser-mobile-control-cluster" },
          React.createElement("span", { className: "folder-browser-mobile-count" }, mediaCount)
        )
      ),
      controlsOpen
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement("div", { className: "folder-browser-mobile-controls-backdrop", onClick: onControlsToggle }),
            React.createElement(
              "div",
              { className: "folder-browser-mobile-controls" },
              React.createElement(
                "div",
                { className: "folder-browser-mobile-control-group" },
                React.createElement("span", null, "排序"),
                React.createElement(
                  "div",
                  { className: "folder-browser-mobile-chip-row" },
                  SORT_OPTIONS.map((option) =>
                    React.createElement(
                      Button,
                      {
                        key: option.key,
                        size: "sm",
                        variant: sortState.key === option.key ? "primary" : "secondary",
                        onClick: () => onSortChange(option.key),
                      },
                      `${option.label}${sortState.key === option.key ? (sortState.direction === "DESC" ? "↓" : "↑") : ""}`
                    )
                  )
                )
              ),
              React.createElement(
                "div",
                { className: "folder-browser-mobile-control-group" },
                React.createElement("span", null, "文件"),
                React.createElement(
                  "div",
                  { className: "folder-browser-mobile-chip-row" },
                  React.createElement(Button, { size: "sm", variant: "secondary", disabled: !currentFolder, onClick: onCreateFolder }, "新建文件夹"),
                  React.createElement(Button, { size: "sm", variant: "secondary", disabled: !currentFolder, onClick: onUploadFiles }, "上传文件"),
                  React.createElement(Button, { size: "sm", variant: "secondary", disabled: !currentFolder, onClick: onUploadFolder }, "上传文件夹"),
                  React.createElement(Button, { size: "sm", variant: "secondary", disabled: !canActOnCurrentFolder, onClick: onRenameFolder }, "重命名"),
                  React.createElement(Button, { size: "sm", variant: "secondary", disabled: !canActOnCurrentFolder, onClick: onMoveFolder }, "移动"),
                  React.createElement(Button, { size: "sm", variant: "secondary", disabled: !canActOnCurrentFolder, onClick: onCopyFolder }, "复制"),
                  React.createElement(Button, { size: "sm", variant: "danger", disabled: !canActOnCurrentFolder, onClick: onDeleteFolder }, "删除")
                )
              )
            )
          )
        : null
    );
  }

  function MobileSelectionBar({ selectedCount, selectedImageCount, onDownload, onMove, onCopy, onRename, onDelete, onClear }) {
    if (!selectedCount) return null;

    return React.createElement(
      "div",
      { className: "folder-browser-mobile-selection-bar" },
      React.createElement("span", null, `已选 ${selectedCount}`),
      React.createElement(Button, { size: "sm", variant: "secondary", disabled: !selectedImageCount, onClick: onDownload }, "下载"),
      React.createElement(Button, { size: "sm", variant: "secondary", disabled: selectedCount !== 1, onClick: onRename }, "重命名"),
      React.createElement(Button, { size: "sm", variant: "secondary", onClick: onMove }, "移动"),
      React.createElement(Button, { size: "sm", variant: "secondary", onClick: onCopy }, "复制"),
      React.createElement(Button, { size: "sm", variant: "danger", onClick: onDelete }, "删除"),
      React.createElement(Button, { size: "sm", variant: "link", onClick: onClear }, "取消")
    );
  }

  function NavPluginUpdateButton() {
    const [status, setStatus] = React.useState("idle");
    const [versionLabel, setVersionLabel] = React.useState("");

    async function onClick() {
      if (status === "updating") return;
      setStatus("updating");
      try {
        const result = await updateFolderBrowserPluginPackage();
        setVersionLabel(`${result.fromVersion} → ${result.toVersion}`);
        setStatus("done");
        window.setTimeout(() => {
          setStatus("idle");
          setVersionLabel("");
        }, 7000);
      } catch (e) {
        console.error(e);
        setVersionLabel("");
        setStatus("error");
        window.setTimeout(() => setStatus("idle"), 4500);
      }
    }

    return React.createElement(
      Button,
      {
        className: "minimal folder-browser-nav-plugin-update",
        disabled: status === "updating",
        onClick,
        title: versionLabel ? `更新已提交：${versionLabel}` : "更新 Folder Browser 插件",
      },
      status === "updating"
        ? "更新中"
        : status === "done" && versionLabel
          ? versionLabel
          : status === "error"
            ? "更新失败"
            : "更新插件"
    );
  }

  function NavRefreshButton() {
    return React.createElement(
      Button,
      {
        className: "minimal folder-browser-nav-refresh",
        onClick: refreshCurrentPage,
        title: "刷新当前页面",
      },
      FontAwesomeIcon
        ? React.createElement(FontAwesomeIcon, { icon: faSyncAlt || faRedoAlt, className: "fa-icon" })
        : "刷新"
    );
  }

  function wallStyle(wallHeight, mobileColumns) {
    const style = { "--folder-wall-height": `${wallHeight}px`, "--folder-wall-gap": `${WALL_GAP}px` };
    if (mobileColumns) style["--folder-mobile-columns"] = mobileColumns;
    return style;
  }

  function mediaWallWindow(items, { enabled, wallRef, scrollTop, viewportHeight, wallHeight, columns }) {
    const count = items.length;
    const columnCount = Math.max(1, Number(columns) || 1);
    const rowsInWindow = Math.max(1, Math.floor(MOBILE_MEDIA_WINDOW_LIMIT / columnCount));
    const totalRows = Math.ceil(count / columnCount);
    if (!enabled || count <= MOBILE_MEDIA_WINDOW_LIMIT || totalRows <= rowsInWindow) {
      return { items, startIndex: 0, topSpacer: 0, bottomSpacer: 0 };
    }

    const rowHeight = wallHeight + WALL_GAP;
    const wallTop = Math.max(0, wallRef.current?.offsetTop || 0);
    const firstVisibleRow = Math.max(0, Math.floor((scrollTop - wallTop) / rowHeight));
    const viewportRows = Math.max(1, Math.ceil((viewportHeight || window.innerHeight || 800) / rowHeight));
    const focusRow = clamp(firstVisibleRow + Math.floor(viewportRows / 2), 0, totalRows - 1);
    const startRow = clamp(
      focusRow - Math.floor(rowsInWindow / 2),
      0,
      Math.max(0, totalRows - rowsInWindow)
    );
    const endRow = Math.min(totalRows, startRow + rowsInWindow);
    const startIndex = startRow * columnCount;
    const endIndex = Math.min(count, endRow * columnCount);

    return {
      items: items.slice(startIndex, endIndex),
      startIndex,
      topSpacer: Math.max(0, startRow * rowHeight - WALL_GAP),
      bottomSpacer: Math.max(0, (totalRows - endRow) * rowHeight - WALL_GAP),
    };
  }

  function SceneWallTile({ scene, selected, touchPreviewing, forcePreview, onBeforeOpen, onSelectionChange, onContextMenu, onTouchPreview }) {
    const [previewFailed, setPreviewFailed] = React.useState(false);
    const [hovering, setHovering] = React.useState(false);
    const longPressRef = React.useRef(null);
    const touchPreviewTriggeredRef = React.useRef(false);
    const file = primarySceneFile(scene);
    const preview = previewFailed ? null : scene.paths?.preview;
    const screenshot = scene.paths?.screenshot;
    const showPreview = (hovering || touchPreviewing || forcePreview) && preview;
    const source = showPreview ? preview : screenshot;
    const video = Boolean(showPreview);
    const title = scene.title || file?.basename || "Untitled scene";
    const filename = file?.basename || title;
    const quality = videoQualityLabel(file);
    const duration = formatDuration(file?.duration);

    function clearLongPressTimer() {
      if (!longPressRef.current) return;
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }

    function onPointerDown(event) {
      if (!touchPreviewEnabled || event.pointerType === "mouse") return;
      touchPreviewTriggeredRef.current = false;
      clearLongPressTimer();
      longPressRef.current = window.setTimeout(() => {
        touchPreviewTriggeredRef.current = true;
        onTouchPreview?.(scene.id);
      }, 450);
    }

    function onPointerUp() {
      clearLongPressTimer();
    }

    function onClick(event) {
      if (touchPreviewTriggeredRef.current) {
        event.preventDefault();
        event.stopPropagation();
        touchPreviewTriggeredRef.current = false;
        return;
      }
      onBeforeOpen(scene);
    }

    function onTileContextMenu(event) {
      if (touchPreviewEnabled) {
        event.preventDefault();
        event.stopPropagation();
        return;
      }
      onContextMenu(event, scene);
    }

    return React.createElement(
      Link,
      {
        className: "folder-browser-wall-tile folder-browser-video-wall-tile",
        "data-folder-scene-id": scene.id,
        to: `/scenes/${scene.id}?${SCENE_RETURN_PARAM}=1`,
        style: { "--folder-wall-aspect": sceneAspect(scene) },
        title: file?.path || title,
        onClick,
        onPointerDown,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onPointerLeave: onPointerUp,
        onMouseEnter: () => setHovering(true),
        onMouseLeave: () => setHovering(false),
        onFocus: () => setHovering(true),
        onBlur: () => setHovering(false),
        draggable: false,
        onContextMenu: onTileContextMenu,
      },
      source
        ? React.createElement(video ? "video" : "img", {
            src: source,
            alt: title,
            draggable: false,
            loading: "lazy",
            loop: video,
            muted: true,
            autoPlay: video,
            playsInline: video,
            poster: video ? screenshot : undefined,
            onError: video ? () => setPreviewFailed(true) : undefined,
          })
        : React.createElement("span", { className: "folder-browser-media-placeholder" }, "Video"),
      React.createElement("input", {
        type: "checkbox",
        className: "folder-browser-media-check",
        checked: selected,
        onChange: (event) => onSelectionChange(scene.id, event.target.checked),
        onClick: (event) => event.stopPropagation(),
      }),
      quality || duration
        ? React.createElement(
            "span",
            { className: "folder-browser-video-badges" },
          quality ? React.createElement("span", null, quality) : null,
            duration ? React.createElement("span", null, duration) : null
          )
        : null,
      React.createElement(
        "span",
        { className: "folder-browser-wall-caption" },
        filename
      )
    );
  }

  function WallSpacer({ height, position }) {
    if (!height) return null;
    return React.createElement("div", {
      key: `${position}-spacer`,
      className: "folder-browser-wall-spacer",
      style: { height: `${height}px` },
    });
  }

  function SceneWall({ scenes, wallHeight, mobileColumns, fillTail, selectedIDs, touchPreviewSceneID, previewSceneIDs, topSpacer, bottomSpacer, innerRef, onBeforeOpen, onSelectionChange, onContextMenu, onTouchPreview }) {
    return React.createElement(
      "div",
      {
        ref: innerRef,
        className: "folder-browser-media-wall" + (fillTail ? " folder-browser-media-wall-fill-tail" : ""),
        style: wallStyle(wallHeight, mobileColumns),
      },
      WallSpacer({ height: topSpacer, position: "top" }),
      scenes.map((scene) =>
        React.createElement(SceneWallTile, {
          key: scene.id,
          scene,
          selected: selectedIDs.includes(scene.id),
          touchPreviewing: scene.id === touchPreviewSceneID,
          forcePreview: previewSceneIDs?.includes(scene.id),
          onBeforeOpen,
          onSelectionChange,
          onContextMenu,
          onTouchPreview,
        })
      ),
      WallSpacer({ height: bottomSpacer, position: "bottom" })
    );
  }

  function LoadMoreButton({ disabled, loading, remaining, onLoad }) {
    if (remaining <= 0) return null;

    return React.createElement(
      "div",
      {
        className: "folder-browser-load-more" + (disabled || loading ? " disabled" : ""),
        onClick: disabled || loading ? undefined : onLoad,
        role: "button",
        tabIndex: disabled || loading ? -1 : 0,
        onKeyDown: (event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled && !loading) {
            event.preventDefault();
            onLoad();
          }
        },
      },
      React.createElement("span", null, loading ? "加载中..." : `加载更多 (${remaining})`)
    );
  }

  function AutoLoadMore({ disabled, loading, remaining, onLoad, innerRef }) {
    if (remaining <= 0) return null;

    return React.createElement(
      "div",
      {
        ref: innerRef,
        className: "folder-browser-load-more" + (disabled || loading ? " disabled" : ""),
        onClick: disabled || loading ? undefined : onLoad,
        role: "button",
        tabIndex: disabled || loading ? -1 : 0,
        onKeyDown: (event) => {
          if ((event.key === "Enter" || event.key === " ") && !disabled && !loading) {
            event.preventDefault();
            onLoad();
          }
        },
      },
      React.createElement("span", null, loading ? "加载中..." : `继续向下滚动自动加载 (${remaining})`)
    );
  }

  function folderBrowserRouteHref() {
    if (!baseURL || baseURL === "/") return ROUTE;
    return `${baseURL.replace(/\/$/, "")}${ROUTE}`;
  }

  function appRoutePath(pathname = window.location.pathname) {
    const basePath = baseURL && baseURL !== "/" ? new URL(baseURL, window.location.origin).pathname.replace(/\/$/, "") : "";
    const path = pathname.replace(/\/$/, "") || "/";
    if (basePath && path.startsWith(basePath)) {
      return path.slice(basePath.length).replace(/\/$/, "") || "/";
    }
    return path;
  }

  function isFolderBrowserPath(pathname = window.location.pathname) {
    return appRoutePath(pathname) === ROUTE;
  }

  function isScenePath(pathname = window.location.pathname) {
    return /^\/scenes\/[^/]+/.test(appRoutePath(pathname));
  }

  function isHomePath(pathname = window.location.pathname) {
    return appRoutePath(pathname) === "/";
  }

  function syncFolderBrowserRouteClass() {
    document.body?.classList.toggle("folder-browser-route", isFolderBrowserPath());
    document.body?.classList.toggle("folder-browser-scene-route", isScenePath());
  }

  function setupFolderBrowserRouteClass() {
    const sync = () => window.setTimeout(syncFolderBrowserRouteClass, 0);
    api.Event?.addEventListener?.("stash:location", sync);
    window.addEventListener("popstate", sync);
    document.addEventListener("DOMContentLoaded", sync, { once: true });
    sync();
  }

  function setupFolderBrowserHomeRedirect() {
    const redirect = () => {
      window.setTimeout(() => {
        if (!isHomePath() || window.location.search || window.location.hash) return;
        if (document.querySelector('form input[type="password"]')) return;
        window.location.replace(folderBrowserRouteHref());
      }, 120);
    };

    api.Event?.addEventListener?.("stash:location", redirect);
    window.addEventListener("popstate", redirect);
    redirect();
  }

  function shouldShowFolderReturn(search) {
    const params = new URLSearchParams(search || "");
    const hasFolderState = Boolean(readFolderBrowserState()?.currentFolderID);
    return params.get(SCENE_RETURN_PARAM) === "1" || hasFolderState;
  }

  let playerReturnButton = null;

  function removePlayerReturnButton() {
    if (playerReturnButton?.parentElement) {
      playerReturnButton.parentElement.removeChild(playerReturnButton);
    }
    document
      .querySelectorAll(".video-js.folder-browser-return-host")
      .forEach((node) => node.classList.remove("folder-browser-return-host"));
    playerReturnButton = null;
  }

  function shouldShowPlayerReturn() {
    if (isScenePath() && mobileLayoutNow()) return false;
    return /\/scenes\/[^/]+/.test(window.location.pathname) && shouldShowFolderReturn(window.location.search);
  }

  function syncPlayerReturnButton() {
    if (!shouldShowPlayerReturn()) {
      removePlayerReturnButton();
      return;
    }

    const player = document.querySelector(".video-js");
    if (!player) return;

    if (playerReturnButton?.parentElement === player) return;

    removePlayerReturnButton();
    player.classList.add("folder-browser-return-host");

    playerReturnButton = document.createElement("a");
    playerReturnButton.className = "folder-browser-player-return";
    playerReturnButton.href = folderBrowserRouteHref();
    playerReturnButton.textContent = "返回";
    playerReturnButton.title = "返回刚才的文件夹浏览位置";
    player.appendChild(playerReturnButton);
  }

  function setupPlayerReturnButton() {
    const onRouteChange = () => window.setTimeout(syncPlayerReturnButton, 0);
    const observer = new MutationObserver(syncPlayerReturnButton);

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => observer.observe(document.body, { childList: true, subtree: true }),
        { once: true }
      );
    }

    api.Event?.addEventListener?.("stash:location", onRouteChange);
    window.addEventListener("popstate", onRouteChange);
    onRouteChange();
  }

  let sceneDetailsButton = null;

  function removeSceneDetailsButton() {
    if (sceneDetailsButton?.parentElement) {
      sceneDetailsButton.parentElement.removeChild(sceneDetailsButton);
    }
    sceneDetailsButton = null;
    document.body?.classList.remove("folder-browser-scene-details-open");
  }

  function syncSceneDetailsButton() {
    if (!isScenePath() || !mobileLayoutNow()) {
      removeSceneDetailsButton();
      return;
    }

    const player = document.querySelector(".video-js");
    if (!player) return;

    if (sceneDetailsButton?.parentElement === player) return;

    if (sceneDetailsButton?.parentElement) {
      sceneDetailsButton.parentElement.removeChild(sceneDetailsButton);
    }

    sceneDetailsButton = document.createElement("button");
    sceneDetailsButton.type = "button";
    sceneDetailsButton.className = "folder-browser-scene-details-toggle";
    sceneDetailsButton.textContent = "详情";
    sceneDetailsButton.title = "显示/隐藏视频详情";
    sceneDetailsButton.addEventListener("click", () => {
      document.body?.classList.toggle("folder-browser-scene-details-open");
    });
    player.classList.add("folder-browser-return-host");
    player.appendChild(sceneDetailsButton);
  }

  function setupMobileSceneDetailsMenu() {
    const sync = () => window.setTimeout(syncSceneDetailsButton, 0);
    const observer = new MutationObserver(syncSceneDetailsButton);

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => observer.observe(document.body, { childList: true, subtree: true }),
        { once: true }
      );
    }

    api.Event?.addEventListener?.("stash:location", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("resize", sync);
    sync();
  }

  let mobilePlayerLayer = null;
  let seekFeedbackTimer = 0;
  let mobileChromeTimer = 0;
  let mobileChromeFadeTimer = 0;
  let mobileChromeHoldUntil = 0;
  let mobileChromeObserver = null;
  let mobileChromeObservedPlayer = null;
  let mobileSceneProgressVideo = null;
  let mobileSceneProgressSceneID = null;
  let mobileSceneProgressLastSave = 0;
  let mobileSceneProgressRestoredVideo = null;
  let mobileSceneProgressRestoredKey = null;
  let mobileSourceQualityObserver = null;
  let mobileSourceQualityObservedContainer = null;
  let mobileSourceMenuOutsideCloseSetup = false;
  let mobileSpriteStrip = null;
  let mobileSpriteSceneID = null;
  let mobileSpriteRequestToken = 0;
  let mobileSpriteVideo = null;
  let mobileSpriteActiveIndex = -1;
  let mobileSpriteCues = [];
  let mobileSpriteButtons = [];
  let mobileSpriteUserScrollUntil = 0;
  let mobileSpriteProgrammaticScrollUntil = 0;
  const mobileSpriteCueCache = new Map();
  const mobileSpriteImageSizeCache = new Map();
  let mobileGesture = null;
  let lastMobilePlayerTap = null;
  let mobileSingleTapTimer = 0;
  let suppressMobilePlayerClick = false;
  const MOBILE_PLAYER_CHROME_HOLD_MS = 5000;
  const MOBILE_PLAYER_CHROME_FADE_MS = 1000;
  const MOBILE_PLAYER_DOUBLE_TAP_MS = 320;
  const MOBILE_PLAYER_DOUBLE_TAP_PX = 48;

  function scenePlayerContainer() {
    return document.querySelector(".scene-player-container");
  }

  function sceneVideoElement() {
    return document.querySelector(".scene-player-container video, .video-js video, video");
  }

  function sceneVideoPlayerElement() {
    return document.querySelector(".scene-player-container .video-js, .video-js");
  }

  function currentSceneID() {
    const match = appRoutePath().match(/^\/scenes\/([^/?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }

  function sceneProgressKey(sceneID = currentSceneID()) {
    return sceneID ? `${SCENE_PROGRESS_KEY_PREFIX}.${sceneID}` : null;
  }

  function readSceneProgress(sceneID) {
    const key = sceneProgressKey(sceneID);
    if (!key) return null;
    try {
      const raw = window.sessionStorage?.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function writeSceneProgress(sceneID, time, duration) {
    const key = sceneProgressKey(sceneID);
    if (!key || !Number.isFinite(time) || time < 1) return;
    try {
      window.sessionStorage?.setItem(key, JSON.stringify({ duration: duration || 0, time, updatedAt: Date.now() }));
    } catch {
      // Ignore storage failures; the video should keep playing normally.
    }
  }

  function removeSceneProgress(sceneID) {
    const key = sceneProgressKey(sceneID);
    if (!key) return;
    try {
      window.sessionStorage?.removeItem(key);
    } catch {
      // Ignore storage failures.
    }
  }

  function saveScenePlaybackProgress(video = sceneVideoElement(), sceneID = currentSceneID(), force = false) {
    if (!video || !sceneID) return;
    const now = Date.now();
    if (!force && now - mobileSceneProgressLastSave < 900) return;
    mobileSceneProgressLastSave = now;
    const duration = effectiveVideoDuration(video);
    if (duration && video.currentTime >= duration - 1.5) {
      removeSceneProgress(sceneID);
      return;
    }
    writeSceneProgress(sceneID, video.currentTime || 0, duration || 0);
  }

  function restoreScenePlaybackProgress(video, sceneID) {
    const key = sceneProgressKey(sceneID);
    if (!video || !key || (mobileSceneProgressRestoredVideo === video && mobileSceneProgressRestoredKey === key)) return;
    const saved = readSceneProgress(sceneID);
    const applyRestore = () => {
      mobileSceneProgressRestoredVideo = video;
      mobileSceneProgressRestoredKey = key;
      if (!saved || !Number.isFinite(saved.time) || saved.time < 1.5) return;
      const duration = effectiveVideoDuration(video);
      if (duration && saved.time >= duration - 1.5) return;
      if ((video.currentTime || 0) > 1) return;
      video.currentTime = duration ? clamp(saved.time, 0, duration - 1.5) : saved.time;
    };
    if (video.readyState >= 1) {
      applyRestore();
    } else {
      video.addEventListener("loadedmetadata", applyRestore, { once: true });
    }
  }

  function handleSceneProgressSave(event) {
    saveScenePlaybackProgress(event.currentTarget, mobileSceneProgressSceneID);
  }

  function handleSceneProgressEnded(event) {
    removeSceneProgress(mobileSceneProgressSceneID);
    saveScenePlaybackProgress(event.currentTarget, mobileSceneProgressSceneID, true);
  }

  function bindMobileSceneProgress() {
    const video = sceneVideoElement();
    const sceneID = currentSceneID();
    if (!video || !sceneID) return;
    if (mobileSceneProgressVideo === video && mobileSceneProgressSceneID === sceneID) {
      restoreScenePlaybackProgress(video, sceneID);
      return;
    }
    clearMobileSceneProgress();
    mobileSceneProgressVideo = video;
    mobileSceneProgressSceneID = sceneID;
    mobileSceneProgressLastSave = 0;
    video.addEventListener("timeupdate", handleSceneProgressSave);
    video.addEventListener("pause", handleSceneProgressSave);
    video.addEventListener("seeked", handleSceneProgressSave);
    video.addEventListener("ended", handleSceneProgressEnded);
    restoreScenePlaybackProgress(video, sceneID);
  }

  function clearMobileSceneProgress() {
    if (mobileSceneProgressVideo && mobileSceneProgressSceneID) {
      saveScenePlaybackProgress(mobileSceneProgressVideo, mobileSceneProgressSceneID, true);
      mobileSceneProgressVideo.removeEventListener("timeupdate", handleSceneProgressSave);
      mobileSceneProgressVideo.removeEventListener("pause", handleSceneProgressSave);
      mobileSceneProgressVideo.removeEventListener("seeked", handleSceneProgressSave);
      mobileSceneProgressVideo.removeEventListener("ended", handleSceneProgressEnded);
    }
    mobileSceneProgressVideo = null;
    mobileSceneProgressSceneID = null;
    mobileSceneProgressLastSave = 0;
  }

  function resolveAssetURL(path, base = window.location.href) {
    try {
      return new URL(path, base).toString();
    } catch {
      return path;
    }
  }

  function formatSpriteTime(seconds) {
    const value = Math.max(0, Math.floor(Number(seconds) || 0));
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const remainingSeconds = value % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
    return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
  }

  function parseVttTime(value) {
    const parts = String(value || "").trim().split(":").map(Number);
    if (parts.some((part) => !Number.isFinite(part))) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  function parseSpriteVtt(text, vttURL) {
    const cues = [];
    const lines = String(text || "").split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const timing = lines[index].match(/([0-9:.]+)\s+-->\s+([0-9:.]+)/);
      if (!timing) continue;
      let payload = "";
      for (let next = index + 1; next < lines.length; next += 1) {
        const line = lines[next].trim();
        if (!line) break;
        if (line.includes("#xywh=")) {
          payload = line;
          break;
        }
      }
      const sprite = payload.match(/(.+?)#xywh=(\d+),(\d+),(\d+),(\d+)/);
      if (!sprite) continue;
      cues.push({
        start: parseVttTime(timing[1]),
        end: parseVttTime(timing[2]),
        imageURL: resolveAssetURL(sprite[1].trim(), vttURL),
        x: Number(sprite[2]),
        y: Number(sprite[3]),
        width: Number(sprite[4]),
        height: Number(sprite[5]),
      });
    }
    return cues.filter((cue) => cue.width > 0 && cue.height > 0 && cue.imageURL);
  }

  function loadSpriteImageSize(url) {
    if (mobileSpriteImageSizeCache.has(url)) return mobileSpriteImageSizeCache.get(url);
    const promise = new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => resolve(null);
      image.src = url;
    });
    mobileSpriteImageSizeCache.set(url, promise);
    return promise;
  }

  async function loadMobileSpriteCues(sceneID) {
    const data = await callGQL(SCENE_SPRITES_QUERY, { id: sceneID });
    const vttURL = data.findScene?.paths?.vtt;
    if (!vttURL) return [];
    const absoluteVttURL = resolveAssetURL(vttURL);
    if (mobileSpriteCueCache.has(absoluteVttURL)) return mobileSpriteCueCache.get(absoluteVttURL);
    const response = await fetch(absoluteVttURL, { credentials: "same-origin" });
    if (!response.ok) throw new Error(`VTT ${response.status}`);
    const cues = parseSpriteVtt(await response.text(), absoluteVttURL);
    const imageURLs = [...new Set(cues.map((cue) => cue.imageURL))];
    const sizes = new Map(await Promise.all(imageURLs.map(async (url) => [url, await loadSpriteImageSize(url)])));
    const enriched = cues.map((cue) => ({ ...cue, imageSize: sizes.get(cue.imageURL) }));
    mobileSpriteCueCache.set(absoluteVttURL, enriched);
    return enriched;
  }

  function formatSeekDelta(deltaSeconds) {
    const rounded = Math.round(deltaSeconds);
    const sign = rounded > 0 ? "+" : rounded < 0 ? "-" : "";
    const absolute = Math.abs(rounded);
    if (absolute < 60) return `${sign}${absolute}s`;
    const minutes = Math.floor(absolute / 60);
    const seconds = absolute % 60;
    return `${sign}${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function syncSeekFeedbackBounds(feedback, feedbackHost) {
    const progressControl = sceneVideoPlayerElement()?.querySelector(".vjs-progress-control");
    const edgeInset = 15;
    if (!feedback || !feedbackHost || !progressControl) {
      feedback?.style?.removeProperty("--folder-browser-seek-left");
      feedback?.style?.removeProperty("--folder-browser-seek-width");
      feedback?.style?.removeProperty("--folder-browser-seek-transform");
      return;
    }

    let layoutLeft = 0;
    let current = progressControl;
    while (current && current !== feedbackHost && current instanceof HTMLElement) {
      layoutLeft += current.offsetLeft || 0;
      current = current.offsetParent;
    }

    if (current === feedbackHost && progressControl.offsetWidth >= 32) {
      feedback.style.setProperty("--folder-browser-seek-left", `${Math.max(layoutLeft + edgeInset, 0)}px`);
      feedback.style.setProperty("--folder-browser-seek-width", `${Math.max(progressControl.offsetWidth - edgeInset * 2, 32)}px`);
      feedback.style.setProperty("--folder-browser-seek-transform", "none");
      return;
    }

    const hostRect = feedbackHost.getBoundingClientRect?.();
    const progressRect = progressControl.getBoundingClientRect?.();
    const rectWidth = document.body?.classList.contains("folder-browser-player-landscape")
      ? Math.max(progressRect?.width || 0, progressRect?.height || 0)
      : progressRect?.width || 0;
    if (!hostRect || !progressRect || rectWidth < 32 || hostRect.width <= 0) {
      feedback.style.removeProperty("--folder-browser-seek-left");
      feedback.style.removeProperty("--folder-browser-seek-width");
      feedback.style.removeProperty("--folder-browser-seek-transform");
      return;
    }

    feedback.style.setProperty(
      "--folder-browser-seek-left",
      `${Math.max(progressRect.left - hostRect.left + edgeInset, 0)}px`
    );
    feedback.style.setProperty("--folder-browser-seek-width", `${Math.max(rectWidth - edgeInset * 2, 32)}px`);
    feedback.style.setProperty("--folder-browser-seek-transform", "none");
  }

  function nativeProgressRatio() {
    const progressControl = sceneVideoPlayerElement()?.querySelector(".vjs-progress-control");
    const played = progressControl?.querySelector(".vjs-play-progress");
    if (!progressControl || !played || progressControl.offsetWidth <= 0) return undefined;
    if (played.offsetWidth > 0) return clamp(played.offsetWidth / progressControl.offsetWidth, 0, 1);
    const width = window.getComputedStyle?.(played)?.width;
    if (!width?.endsWith?.("%")) return undefined;
    return clamp(Number.parseFloat(width) / 100, 0, 1);
  }

  function showSeekFeedback(deltaSeconds, targetTime, duration) {
    let feedback = document.querySelector(".folder-browser-mobile-seek-feedback");
    if (!feedback) {
      feedback = document.createElement("div");
      feedback.className = "folder-browser-mobile-seek-feedback";
    }
    let label = feedback.querySelector(".folder-browser-mobile-seek-label");
    let track = feedback.querySelector(".folder-browser-mobile-seek-track");
    let fill = feedback.querySelector(".folder-browser-mobile-seek-fill");
    if (!label || !track || !fill) {
      feedback.textContent = "";
      label = document.createElement("div");
      label.className = "folder-browser-mobile-seek-label";
      track = document.createElement("div");
      track.className = "folder-browser-mobile-seek-track";
      fill = document.createElement("div");
      fill.className = "folder-browser-mobile-seek-fill";
      track.appendChild(fill);
      feedback.append(label, track);
    }
    const feedbackHost = scenePlayerContainer() || document.body;
    if (feedbackHost && feedback.parentElement !== feedbackHost) {
      feedbackHost.appendChild(feedback);
    }
    syncSeekFeedbackBounds(feedback, feedbackHost);
    label.textContent = formatSeekDelta(deltaSeconds);
    const hasProgress = Number.isFinite(targetTime) && Number.isFinite(duration) && duration > 0;
    feedback.classList.add("has-progress");
    if (hasProgress) {
      fill.style.width = `${clamp(targetTime / duration, 0, 1) * 100}%`;
    } else {
      fill.style.width = `${(nativeProgressRatio() || 0) * 100}%`;
    }
    feedback.classList.add("visible");
    window.clearTimeout(seekFeedbackTimer);
    seekFeedbackTimer = window.setTimeout(() => feedback.classList.remove("visible"), 850);
  }

  function seekSceneVideo(deltaSeconds) {
    const video = sceneVideoElement();
    if (!video || !Number.isFinite(video.duration)) return;
    const targetTime = clamp((video.currentTime || 0) + deltaSeconds, 0, video.duration || Number.MAX_SAFE_INTEGER);
    video.currentTime = targetTime;
    showSeekFeedback(deltaSeconds);
  }

  function setMobilePlayerChromeState(state) {
    const body = document.body;
    body?.classList.toggle("folder-browser-player-chrome-visible", state === "visible");
    body?.classList.toggle("folder-browser-player-chrome-fading", state === "fading");
    body?.classList.toggle("folder-browser-player-chrome-hidden", state === "hidden");
  }

  function setMobilePlayerChromeVisible(visible) {
    setMobilePlayerChromeState(visible ? "visible" : "hidden");
  }

  function startMobilePlayerChromeFade() {
    const remaining = mobileChromeHoldUntil - Date.now();
    if (remaining > 0) {
      window.clearTimeout(mobileChromeTimer);
      mobileChromeTimer = window.setTimeout(startMobilePlayerChromeFade, remaining);
      return;
    }
    setMobilePlayerChromeState("fading");
    window.clearTimeout(mobileChromeFadeTimer);
    mobileChromeFadeTimer = window.setTimeout(() => {
      setMobilePlayerChromeVisible(false);
    }, MOBILE_PLAYER_CHROME_FADE_MS);
  }

  function syncMobilePlayerChromeFromVideo() {
    if (!isScenePath() || !mobileLayoutNow()) return false;
    const player = sceneVideoPlayerElement();
    if (!player) return false;
    const isActive = player.classList.contains("vjs-user-active");
    const isInactive = player.classList.contains("vjs-user-inactive");
    if (isActive) showMobilePlayerChrome();
    if (isInactive) startMobilePlayerChromeFade();
    return isActive || isInactive;
  }

  function observeMobilePlayerChrome(container) {
    const player = container?.querySelector?.(".video-js") || sceneVideoPlayerElement();
    if (mobileChromeObservedPlayer === player) {
      syncMobilePlayerChromeFromVideo();
      return;
    }
    mobileChromeObserver?.disconnect?.();
    mobileChromeObservedPlayer = player || null;
    if (!player) return;
    mobileChromeObserver = new MutationObserver(syncMobilePlayerChromeFromVideo);
    mobileChromeObserver.observe(player, { attributes: true, attributeFilter: ["class"] });
    syncMobilePlayerChromeFromVideo();
  }

  function showMobilePlayerChrome(duration = MOBILE_PLAYER_CHROME_HOLD_MS) {
    mobileChromeHoldUntil = Date.now() + duration;
    setMobilePlayerChromeVisible(true);
    window.clearTimeout(mobileChromeTimer);
    window.clearTimeout(mobileChromeFadeTimer);
    mobileChromeTimer = window.setTimeout(startMobilePlayerChromeFade, duration);
  }

  function sourceQualityLabel(selector) {
    const selected =
      selector.querySelector(".vjs-source-menu-item.vjs-selected") ||
      selector.querySelector(".vjs-menu-item.vjs-selected") ||
      selector.querySelector("[aria-checked='true']");
    const text = selected?.textContent
      ?.replace(/\bselected\b/gi, "")
      .replace(/\s+/g, " ")
      .replace(/^[\s,，]+|[\s,，]+$/g, "")
      .trim();
    return text || "";
  }

  function syncMobileSourceQualityLabels(container = scenePlayerContainer()) {
    if (!container || !isScenePath() || !mobileLayoutNow()) return;
    container.querySelectorAll(".vjs-source-selector").forEach((selector) => {
      const label = sourceQualityLabel(selector);
      const placeholders = selector.querySelectorAll(".vjs-icon-placeholder, .vjs-icon-cog");
      selector.classList.toggle("folder-browser-has-quality-placeholder", Boolean(label && placeholders.length));
      if (label) {
        selector.setAttribute("data-folder-browser-quality-label", label);
        placeholders.forEach((placeholder) => {
          placeholder.setAttribute("data-folder-browser-quality-label", label);
        });
      } else {
        selector.removeAttribute("data-folder-browser-quality-label");
        placeholders.forEach((placeholder) => {
          placeholder.removeAttribute("data-folder-browser-quality-label");
        });
      }
    });
  }

  function observeMobileSourceQualityLabels(container) {
    if (mobileSourceQualityObservedContainer === container) {
      syncMobileSourceQualityLabels(container);
      return;
    }
    mobileSourceQualityObserver?.disconnect?.();
    mobileSourceQualityObservedContainer = container || null;
    if (!container) return;
    mobileSourceQualityObserver = new MutationObserver(() => syncMobileSourceQualityLabels(container));
    mobileSourceQualityObserver.observe(container, {
      attributes: true,
      attributeFilter: ["class", "aria-checked"],
      childList: true,
      subtree: true,
    });
    syncMobileSourceQualityLabels(container);
  }

  function sourceQualityMenuIsOpen(selector) {
    return Boolean(
      selector.classList.contains("vjs-hover") ||
        selector.classList.contains("vjs-lock-showing") ||
        selector.getAttribute("aria-expanded") === "true" ||
        selector.querySelector(".vjs-hover, .vjs-lock-showing, [aria-expanded='true']")
    );
  }

  function closeMobileSourceQualityMenus(target) {
    let closed = false;
    document.querySelectorAll(".vjs-source-selector").forEach((selector) => {
      if (target?.closest?.(".vjs-source-selector") === selector) return;
      if (!sourceQualityMenuIsOpen(selector)) return;
      closed = true;
      selector.classList.remove("vjs-hover", "vjs-lock-showing");
      selector.setAttribute("aria-expanded", "false");
      selector.querySelectorAll(".vjs-hover, .vjs-lock-showing").forEach((element) => {
        element.classList.remove("vjs-hover", "vjs-lock-showing");
      });
      selector.querySelectorAll("[aria-expanded='true']").forEach((element) => {
        element.setAttribute("aria-expanded", "false");
      });
      if (selector.contains(document.activeElement)) {
        document.activeElement?.blur?.();
      }
    });
    return closed;
  }

  function setupMobileSourceMenuOutsideClose() {
    if (mobileSourceMenuOutsideCloseSetup) return;
    mobileSourceMenuOutsideCloseSetup = true;
    const closeOnOutsidePress = (event) => {
      if (!isScenePath() || !mobileLayoutNow()) return;
      if (!closeMobileSourceQualityMenus(event.target)) return;
      stopMobilePlayerEvent(event);
      suppressMobilePlayerClick = true;
      window.setTimeout(() => {
        suppressMobilePlayerClick = false;
      }, 260);
    };

    document.addEventListener("touchstart", closeOnOutsidePress, { capture: true, passive: false });
    document.addEventListener("mousedown", closeOnOutsidePress, true);
    document.addEventListener("click", closeOnOutsidePress, true);
  }

  function ensureMobileSpriteStrip(container) {
    if (!mobileSpriteStrip) {
      mobileSpriteStrip = document.createElement("div");
      mobileSpriteStrip.className = "folder-browser-mobile-sprite-strip";
      mobileSpriteStrip.setAttribute("aria-label", "Sprite navigation");
    }
    if (mobileSpriteStrip.dataset.events !== "1") {
      const holdChrome = () => {
        mobileSpriteUserScrollUntil = Date.now() + MOBILE_PLAYER_CHROME_HOLD_MS;
        showMobilePlayerChrome(MOBILE_PLAYER_CHROME_HOLD_MS);
      };
      const holdUserScrollChrome = () => {
        if (Date.now() < mobileSpriteProgrammaticScrollUntil) return;
        holdChrome();
      };
      ["touchstart", "touchmove", "touchend", "pointerdown", "pointermove", "pointerup", "wheel"].forEach((eventName) => {
        mobileSpriteStrip.addEventListener(eventName, holdChrome, { passive: true });
      });
      mobileSpriteStrip.addEventListener("scroll", holdUserScrollChrome, { passive: true });
      mobileSpriteStrip.dataset.events = "1";
    }
    if (container && mobileSpriteStrip.parentElement !== container) {
      container.appendChild(mobileSpriteStrip);
    }
    return mobileSpriteStrip;
  }

  function clearMobileSpriteStrip() {
    mobileSpriteRequestToken += 1;
    if (mobileSpriteVideo) {
      mobileSpriteVideo.removeEventListener("timeupdate", syncMobileSpriteActive);
    }
    mobileSpriteVideo = null;
    mobileSpriteSceneID = null;
    mobileSpriteActiveIndex = -1;
    mobileSpriteCues = [];
    mobileSpriteButtons = [];
    mobileSpriteUserScrollUntil = 0;
    mobileSpriteProgrammaticScrollUntil = 0;
    if (mobileSpriteStrip?.parentElement) {
      mobileSpriteStrip.parentElement.removeChild(mobileSpriteStrip);
    }
    mobileSpriteStrip = null;
  }

  function mobileSpriteIndexForTime(time) {
    if (!mobileSpriteCues.length) return -1;
    let nextIndex = -1;
    let low = 0;
    let high = mobileSpriteCues.length - 1;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (mobileSpriteCues[middle].start <= time) {
        nextIndex = middle;
        low = middle + 1;
      } else {
        high = middle - 1;
      }
    }
    return nextIndex;
  }

  function centerMobileSpriteButton(index, behavior = "smooth") {
    const button = mobileSpriteButtons[index];
    if (!mobileSpriteStrip || !button || mobileSpriteStrip.clientWidth <= 0) return;
    const targetLeft = button.offsetLeft + button.offsetWidth / 2 - mobileSpriteStrip.clientWidth / 2;
    mobileSpriteProgrammaticScrollUntil = Date.now() + 1200;
    mobileSpriteStrip.scrollTo({
      left: clamp(targetLeft, 0, Math.max(mobileSpriteStrip.scrollWidth - mobileSpriteStrip.clientWidth, 0)),
      behavior,
    });
  }

  function setMobileSpriteActiveIndex(nextIndex, behavior = "smooth", shouldCenter = true) {
    if (nextIndex === mobileSpriteActiveIndex) {
      if (shouldCenter) centerMobileSpriteButton(nextIndex, behavior);
      return;
    }
    mobileSpriteButtons[mobileSpriteActiveIndex]?.classList.remove("active");
    mobileSpriteButtons[nextIndex]?.classList.add("active");
    mobileSpriteActiveIndex = nextIndex;
    if (shouldCenter) centerMobileSpriteButton(nextIndex, behavior);
  }

  function syncMobileSpriteActive(timeOrEvent, behavior = "smooth", options = {}) {
    if (!mobileSpriteCues.length || !mobileSpriteButtons.length) return;
    let time = Number.isFinite(timeOrEvent) ? timeOrEvent : undefined;
    if (time === undefined) {
      if (mobileGesture?.seeking) return;
      const video = sceneVideoElement();
      if (!video) return;
      time = video.currentTime || 0;
    }
    const nextIndex = mobileSpriteIndexForTime(time);
    const isChangingIndex = nextIndex !== mobileSpriteActiveIndex;
    const userBrowsingSprites = Date.now() <= mobileSpriteUserScrollUntil;
    const shouldCenter = options.forceCenter || (isChangingIndex && !userBrowsingSprites);
    setMobileSpriteActiveIndex(nextIndex, behavior, shouldCenter);
  }

  function bindMobileSpriteVideo() {
    const video = sceneVideoElement();
    if (mobileSpriteVideo === video) {
      syncMobileSpriteActive();
      return;
    }
    if (mobileSpriteVideo) {
      mobileSpriteVideo.removeEventListener("timeupdate", syncMobileSpriteActive);
    }
    mobileSpriteVideo = video || null;
    if (mobileSpriteVideo) {
      mobileSpriteVideo.addEventListener("timeupdate", syncMobileSpriteActive);
    }
    syncMobileSpriteActive();
  }

  function renderMobileSpriteStrip(cues) {
    if (!mobileSpriteStrip) return;
    mobileSpriteStrip.textContent = "";
    mobileSpriteCues = cues;
    mobileSpriteButtons = [];
    mobileSpriteActiveIndex = -1;
    if (!cues.length) {
      mobileSpriteStrip.hidden = true;
      return;
    }
    mobileSpriteStrip.hidden = false;
    const fragment = document.createDocumentFragment();
    cues.forEach((cue, index) => {
      const button = document.createElement("button");
      button.className = "folder-browser-mobile-sprite-thumb";
      button.type = "button";
      button.title = formatSpriteTime(cue.start);
      button.setAttribute("aria-label", `Jump to ${formatSpriteTime(cue.start)}`);
      const scale = cue.imageSize ? clamp(62 / cue.height, 0.35, 1) : 1;
      button.style.width = `${Math.round(cue.width * scale)}px`;
      button.style.height = `${Math.round(cue.height * scale)}px`;
      button.style.backgroundImage = `url("${cue.imageURL.replace(/"/g, '\\"')}")`;
      button.style.backgroundPosition = `${-cue.x * scale}px ${-cue.y * scale}px`;
      if (cue.imageSize) {
        button.style.backgroundSize = `${cue.imageSize.width * scale}px ${cue.imageSize.height * scale}px`;
      }
      button.addEventListener("click", (event) => {
        stopMobilePlayerEvent(event);
        const video = sceneVideoElement();
        if (video) {
          video.currentTime = cue.start;
          const playAttempt = video.play?.();
          if (playAttempt?.catch) playAttempt.catch(() => {});
        }
        showMobilePlayerChrome();
        syncMobileSpriteActive(cue.start, "smooth", { forceCenter: true });
      });
      mobileSpriteButtons[index] = button;
      fragment.appendChild(button);
    });
    mobileSpriteStrip.appendChild(fragment);
    bindMobileSpriteVideo();
    showMobilePlayerChrome();
  }

  function syncMobileSpriteStrip(container) {
    if (!container || !isScenePath() || !mobileLayoutNow()) {
      clearMobileSpriteStrip();
      return;
    }
    const sceneID = currentSceneID();
    if (!sceneID) {
      clearMobileSpriteStrip();
      return;
    }
    const strip = ensureMobileSpriteStrip(container);
    bindMobileSpriteVideo();
    if (mobileSpriteSceneID === sceneID && strip.dataset.loaded === "1") {
      syncMobileSpriteActive();
      return;
    }
    if (mobileSpriteSceneID === sceneID && strip.dataset.loading === "1") return;
    mobileSpriteSceneID = sceneID;
    strip.hidden = true;
    strip.dataset.loading = "1";
    strip.dataset.loaded = "0";
    const token = (mobileSpriteRequestToken += 1);
    loadMobileSpriteCues(sceneID)
      .then((cues) => {
        if (token !== mobileSpriteRequestToken) return;
        strip.dataset.loading = "0";
        strip.dataset.loaded = "1";
        renderMobileSpriteStrip(cues);
      })
      .catch((error) => {
        if (token !== mobileSpriteRequestToken) return;
        console.warn("[Folder Browser] Failed to load mobile sprite navigation", error);
        strip.dataset.loading = "0";
        strip.dataset.loaded = "1";
        renderMobileSpriteStrip([]);
      });
  }

  function clearMobilePlayerMode() {
    window.clearTimeout(mobileChromeTimer);
    window.clearTimeout(mobileChromeFadeTimer);
    mobileChromeHoldUntil = 0;
    document.body?.classList.remove(
      "folder-browser-player-immersive",
      "folder-browser-player-landscape",
      "folder-browser-player-portrait",
      "folder-browser-player-chrome-visible",
      "folder-browser-player-chrome-hidden",
      "folder-browser-player-chrome-fading"
    );
    screen.orientation?.unlock?.();
    window.clearTimeout(mobileSingleTapTimer);
    syncMobilePlayerControlsState();
  }

  function enterMobilePlayerMode(orientation) {
    if (!mobileLayoutNow()) return;
    const mode = orientation || activeSceneVideoOrientation();
    document.body?.classList.add("folder-browser-player-immersive");
    document.body?.classList.toggle("folder-browser-player-landscape", mode === "landscape");
    document.body?.classList.toggle("folder-browser-player-portrait", mode !== "landscape");
    if (mode === "landscape") {
      document.body?.classList.remove("folder-browser-scene-details-open");
    }
    screen.orientation?.lock?.(mode).catch?.(() => {});
    syncMobilePlayerControlsState();
    showMobilePlayerChrome();
  }

  function syncMobilePlayerControlsState() {
    const orientationToggle = mobilePlayerLayer?.querySelector("[data-folder-browser-orientation-toggle='1']");
    const detailsToggle = mobilePlayerLayer?.querySelector("[data-folder-browser-details-toggle='1']");
    const isLandscape = Boolean(document.body?.classList.contains("folder-browser-player-landscape"));
    if (orientationToggle) {
      orientationToggle.textContent = isLandscape ? "竖屏" : "横屏";
      orientationToggle.title = isLandscape ? "竖屏播放" : "横屏播放";
    }
    if (detailsToggle) {
      detailsToggle.hidden = isLandscape;
    }
  }

  function toggleMobilePlayerOrientation() {
    if (document.body?.classList.contains("folder-browser-player-landscape")) {
      enterMobilePlayerMode("portrait");
      return;
    }
    enterMobilePlayerMode("landscape");
  }

  function toggleSceneVideoPlayback() {
    if (
      document.body?.classList.contains("folder-browser-scene-details-open") &&
      !document.body?.classList.contains("folder-browser-player-landscape")
    ) {
      document.body.classList.remove("folder-browser-scene-details-open");
      showMobilePlayerChrome();
      return;
    }
    const video = sceneVideoElement();
    if (!video) return;
    showMobilePlayerChrome();
    if (video.paused) {
      video.play?.().catch?.(() => {});
    } else {
      video.pause?.();
    }
  }

  function scheduleMobilePlayerSingleTap(shouldTogglePlayback = false) {
    window.clearTimeout(mobileSingleTapTimer);
    showMobilePlayerChrome();
    if (shouldTogglePlayback) {
      mobileSingleTapTimer = window.setTimeout(toggleSceneVideoPlayback, MOBILE_PLAYER_DOUBLE_TAP_MS);
    }
  }

  function isMobilePlayerDoubleTap(touch) {
    if (!touch) return false;
    const now = Date.now();
    const tap = { time: now, x: touch.clientX, y: touch.clientY };
    const previous = lastMobilePlayerTap;
    lastMobilePlayerTap = tap;
    if (!previous || now - previous.time > MOBILE_PLAYER_DOUBLE_TAP_MS) return false;
    const distance = Math.hypot(tap.x - previous.x, tap.y - previous.y);
    return distance <= MOBILE_PLAYER_DOUBLE_TAP_PX;
  }

  function isNearLastMobilePlayerTap(touch) {
    if (!touch || !lastMobilePlayerTap) return false;
    if (Date.now() - lastMobilePlayerTap.time > MOBILE_PLAYER_DOUBLE_TAP_MS) return false;
    return Math.hypot(touch.clientX - lastMobilePlayerTap.x, touch.clientY - lastMobilePlayerTap.y) <=
      MOBILE_PLAYER_DOUBLE_TAP_PX;
  }

  function stopMobilePlayerEvent(event) {
    event.preventDefault?.();
    event.stopPropagation?.();
    event.stopImmediatePropagation?.();
  }

  function shouldIgnorePlayerGesture(target) {
    return Boolean(
      target.closest?.(
        "button,a,input,select,textarea,.scrubber-wrapper,.vjs-control-bar,.folder-browser-mobile-player-controls,.folder-browser-mobile-sprite-strip"
      )
    );
  }

  function sceneVideoContentRect(video = sceneVideoElement()) {
    if (!video) return null;
    const rect = video.getBoundingClientRect();
    if (!rect.width || !rect.height) return rect;
    const mediaWidth = video.videoWidth || rect.width;
    const mediaHeight = video.videoHeight || rect.height;
    if (!mediaWidth || !mediaHeight) return rect;
    const rectRatio = rect.width / rect.height;
    const mediaRatio = mediaWidth / mediaHeight;
    if (rectRatio > mediaRatio) {
      const width = rect.height * mediaRatio;
      const left = rect.left + (rect.width - width) / 2;
      return { bottom: rect.bottom, height: rect.height, left, right: left + width, top: rect.top, width };
    }
    const height = rect.width / mediaRatio;
    const top = rect.top + (rect.height - height) / 2;
    return { bottom: top + height, height, left: rect.left, right: rect.right, top, width: rect.width };
  }

  function pointInSceneVideoContent(point) {
    if (!point) return false;
    const rect = sceneVideoContentRect();
    if (!rect) return false;
    return point.clientX >= rect.left && point.clientX <= rect.right && point.clientY >= rect.top && point.clientY <= rect.bottom;
  }

  function effectiveVideoDuration(video) {
    if (Number.isFinite(video?.duration) && video.duration > 0) return video.duration;
    const seekable = video?.seekable;
    if (!seekable?.length) return undefined;
    for (let index = seekable.length - 1; index >= 0; index -= 1) {
      try {
        const end = seekable.end(index);
        if (Number.isFinite(end) && end > 0) return end;
      } catch {
        return undefined;
      }
    }
    return undefined;
  }

  function adaptiveMobileScrubDelta(gesture, axis, video, landscape) {
    const duration = effectiveVideoDuration(video) || 0;
    const axisSize = landscape
      ? Math.max(window.innerWidth || 0, window.innerHeight || 0, 320)
      : Math.max(window.innerWidth || 0, 320);
    const fallbackSpan = 120;
    const baseSpan = duration ? clamp(duration * 0.12, 30, 420) : fallbackSpan;
    const velocity = Math.max(gesture.velocity || 0, Math.abs(axis) / Math.max(Date.now() - gesture.startedAt, 80));
    const speedFactor = clamp(0.62 + velocity * 2.15, 0.55, 3.2);
    const rawDelta = (axis / axisSize) * baseSpan * speedFactor;
    const limit = duration ? duration : 900;
    return clamp(rawDelta, -limit, limit);
  }

  function setupMobilePlayerGestures(container) {
    if (container.dataset.folderBrowserGestures === "1") return;
    container.dataset.folderBrowserGestures = "1";

    container.addEventListener(
      "touchstart",
      (event) => {
        if (!isScenePath() || !mobileLayoutNow() || event.touches.length !== 1 || shouldIgnorePlayerGesture(event.target)) {
          mobileGesture = null;
          return;
        }
        const touch = event.touches[0];
        const video = sceneVideoElement();
        const doubleTapCandidate = isNearLastMobilePlayerTap(touch);
        if (doubleTapCandidate) {
          stopMobilePlayerEvent(event);
        }
        mobileGesture = {
          startX: touch.clientX,
          startY: touch.clientY,
          startTime: video?.currentTime || 0,
          delta: 0,
          doubleTapCandidate,
          lastAxis: 0,
          lastMoveTime: Date.now(),
          seeking: false,
          startedAt: Date.now(),
          tapOnVideo: pointInSceneVideoContent(touch),
          targetTime: video?.currentTime || 0,
          velocity: 0,
        };
      },
      { passive: false, capture: true }
    );

    container.addEventListener(
      "touchmove",
      (event) => {
        if (!mobileGesture || event.touches.length !== 1) return;
        const touch = event.touches[0];
        const dx = touch.clientX - mobileGesture.startX;
        const dy = touch.clientY - mobileGesture.startY;
        const landscape = Boolean(document.body?.classList.contains("folder-browser-player-landscape"));
        const edgeBackGesture =
          !landscape && mobileGesture.startX < 28 && dx >= -4 && Math.abs(dy) < Math.max(56, Math.abs(dx) * 1.15);
        if (edgeBackGesture) return;
        const seekAxis = landscape ? dy : dx;
        const crossAxis = landscape ? dx : dy;
        if (!mobileGesture.seeking && (Math.abs(seekAxis) < 22 || Math.abs(seekAxis) < Math.abs(crossAxis) * 1.35)) {
          if (Math.abs(dx) > 8 || Math.abs(dy) > 8) event.preventDefault();
          return;
        }
        mobileGesture.seeking = true;
        container.classList.add("folder-browser-gesturing");
        event.preventDefault();
        const now = Date.now();
        const elapsed = Math.max(now - mobileGesture.lastMoveTime, 16);
        const instantVelocity = Math.abs(seekAxis - mobileGesture.lastAxis) / elapsed;
        mobileGesture.velocity = mobileGesture.velocity ? mobileGesture.velocity * 0.72 + instantVelocity * 0.28 : instantVelocity;
        mobileGesture.lastAxis = seekAxis;
        mobileGesture.lastMoveTime = now;
        const video = sceneVideoElement();
        const realDuration = effectiveVideoDuration(video);
        const delta = adaptiveMobileScrubDelta(mobileGesture, seekAxis, video, landscape);
        const targetTime = clamp(mobileGesture.startTime + delta, 0, realDuration || Number.MAX_SAFE_INTEGER);
        mobileGesture.targetTime = targetTime;
        mobileGesture.delta = targetTime - mobileGesture.startTime;
        showSeekFeedback(mobileGesture.delta, targetTime, realDuration);
        showMobilePlayerChrome(MOBILE_PLAYER_CHROME_HOLD_MS);
        syncMobileSpriteActive(targetTime, "auto", { forceCenter: true });
      },
      { passive: false, capture: true }
    );

    container.addEventListener(
      "touchend",
      (event) => {
        const shouldShowChrome = mobileGesture && !mobileGesture.seeking;
        if (mobileGesture?.seeking) {
          lastMobilePlayerTap = null;
          window.clearTimeout(mobileSingleTapTimer);
          const video = sceneVideoElement();
          const realDuration = effectiveVideoDuration(video);
          const targetTime = clamp(mobileGesture.targetTime, 0, realDuration || Number.MAX_SAFE_INTEGER);
          if (video) video.currentTime = targetTime;
          showSeekFeedback(targetTime - mobileGesture.startTime, targetTime, realDuration);
          syncMobileSpriteActive(targetTime, "smooth", { forceCenter: true });
          suppressMobilePlayerClick = true;
          window.setTimeout(() => {
            suppressMobilePlayerClick = false;
          }, 320);
        }
        if (shouldShowChrome) {
          if (mobileGesture.doubleTapCandidate || isMobilePlayerDoubleTap(event.changedTouches?.[0])) {
            lastMobilePlayerTap = null;
            window.clearTimeout(mobileSingleTapTimer);
            stopMobilePlayerEvent(event);
            toggleMobilePlayerOrientation();
            suppressMobilePlayerClick = true;
            window.setTimeout(() => {
              suppressMobilePlayerClick = false;
            }, 320);
          } else {
            stopMobilePlayerEvent(event);
            scheduleMobilePlayerSingleTap(Boolean(mobileGesture.tapOnVideo));
            suppressMobilePlayerClick = true;
            window.setTimeout(() => {
              suppressMobilePlayerClick = false;
            }, MOBILE_PLAYER_DOUBLE_TAP_MS + 60);
          }
        }
        container.classList.remove("folder-browser-gesturing");
        mobileGesture = null;
      },
      { passive: false, capture: true }
    );

    container.addEventListener("click", (event) => {
      if (suppressMobilePlayerClick) {
        stopMobilePlayerEvent(event);
        return;
      }
      if (!isScenePath() || !mobileLayoutNow() || shouldIgnorePlayerGesture(event.target)) return;
      stopMobilePlayerEvent(event);
      scheduleMobilePlayerSingleTap(pointInSceneVideoContent(event));
    }, { capture: true });

    container.addEventListener("dblclick", (event) => {
      if (!isScenePath() || !mobileLayoutNow() || shouldIgnorePlayerGesture(event.target)) return;
      stopMobilePlayerEvent(event);
      window.clearTimeout(mobileSingleTapTimer);
      if (suppressMobilePlayerClick) return;
      toggleMobilePlayerOrientation();
      suppressMobilePlayerClick = true;
      window.setTimeout(() => {
        suppressMobilePlayerClick = false;
      }, 320);
    }, { capture: true });
  }

  function removeMobilePlayerLayer() {
    if (mobilePlayerLayer?.parentElement) {
      mobilePlayerLayer.parentElement.removeChild(mobilePlayerLayer);
    }
    mobilePlayerLayer = null;
    mobileChromeObserver?.disconnect?.();
    mobileChromeObserver = null;
    mobileChromeObservedPlayer = null;
    mobileSourceQualityObserver?.disconnect?.();
    mobileSourceQualityObserver = null;
    mobileSourceQualityObservedContainer = null;
    clearMobileSceneProgress();
    clearMobileSpriteStrip();
    clearMobilePlayerMode();
  }

  function syncMobilePlayerLayer() {
    if (!isScenePath() || !mobileLayoutNow()) {
      removeMobilePlayerLayer();
      return;
    }

    const container = scenePlayerContainer();
    if (!container) return;
    setupMobilePlayerGestures(container);
    bindMobileSceneProgress();

    if (mobilePlayerLayer?.parentElement === container) {
      observeMobilePlayerChrome(container);
      observeMobileSourceQualityLabels(container);
      syncMobileSpriteStrip(container);
      return;
    }
    removeMobilePlayerLayer();

    mobilePlayerLayer = document.createElement("div");
    mobilePlayerLayer.className = "folder-browser-mobile-player-controls";

    const back = document.createElement("a");
    back.className = "folder-browser-mobile-player-button";
    back.href = folderBrowserRouteHref();
    back.textContent = "返回";
    back.title = "返回文件夹";
    back.addEventListener("click", () => saveScenePlaybackProgress(undefined, undefined, true));

    const landscape = document.createElement("button");
    landscape.className = "folder-browser-mobile-player-button";
    landscape.type = "button";
    landscape.dataset.folderBrowserOrientationToggle = "1";
    landscape.textContent = "横屏";
    landscape.title = "横屏播放";
    landscape.addEventListener("click", toggleMobilePlayerOrientation);

    const details = document.createElement("button");
    details.className = "folder-browser-mobile-player-button";
    details.type = "button";
    details.dataset.folderBrowserDetailsToggle = "1";
    details.textContent = "详情";
    details.title = "显示/隐藏视频详情";
    details.addEventListener("click", () => {
      document.body?.classList.toggle("folder-browser-scene-details-open");
      showMobilePlayerChrome();
    });

    mobilePlayerLayer.append(back, landscape, details);
    container.appendChild(mobilePlayerLayer);
    syncMobilePlayerControlsState();
    showMobilePlayerChrome();
    observeMobilePlayerChrome(container);
    observeMobileSourceQualityLabels(container);
    syncMobileSpriteStrip(container);
  }

  function setupMobilePlayerLayer() {
    setupMobileSourceMenuOutsideClose();
    const sync = () => window.setTimeout(syncMobilePlayerLayer, 0);
    const observer = new MutationObserver(syncMobilePlayerLayer);

    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
    } else {
      document.addEventListener(
        "DOMContentLoaded",
        () => observer.observe(document.body, { childList: true, subtree: true }),
        { once: true }
      );
    }

    api.Event?.addEventListener?.("stash:location", sync);
    window.addEventListener("popstate", sync);
    window.addEventListener("resize", sync);
    sync();
  }

  function activeSceneVideoOrientation() {
    const video = document.querySelector(".video-js video, video");
    const width = video?.videoWidth || video?.clientWidth || 0;
    const height = video?.videoHeight || video?.clientHeight || 0;
    if (width && height) return width >= height ? "landscape" : "portrait";
    const wrapper = document.querySelector(".VideoPlayer");
    if (wrapper?.classList.contains("portrait")) return "portrait";
    return window.innerWidth >= window.innerHeight ? "landscape" : "portrait";
  }

  function lockCurrentOrientation() {
    if (!mobileLayoutNow()) return;
    const orientation = activeSceneVideoOrientation();
    document.body?.classList.toggle("folder-browser-force-landscape-fullscreen", orientation === "landscape");
    document.body?.classList.toggle("folder-browser-force-portrait-fullscreen", orientation === "portrait");
    screen.orientation?.lock?.(orientation).catch?.(() => {});
  }

  function setupMobileFullscreenOrientation() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isScenePath()) return;
        if (!event.target.closest?.(".vjs-fullscreen-control")) return;
        lockCurrentOrientation();
        window.setTimeout(lockCurrentOrientation, 250);
      },
      true
    );

    document.addEventListener("fullscreenchange", () => {
      if (document.fullscreenElement) {
        lockCurrentOrientation();
      } else {
        screen.orientation?.unlock?.();
        document.body?.classList.remove("folder-browser-force-landscape-fullscreen");
        document.body?.classList.remove("folder-browser-force-portrait-fullscreen");
      }
    });
    document.addEventListener("webkitfullscreenchange", () => {
      if (document.webkitFullscreenElement) {
        lockCurrentOrientation();
      } else {
        screen.orientation?.unlock?.();
        document.body?.classList.remove("folder-browser-force-landscape-fullscreen");
        document.body?.classList.remove("folder-browser-force-portrait-fullscreen");
      }
    });
    document.addEventListener("webkitbeginfullscreen", lockCurrentOrientation, true);
  }

  function ImageWall({ items, wallHeight, mobileColumns, fillTail, selectedIDs, topSpacer, bottomSpacer, innerRef, onOpen, onSelectionChange, onContextMenu }) {
    const mouseOpenRef = React.useRef(null);

    function shouldIgnoreImageOpen(event) {
      return Boolean(event.target.closest?.(".folder-browser-media-check"));
    }

    return React.createElement(
      "div",
      {
        ref: innerRef,
        className: "folder-browser-media-wall" + (fillTail ? " folder-browser-media-wall-fill-tail" : ""),
        style: wallStyle(wallHeight, mobileColumns),
      },
      WallSpacer({ height: topSpacer, position: "top" }),
      items.map((item, index) => {
        const selected = selectedIDs.includes(item.imageID);
        return (
        React.createElement(
          "div",
          {
            key: item.id,
            className: "folder-browser-wall-tile folder-browser-image-tile" + (selected ? " selected" : ""),
            "data-folder-browser-image-id": item.imageID,
            role: "button",
            tabIndex: 0,
            onMouseDown: (event) => {
              if (event.button !== 0 || shouldIgnoreImageOpen(event)) return;
              mouseOpenRef.current = item.imageID;
              event.preventDefault();
              onOpen(item);
            },
            onClick: (event) => {
              if (mouseOpenRef.current === item.imageID) {
                mouseOpenRef.current = null;
                event.preventDefault();
                return;
              }
              if (shouldIgnoreImageOpen(event)) return;
              onOpen(item);
            },
            onKeyDown: (event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onOpen(item);
            },
            onPointerUp: (event) => {
              if (event.pointerType !== "mouse" || event.button !== 0) return;
              if (shouldIgnoreImageOpen(event)) return;
            },
            onContextMenu: (event) => onContextMenu(event, item),
            style: { "--folder-wall-aspect": imageAspect(item) },
            title: item.path,
          },
          React.createElement("input", {
            type: "checkbox",
            className: "folder-browser-media-check",
            checked: selected,
            onChange: (event) => onSelectionChange(item.imageID, event.target.checked),
            onPointerDown: (event) => event.stopPropagation(),
            onPointerUp: (event) => event.stopPropagation(),
            onClick: (event) => event.stopPropagation(),
          }),
          item.meta
            ? React.createElement("span", { className: "folder-browser-image-resolution" }, item.meta)
            : null,
          item.thumb
            ? React.createElement("img", { src: item.thumb, alt: item.title, loading: "lazy" })
            : React.createElement("span", { className: "folder-browser-media-placeholder" }, "Image")
        )
        );
      }),
      WallSpacer({ height: bottomSpacer, position: "bottom" })
    );
  }

  function OtherEntryRow({ item, activePath, onOpen, onContextMenu }) {
    const longPressRef = React.useRef(null);
    const longPressTriggeredRef = React.useRef(false);
    const entry = item.entry;
    const isDirectory = isDirectoryEntry(entry);
    const title = entry.basename || pathBasename(entry.path);
    const extension = String(entry.extension || "").replace(/^\./, "");
    const previewKind = previewKindForEntry(entry);
    const previewLabel = previewLabelForEntry(entry);
    const canPreview = Boolean(previewKind);
    const contextSelected = Boolean(activePath && activePath === entry.path);
    const meta = [
      mediaTypeLabel(entry),
      isDirectory ? "" : formatBytes(entry.size),
      entry.mod_time ? formatDateTime(entry.mod_time) : "",
    ].filter(Boolean).join(" · ");

    function clearLongPress() {
      if (!longPressRef.current) return;
      window.clearTimeout(longPressRef.current);
      longPressRef.current = null;
    }

    function onPointerDown(event) {
      if (!touchPreviewEnabled || event.pointerType === "mouse") return;
      longPressTriggeredRef.current = false;
      clearLongPress();
      const pressEvent = {
        clientX: event.clientX,
        clientY: event.clientY,
        preventDefault: () => {},
        stopPropagation: () => {},
      };
      longPressRef.current = window.setTimeout(() => {
        longPressTriggeredRef.current = true;
        onContextMenu(pressEvent, item);
      }, 520);
    }

    function onPointerUp() {
      clearLongPress();
    }

    function onClick(event) {
      if (longPressTriggeredRef.current) {
        event.preventDefault();
        event.stopPropagation();
        longPressTriggeredRef.current = false;
        return;
      }
      onOpen(item);
    }

    return React.createElement(
      "button",
      {
        className: `folder-browser-file-entry-row folder-browser-file-entry-${String(entry.media_type || entry.type || "file").toLowerCase()}${contextSelected ? " context-selected" : ""}`,
        title: canPreview ? `${title} · ${previewLabel}` : entry.path,
        onClick,
        onContextMenu: (event) => onContextMenu(event, item),
        onPointerDown,
        onPointerUp,
        onPointerCancel: onPointerUp,
        onPointerLeave: onPointerUp,
      },
      React.createElement(
        "span",
        { className: `folder-browser-file-entry-row-icon${canPreview ? ` preview-${previewKind}` : ""}` },
        isDirectory ? "DIR" : (canPreview ? (previewKind === "pdf" ? "PDF" : "TXT") : (extension || entry.media_type || "FILE"))
      ),
      React.createElement(
        "span",
        { className: "folder-browser-file-entry-body" },
        React.createElement("span", { className: "folder-browser-file-entry-name" }, title),
        React.createElement("span", { className: "folder-browser-file-entry-meta" }, meta)
      )
    );
  }

  function OtherEntryList({ items, activePath, onOpen, onContextMenu }) {
    return React.createElement(
      "div",
      { className: "folder-browser-file-entry-list" },
      items.map((item) =>
        React.createElement(OtherEntryRow, {
          key: item.entry.path,
          item,
          activePath,
          onOpen,
          onContextMenu,
        })
      )
    );
  }

  function ContextMenu({ menu, onOpen, onDownload, onRename, onMove, onCopy, onDelete, onProperties, onClose }) {
    if (!menu) return null;

    function stopMenuEvent(event) {
      event.stopPropagation();
    }

    function item(label, onClick, options = {}) {
      return React.createElement(
        "button",
        {
          className: options.danger ? "danger" : undefined,
          disabled: options.disabled,
          onClick: () => {
            onClose();
            onClick();
          },
        },
        label
      );
    }

    if (menu.actions) {
      return React.createElement(
        "div",
        {
          className: "folder-browser-context-menu",
          style: { left: menu.x, top: menu.y },
          onPointerDown: stopMenuEvent,
          onPointerMove: stopMenuEvent,
          onMouseDown: stopMenuEvent,
          onMouseMove: stopMenuEvent,
          onMouseOver: stopMenuEvent,
          onTouchStart: stopMenuEvent,
          onClick: stopMenuEvent,
          onContextMenu: (event) => event.preventDefault(),
        },
        menu.actions.map((action) => item(action.label, action.onClick, action))
      );
    }

    return React.createElement(
      "div",
      {
        className: "folder-browser-context-menu",
        style: { left: menu.x, top: menu.y },
        onPointerDown: stopMenuEvent,
        onPointerMove: stopMenuEvent,
        onMouseDown: stopMenuEvent,
        onMouseMove: stopMenuEvent,
        onMouseOver: stopMenuEvent,
        onTouchStart: stopMenuEvent,
        onClick: stopMenuEvent,
        onContextMenu: (event) => event.preventDefault(),
      },
      item("打开", onOpen),
      item("属性", onProperties),
      item("下载", onDownload),
      item("移动", onMove),
      item("复制到", onCopy),
      item("重命名", onRename),
      item("删除", onDelete, { danger: true })
    );
  }

  function FileActionToolbar({
    currentFolder,
    canActOnCurrentFolder,
    selectedCount,
    selectedImageCount,
    selectedSceneCount,
    onDownload,
    onRename,
    onMove,
    onCopy,
    onDelete,
    onClear,
    onCreateFolder,
    onUploadFiles,
    onUploadFolder,
  }) {
    const [menuOpen, setMenuOpen] = React.useState(false);
    const canAct = selectedCount > 0 || canActOnCurrentFolder;

    React.useEffect(() => {
      if (!menuOpen) return undefined;
      function closeOnOutside(event) {
        if (event.target.closest?.(".folder-browser-toolbar-menu, .folder-browser-toolbar-menu-button")) return;
        setMenuOpen(false);
      }
      function closeOnEscape(event) {
        if (event.key === "Escape") setMenuOpen(false);
      }
      window.addEventListener("pointerdown", closeOnOutside, true);
      window.addEventListener("mousedown", closeOnOutside, true);
      window.addEventListener("touchstart", closeOnOutside, true);
      window.addEventListener("click", closeOnOutside, true);
      window.addEventListener("keydown", closeOnEscape, true);
      return () => {
        window.removeEventListener("pointerdown", closeOnOutside, true);
        window.removeEventListener("mousedown", closeOnOutside, true);
        window.removeEventListener("touchstart", closeOnOutside, true);
        window.removeEventListener("click", closeOnOutside, true);
        window.removeEventListener("keydown", closeOnEscape, true);
      };
    }, [menuOpen]);

    function action(label, onClick, options = {}) {
      return React.createElement(
        "button",
        {
          type: "button",
          className: options.danger ? "danger" : undefined,
          disabled: options.disabled,
          onClick: () => {
            setMenuOpen(false);
            onClick?.();
          },
        },
        label
      );
    }

    return React.createElement(
      "div",
      { className: "folder-browser-file-toolbar" },
      React.createElement(
        "div",
        { className: "folder-browser-toolbar-head" },
        React.createElement("div", { className: "folder-browser-toolbar-title", title: currentFolder?.path }, currentFolder ? currentFolder.basename || currentFolder.path : "未选择文件夹"),
        React.createElement(
          "button",
          {
            type: "button",
            className: "folder-browser-toolbar-menu-button",
            onClick: () => setMenuOpen((current) => !current),
            title: "文件操作",
          },
          iconNode(faEllipsisV, "⋮")
        ),
        menuOpen
          ? React.createElement(
              "div",
              { className: "folder-browser-toolbar-menu" },
              action("新建文件夹", onCreateFolder, { disabled: !currentFolder }),
              action("上传文件", onUploadFiles, { disabled: !currentFolder }),
              action("上传文件夹", onUploadFolder, { disabled: !currentFolder }),
              action("下载", onDownload, { disabled: !selectedImageCount }),
              action("重命名", onRename, { disabled: selectedCount > 1 || !canAct }),
              action("移动", onMove, { disabled: !canAct }),
              action("复制", onCopy, { disabled: !canAct }),
              action("删除", onDelete, { disabled: !canAct, danger: true })
            )
          : null
      ),
      selectedCount
        ? React.createElement(
            "div",
            { className: "folder-browser-selection-summary" },
            `已选择 ${selectedCount} 个：视频 ${selectedSceneCount}，图片 ${selectedImageCount}`,
            React.createElement(Button, { size: "sm", variant: "link", onClick: onClear }, "取消")
          )
        : null
    );
  }

  function MoveTargetDialog({ open, title, confirmLabel = "移动到这里", folderTree, selectedFolderID, currentFolderID, onSelect, onToggle, onCancel, onConfirm }) {
    if (!open) return null;

    function renderNode(folder, depth) {
      const hasLoadedChildren = Array.isArray(folder.children);
      const hasChildren = hasLoadedChildren ? folder.children.length > 0 : true;
      return React.createElement(
        React.Fragment,
        { key: folder.id },
        React.createElement(
          "div",
          {
            className: "folder-browser-target-row" + (folder.id === selectedFolderID ? " selected" : "") + (folder.id === currentFolderID ? " current" : ""),
            style: { "--folder-depth": depth },
            onClick: () => onSelect(folder),
          },
          React.createElement(
            "button",
            {
              type: "button",
              className: "folder-browser-tree-toggle",
              disabled: !hasChildren,
              onClick: (event) => {
                event.stopPropagation();
                onToggle(folder);
              },
            },
            folder.loading ? "..." : !hasChildren ? "v" : folder.expanded ? "v" : ">"
          ),
          React.createElement("span", null, folder.basename || folder.path)
        ),
        folder.expanded && hasLoadedChildren
          ? folder.children.map((child) => renderNode(child, depth + 1))
          : null
      );
    }

    return React.createElement(
      "div",
      { className: "folder-browser-dialog", role: "dialog", "aria-modal": "true" },
      React.createElement("div", { className: "folder-browser-dialog-backdrop", onClick: onCancel }),
      React.createElement(
        "div",
        { className: "folder-browser-dialog-panel" },
        React.createElement("h3", null, title),
        React.createElement("div", { className: "folder-browser-target-tree" }, folderTree.map((folder) => renderNode(folder, 0))),
        React.createElement(
          "div",
          { className: "folder-browser-dialog-actions" },
          React.createElement(Button, { size: "sm", variant: "secondary", onClick: onCancel }, "取消"),
          React.createElement(Button, { size: "sm", variant: "primary", disabled: !selectedFolderID, onClick: onConfirm }, confirmLabel)
        )
      )
    );
  }

  function ImageLightbox({ items, index, playing, isMobileLayout = false, onClose, onNavigate, onPlayingChange, onDownload, onDelete, onMoveFile, onCopyFile }) {
    const item = index === null ? null : items[index];
    const [zoom, setZoom] = React.useState(1);
    const [pan, setPan] = React.useState({ x: 0, y: 0 });
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const [slideshowSettingsOpen, setSlideshowSettingsOpen] = React.useState(false);
    const [slideshowIntervalMs, setSlideshowIntervalMs] = React.useState(3000);
    const [landscape, setLandscape] = React.useState(false);
    const [displaySrc, setDisplaySrc] = React.useState("");
    const [imageReady, setImageReady] = React.useState(false);
    const [currentOriginalReadySrc, setCurrentOriginalReadySrc] = React.useState("");
    const [imageDisplayBox, setImageDisplayBox] = React.useState(null);
    const [loadedOriginalInfo, setLoadedOriginalInfo] = React.useState(null);
    const [chromeVisible, setChromeVisible] = React.useState(true);
    const [hoverZone, setHoverZone] = React.useState(null);
    const gestureRef = React.useRef(null);
    const stageRef = React.useRef(null);
    const imageRef = React.useRef(null);
    const displaySrcRef = React.useRef("");
    const preloadImagesRef = React.useRef(new Map());
    const pointersRef = React.useRef(new Map());
    const lastTapRef = React.useRef(null);
    const lastPointerTypeRef = React.useRef("mouse");
    const suppressClickRef = React.useRef(false);
    const suppressClickTimerRef = React.useRef(0);
    const chromeTimerRef = React.useRef(0);
    const autoHideChrome = isMobileLayout;

    React.useEffect(() => {
      if (!playing || !item || items.length <= 1) return undefined;
      const timer = window.setInterval(() => onNavigate(1), slideshowIntervalMs);
      return () => window.clearInterval(timer);
    }, [playing, item, items.length, onNavigate, slideshowIntervalMs]);

    React.useEffect(() => {
      if (!item) return undefined;
      function onKeyDown(event) {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft") onNavigate(-1);
        if (event.key === "ArrowRight") onNavigate(1);
      }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [item, onClose, onNavigate]);

    React.useEffect(() => {
      if (!item) return undefined;
      document.body?.classList.add("folder-browser-lightbox-open");
      return () => {
        document.body?.classList.remove("folder-browser-lightbox-open");
        screen.orientation?.unlock?.();
      };
    }, [item]);

    React.useEffect(() => {
      if (!item) return undefined;
      const mobileLandscape = isMobileLayout && landscape;
      document.body?.classList.toggle("folder-browser-image-lightbox-landscape", mobileLandscape);
      if (mobileLandscape) {
        setDetailsOpen(false);
        screen.orientation?.lock?.("landscape").catch?.(() => {});
      } else {
        screen.orientation?.unlock?.();
      }
      return () => document.body?.classList.remove("folder-browser-image-lightbox-landscape");
    }, [item, isMobileLayout, landscape]);

    React.useEffect(() => {
      if (!item) {
        setDisplaySrc("");
        setImageReady(false);
        setCurrentOriginalReadySrc("");
        setImageDisplayBox(null);
        setLoadedOriginalInfo(null);
        displaySrcRef.current = "";
        return undefined;
      }
      const previewSrc = lightboxPreviewSrc(item);
      const fullSrc = lightboxFullSrc(item);
      let cancelled = false;
      setCurrentOriginalReadySrc("");
      setLoadedOriginalInfo(null);
      function swapImage(src) {
        if (cancelled || !src) return;
        if (src === displaySrcRef.current) {
          setImageReady(true);
          return;
        }
        displaySrcRef.current = src;
        setImageReady(false);
        setDisplaySrc(src);
      }
      swapImage(previewSrc);
      if (!fullSrc || fullSrc === previewSrc) {
        setCurrentOriginalReadySrc(fullSrc || previewSrc);
        return undefined;
      }
      const image = new Image();
      setImageLoadPriority(image, "high");
      image.onload = async () => {
        try {
          await image.decode?.();
        } catch (e) {
          // The load event is enough when decode() is not available or rejects.
        }
        if (!cancelled && image.naturalWidth && image.naturalHeight) {
          setLoadedOriginalInfo({ src: fullSrc, width: image.naturalWidth, height: image.naturalHeight });
        }
        swapImage(fullSrc);
        if (!cancelled) setCurrentOriginalReadySrc(fullSrc);
      };
      image.onerror = () => {
        swapImage(previewSrc);
        if (!cancelled) setCurrentOriginalReadySrc(fullSrc);
      };
      image.src = fullSrc;
      return () => {
        cancelled = true;
        cancelImageLoad(image);
      };
    }, [item]);

    React.useLayoutEffect(() => {
      if (!item) {
        setImageDisplayBox(null);
        return undefined;
      }
      const size = lightboxOriginalSize(item);
      const stage = stageRef.current;
      if (!size || !stage) {
        setImageDisplayBox(null);
        return undefined;
      }
      let frame = 0;
      function updateBox() {
        window.cancelAnimationFrame(frame);
        frame = window.requestAnimationFrame(() => {
          const rect = stage.getBoundingClientRect();
          if (!rect.width || !rect.height) return;
          const scale = Math.min(1, rect.width / size.width, rect.height / size.height);
          const next = {
            width: Math.max(1, Math.round(size.width * scale)),
            height: Math.max(1, Math.round(size.height * scale)),
          };
          setImageDisplayBox((current) =>
            current?.width === next.width && current?.height === next.height ? current : next
          );
        });
      }
      updateBox();
      const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateBox) : null;
      observer?.observe(stage);
      window.addEventListener("resize", updateBox);
      return () => {
        window.cancelAnimationFrame(frame);
        observer?.disconnect();
        window.removeEventListener("resize", updateBox);
      };
    }, [detailsOpen, item, landscape, loadedOriginalInfo]);

    React.useEffect(() => {
      const cache = preloadImagesRef.current;
      if (!item || !items.length || index === null) {
        cancelImagePreloads(cache, new Set());
        return;
      }
      if (isMobileLayout) {
        cancelImagePreloads(cache, new Set());
        return;
      }
      const currentSrc = lightboxFullSrc(item);
      if (currentOriginalReadySrc !== currentSrc) {
        cancelImagePreloads(cache, new Set());
        return;
      }
      const nextItem = items[(index + 1) % items.length];
      const previousItem = items[(index - 1 + items.length) % items.length];
      const desiredPreloads = [
        { src: lightboxFullSrc(nextItem), priority: "high" },
        { src: lightboxFullSrc(previousItem), priority: "low" },
      ].filter((entry) => entry.src && entry.src !== currentSrc);
      const seen = new Set();
      const orderedPreloads = desiredPreloads.filter((entry) => {
        if (seen.has(entry.src)) return false;
        seen.add(entry.src);
        return true;
      });
      const keep = new Set(orderedPreloads.map((entry) => entry.src));
      cancelImagePreloads(cache, keep);
      orderedPreloads.forEach((entry) => {
        const cached = cache.get(entry.src);
        if (cached) {
          setImageLoadPriority(cached.image, entry.priority);
          cached.priority = entry.priority;
          return;
        }
        cache.set(entry.src, createImagePreload(entry.src, entry.priority));
      });
    }, [currentOriginalReadySrc, item, index, items]);

    React.useEffect(() => {
      const cache = preloadImagesRef.current;
      return () => {
        cancelImagePreloads(cache, new Set());
      };
    }, []);

    React.useEffect(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDetailsOpen(false);
      setMenuOpen(false);
      setImageReady(false);
      pointersRef.current.clear();
      gestureRef.current = null;
    }, [index]);

    React.useEffect(() => {
      if (zoom === 1) setPan({ x: 0, y: 0 });
    }, [zoom]);

    React.useEffect(() => {
      if (index === null) setLandscape(false);
    }, [index]);

    React.useEffect(() => {
      if (!isMobileLayout) setLandscape(false);
    }, [isMobileLayout]);

    React.useEffect(() => {
      if (!item) return undefined;
      setChromeVisible(true);
      setHoverZone(null);
      setMenuOpen(false);
      setSlideshowSettingsOpen(false);
      if (autoHideChrome) {
        scheduleChromeHide();
      } else {
        clearChromeTimer();
      }
      return () => clearChromeTimer();
    }, [item, autoHideChrome]);

    React.useEffect(() => () => {
      clearChromeTimer();
      window.clearTimeout(suppressClickTimerRef.current);
    }, []);

    React.useEffect(() => {
      if (!menuOpen && !slideshowSettingsOpen) return undefined;
      function closeFloatingMenus(event) {
        if (event.target.closest?.(".folder-browser-lightbox-menu-wrap")) return;
        setMenuOpen(false);
        setSlideshowSettingsOpen(false);
      }
      window.addEventListener("pointerdown", closeFloatingMenus, true);
      return () => window.removeEventListener("pointerdown", closeFloatingMenus, true);
    }, [menuOpen, slideshowSettingsOpen]);

    if (!item) return null;

    function clearChromeTimer() {
      window.clearTimeout(chromeTimerRef.current);
      chromeTimerRef.current = 0;
    }

    function lightboxPreviewSrc(imageItem) {
      return imageItem?.preview || imageItem?.thumb || imageItem?.full || imageItem?.original || "";
    }

    function lightboxFullSrc(imageItem) {
      return imageItem?.full || imageItem?.original || lightboxPreviewSrc(imageItem);
    }

    function promoteOriginalImage(src, image) {
      if (!src || src !== lightboxFullSrc(item)) return;
      if (image?.naturalWidth && image?.naturalHeight) {
        setLoadedOriginalInfo({ src, width: image.naturalWidth, height: image.naturalHeight });
      }
      if (src !== displaySrcRef.current) {
        displaySrcRef.current = src;
        setImageReady(false);
        setDisplaySrc(src);
      }
      setCurrentOriginalReadySrc(src);
    }

    function lightboxOriginalSize(imageItem) {
      const fullSrc = lightboxFullSrc(imageItem);
      if (loadedOriginalInfo?.src === fullSrc && loadedOriginalInfo.width && loadedOriginalInfo.height) {
        return { width: loadedOriginalInfo.width, height: loadedOriginalInfo.height };
      }
      if (imageItem?.width && imageItem?.height) {
        return { width: imageItem.width, height: imageItem.height };
      }
      return null;
    }

    function setImageLoadPriority(image, priority) {
      if (!image) return;
      image.decoding = "async";
      if ("fetchPriority" in image) image.fetchPriority = priority;
    }

    function cancelImageLoad(image) {
      if (!image) return;
      image.onload = null;
      image.onerror = null;
      try {
        image.removeAttribute("src");
      } catch (e) {
        // Some older browsers expose Image without removeAttribute.
      }
      image.src = "";
    }

    function createImagePreload(src, priority) {
      const image = new Image();
      const record = { src, priority, image, loaded: false, failed: false };
      setImageLoadPriority(image, priority);
      image.onload = () => {
        record.loaded = true;
      };
      image.onerror = () => {
        record.failed = true;
      };
      image.src = src;
      const decodePromise = image.decode?.();
      decodePromise?.catch?.(() => {});
      return record;
    }

    function cancelImagePreloads(cache, keep) {
      for (const [src, record] of Array.from(cache.entries())) {
        if (keep.has(src)) continue;
        cancelImageLoad(record.image);
        cache.delete(src);
      }
    }

    function hideChrome() {
      if (!autoHideChrome) return;
      setChromeVisible(false);
      setHoverZone(null);
      setMenuOpen(false);
      setSlideshowSettingsOpen(false);
    }

    function scheduleChromeHide() {
      clearChromeTimer();
      if (!autoHideChrome) return;
      chromeTimerRef.current = window.setTimeout(hideChrome, 3000);
    }

    function revealChrome() {
      setChromeVisible(true);
      scheduleChromeHide();
    }

    function onWheel(event) {
      event.preventDefault();
      const stageRect = event.currentTarget.getBoundingClientRect();
      const pointer = {
        x: event.clientX - stageRect.left - stageRect.width / 2,
        y: event.clientY - stageRect.top - stageRect.height / 2,
      };

      setZoom((current) => {
        const rawFactor = Math.exp(-event.deltaY * 0.001);
        const factor = Math.min(1.06, Math.max(0.94, rawFactor));
        const next = Math.min(8, Math.max(1, current * factor));

        setPan((currentPan) => {
          if (next === 1) return { x: 0, y: 0 };
          const ratio = next / current;
          return {
            x: currentPan.x + (pointer.x - currentPan.x) * (1 - ratio),
            y: currentPan.y + (pointer.y - currentPan.y) * (1 - ratio),
          };
        });

        return next;
      });
    }

    function pointerList() {
      return [...pointersRef.current.values()];
    }

    function pointerDistance(a, b) {
      return Math.hypot(a.x - b.x, a.y - b.y);
    }

    function pointerCenter(a, b) {
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }

    function relativeStagePoint(stage, point) {
      const rect = stage.getBoundingClientRect();
      return {
        x: point.x - rect.left - rect.width / 2,
        y: point.y - rect.top - rect.height / 2,
      };
    }

    function suppressNextClick() {
      suppressClickRef.current = true;
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 300);
    }

    function consumeSuppressedClick(event) {
      if (!suppressClickRef.current) return false;
      event.preventDefault();
      event.stopPropagation();
      return true;
    }

    function toggleLandscape() {
      if (!isMobileLayout) return;
      setLandscape((current) => !current);
    }

    function maybeToggleLandscapeFromTap(event, gesture) {
      if (!isMobileLayout) return false;
      const now = Date.now();
      const last = lastTapRef.current;
      if (
        last &&
        now - last.time < 340 &&
        Math.hypot(event.clientX - last.x, event.clientY - last.y) < 44
      ) {
        lastTapRef.current = null;
        suppressNextClick();
        toggleLandscape();
        return true;
      }
      lastTapRef.current = { time: now, x: event.clientX, y: event.clientY };
      window.setTimeout(() => {
        if (lastTapRef.current?.time === now) lastTapRef.current = null;
      }, 360);
      return false;
    }

    function beginSinglePointerGesture(event) {
      gestureRef.current = {
        mode: "single",
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: Date.now(),
        startPan: pan,
        startZoom: zoom,
        edgeSwipe: event.clientX <= 32 + (window.visualViewport?.offsetLeft || 0),
      };
    }

    function beginPinchGesture(stage) {
      const points = pointerList();
      if (points.length < 2) return;
      const first = points[0];
      const second = points[1];
      const center = pointerCenter(first, second);
      gestureRef.current = {
        mode: "pinch",
        startDistance: Math.max(1, pointerDistance(first, second)),
        startCenter: relativeStagePoint(stage, center),
        startPan: pan,
        startZoom: zoom,
      };
    }

    function onPointerDown(event) {
      if (event.target.closest?.(".folder-browser-lightbox-toolbar, .folder-browser-lightbox-details, .folder-browser-lightbox-menu")) return;
      if (event.pointerType === "mouse" && event.button !== 0) return;
      if (event.pointerType === "mouse" && event.target.closest?.(".folder-browser-lightbox-zone")) return;
      event.preventDefault();
      lastPointerTypeRef.current = event.pointerType || "mouse";
      event.currentTarget.setPointerCapture?.(event.pointerId);
      pointersRef.current.set(event.pointerId, { id: event.pointerId, x: event.clientX, y: event.clientY });
      if (pointersRef.current.size >= 2) {
        beginPinchGesture(event.currentTarget);
      } else {
        beginSinglePointerGesture(event);
      }
    }

    function onPointerMove(event) {
      const pointer = pointersRef.current.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault();
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      const gesture = gestureRef.current;
      if (!gesture) return;

      if (gesture.mode === "pinch" && pointersRef.current.size >= 2) {
        const points = pointerList();
        const first = points[0];
        const second = points[1];
        const distance = Math.max(1, pointerDistance(first, second));
        const next = clamp(gesture.startZoom * (distance / gesture.startDistance), 1, 8);
        const center = relativeStagePoint(event.currentTarget, pointerCenter(first, second));
        const ratio = next / gesture.startZoom;
        setZoom(next);
        setPan(
          next === 1
            ? { x: 0, y: 0 }
            : {
                x: gesture.startPan.x + center.x - gesture.startCenter.x + (gesture.startCenter.x - gesture.startPan.x) * (1 - ratio),
                y: gesture.startPan.y + center.y - gesture.startCenter.y + (gesture.startCenter.y - gesture.startPan.y) * (1 - ratio),
              }
        );
        suppressNextClick();
        return;
      }

      if (gesture.mode !== "single") return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      if (Math.hypot(dx, dy) > 8) suppressNextClick();
      if (gesture.startZoom > 1) {
        setPan({
          x: gesture.startPan.x + dx,
          y: gesture.startPan.y + dy,
        });
      }
    }

    function finishRemainingPointerGesture(stage) {
      const points = pointerList();
      if (points.length >= 2) {
        beginPinchGesture(stage);
      } else if (points.length === 1) {
        const point = points[0];
        gestureRef.current = {
          mode: "single",
          pointerId: point.id,
          startX: point.x,
          startY: point.y,
          startTime: Date.now(),
          startPan: pan,
          startZoom: zoom,
          edgeSwipe: point.x <= 32 + (window.visualViewport?.offsetLeft || 0),
        };
      } else {
        gestureRef.current = null;
      }
    }

    function onPointerUp(event) {
      const gesture = gestureRef.current;
      if (gesture?.mode === "single" && gesture.pointerId === event.pointerId) {
        const dx = event.clientX - gesture.startX;
        const dy = event.clientY - gesture.startY;
        const absX = Math.abs(dx);
        const absY = Math.abs(dy);
        const elapsed = Date.now() - gesture.startTime;
        if (gesture.startZoom <= 1) {
          if (gesture.edgeSwipe && dx > 72 && absY < Math.max(60, absX * 0.75)) {
            suppressNextClick();
            onClose();
          } else if (absX > 64 && absX > absY * 1.2) {
            suppressNextClick();
            onNavigate(dx < 0 ? 1 : -1);
          } else if (absX < 12 && absY < 12 && elapsed < 380) {
            if (!maybeToggleLandscapeFromTap(event, gesture)) {
              revealChrome();
            }
          }
        }
      }
      pointersRef.current.delete(event.pointerId);
      finishRemainingPointerGesture(event.currentTarget);
    }

    const file = primaryImageFile(item.image);
    const fingerprints = file?.fingerprints?.map((fingerprint) => `${fingerprint.type}: ${fingerprint.value}`) || [];
    const customFields = item.image?.custom_fields || {};
    const lightboxClassName =
      "folder-browser-lightbox" +
      (isMobileLayout ? " mobile" : " desktop") +
      (landscape ? " landscape" : "") +
      (detailsOpen ? " details-open" : "") +
      (chromeVisible ? " chrome-visible" : " chrome-hidden");

    function lightboxIconButton(className, title, onClick, children, extraProps = {}) {
      return React.createElement(
        "button",
        {
          type: "button",
          className: `folder-browser-lightbox-icon-button ${className || ""}`,
          title,
          "aria-label": title,
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            revealChrome();
            onClick?.(event);
          },
          ...extraProps,
        },
        children
      );
    }

    function lightboxMenuButton(label, onClick, options = {}) {
      return React.createElement(
        "button",
        {
          type: "button",
          className: options.danger ? "danger" : "",
          disabled: options.disabled,
          title: options.title,
          onClick: (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (options.disabled) return;
            revealChrome();
            if (!options.keepOpen) setMenuOpen(false);
            onClick?.();
          },
        },
        label
      );
    }

    function navigateFromZone(event, delta) {
      if (consumeSuppressedClick(event)) return;
      event.preventDefault();
      event.stopPropagation();
      revealChrome();
      onNavigate(delta);
    }

    function closeFromImageContextMenu(event) {
      if (isMobileLayout) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }

    const lightbox = React.createElement(
      "div",
      {
        className: lightboxClassName,
        role: "dialog",
        "aria-modal": "true",
        onMouseMove: isMobileLayout ? undefined : revealChrome,
        onPointerDown: isMobileLayout ? undefined : revealChrome,
        onMouseLeave: () => setHoverZone(null),
      },
      React.createElement("div", { className: "folder-browser-lightbox-backdrop" }),
      React.createElement(
        "div",
        { className: "folder-browser-lightbox-panel" },
        React.createElement(
          "div",
          { className: "folder-browser-lightbox-toolbar" },
          React.createElement(
            "div",
            { className: "folder-browser-lightbox-toolbar-left" },
            lightboxIconButton(
              "folder-browser-lightbox-back",
              "返回",
              onClose,
              iconNode(faArrowLeft, "←")
            )
          ),
          React.createElement("div", { className: "folder-browser-lightbox-count" }, `${index + 1} / ${items.length}`),
          React.createElement(
            "div",
            { className: "folder-browser-lightbox-actions" },
            lightboxIconButton(
              playing ? "active" : "",
              playing ? "停止幻灯片" : "播放幻灯片",
              () => onPlayingChange(!playing),
              iconNode(playing ? faPause : faPlay, playing ? "暂停" : "播放")
            ),
            lightboxIconButton(
              detailsOpen ? "active folder-browser-lightbox-info-button" : "folder-browser-lightbox-info-button",
              "详情",
              () => setDetailsOpen((current) => !current),
              React.createElement("span", { className: "folder-browser-lightbox-info-glyph" }, "i")
            ),
            React.createElement(
              "div",
              { className: "folder-browser-lightbox-menu-wrap" },
              lightboxIconButton(
                menuOpen ? "active" : "",
                "文件操作",
                () => setMenuOpen((current) => !current),
                iconNode(faEllipsisV, "⋮")
              ),
              menuOpen
                ? React.createElement(
                    "div",
                    { className: "folder-browser-lightbox-menu" },
                    lightboxMenuButton("删除", () => onDelete(item), { danger: true }),
                    lightboxMenuButton("移动到", () => onMoveFile?.(item)),
                    lightboxMenuButton("复制到", () => onCopyFile?.(item)),
                    lightboxMenuButton("下载", () => onDownload(item)),
                    lightboxMenuButton("幻灯片设置", () => setSlideshowSettingsOpen((current) => !current), { keepOpen: true }),
                    slideshowSettingsOpen
                      ? React.createElement(
                          "div",
                          { className: "folder-browser-lightbox-slideshow-settings" },
                          React.createElement("span", null, "间隔"),
                          [2000, 3000, 5000, 8000].map((value) =>
                            React.createElement(
                              "button",
                              {
                                key: value,
                                type: "button",
                                className: slideshowIntervalMs === value ? "active" : "",
                                onClick: (event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  revealChrome();
                                  setSlideshowIntervalMs(value);
                                },
                              },
                              `${value / 1000}s`
                            )
                          )
                        )
                      : null
                  )
                : null
            )
          )
        ),
        React.createElement(
          "div",
          { className: "folder-browser-lightbox-content" },
          React.createElement(
            "div",
            {
              ref: stageRef,
              className: "folder-browser-lightbox-stage",
              onWheel,
              onPointerDown,
              onPointerMove,
              onPointerUp,
              onPointerCancel: onPointerUp,
              onContextMenu: closeFromImageContextMenu,
              onMouseLeave: () => setHoverZone(null),
            },
            React.createElement("img", {
              key: `original-preload-${item.id}-${lightboxFullSrc(item)}`,
              className: "folder-browser-lightbox-original-preload",
              src: lightboxFullSrc(item),
              alt: "",
              "aria-hidden": "true",
              decoding: "async",
              fetchPriority: "high",
              onLoad: (event) => promoteOriginalImage(lightboxFullSrc(item), event.currentTarget),
              onError: () => setCurrentOriginalReadySrc(lightboxFullSrc(item)),
            }),
            React.createElement("img", {
              ref: imageRef,
              className: "folder-browser-lightbox-image current"
                + (imageReady ? " ready" : "")
                + (displaySrc && displaySrc !== lightboxFullSrc(item) ? " preview" : ""),
              src: displaySrc || item.preview || item.thumb || item.full,
              alt: item.title,
              onLoad: () => setImageReady(true),
              onError: () => setImageReady(true),
              onClick: (event) => {
                consumeSuppressedClick(event);
              },
              style: {
                "--folder-lightbox-zoom": zoom,
                "--folder-lightbox-pan-x": `${pan.x}px`,
                "--folder-lightbox-pan-y": `${pan.y}px`,
                "--folder-lightbox-display-width": imageDisplayBox ? `${imageDisplayBox.width}px` : undefined,
                "--folder-lightbox-display-height": imageDisplayBox ? `${imageDisplayBox.height}px` : undefined,
              },
            }),
            !isMobileLayout
              ? React.createElement(
                  React.Fragment,
                  null,
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "folder-browser-lightbox-zone prev" + (hoverZone === "prev" ? " hovered" : ""),
                      onMouseEnter: () => setHoverZone("prev"),
                      onMouseMove: () => setHoverZone("prev"),
                      onMouseLeave: () => setHoverZone((current) => current === "prev" ? null : current),
                      onClick: (event) => navigateFromZone(event, -1),
                      title: "上一张",
                    },
                    React.createElement("span", { className: "folder-browser-lightbox-zone-arrow" }, iconNode(faChevronLeft, "‹"))
                  ),
                  React.createElement(
                    "button",
                    {
                      type: "button",
                      className: "folder-browser-lightbox-zone next" + (hoverZone === "next" ? " hovered" : ""),
                      onMouseEnter: () => setHoverZone("next"),
                      onMouseMove: () => setHoverZone("next"),
                      onMouseLeave: () => setHoverZone((current) => current === "next" ? null : current),
                      onClick: (event) => navigateFromZone(event, 1),
                      title: "下一张",
                    },
                    React.createElement("span", { className: "folder-browser-lightbox-zone-arrow" }, iconNode(faChevronRight, "›"))
                  )
                )
              : null
          ),
          detailsOpen
            ? React.createElement(
                "aside",
                { className: "folder-browser-lightbox-details" },
                React.createElement("h3", null, item.title),
                React.createElement("dl", null,
                  detailRow("文件名", item.basename),
                  detailRow("标题", item.image?.title),
                  detailRow("拍摄时间", item.image?.date),
                  detailRow("摄影师", item.image?.photographer),
                  detailRow("分辨率", item.meta),
                  detailRow("格式", file?.format),
                  detailRow("大小", formatBytes(file?.size)),
                  detailRow("文件时间", file?.mod_time),
                  detailRow("入库时间", item.image?.created_at),
                  detailRow("更新时间", item.image?.updated_at),
                  detailRow("文件创建", file?.created_at),
                  detailRow("文件更新", file?.updated_at),
                  detailRow("指纹", fingerprints),
                  detailRow("EXIF/自定义字段", Object.keys(customFields).length ? customFields : "Stash GraphQL 未暴露原始 EXIF"),
                  detailRow("说明", item.image?.details),
                  detailRow("路径", item.path)
                )
              )
            : null
        )
      )
    );

    return ReactDOM?.createPortal
      ? ReactDOM.createPortal(lightbox, document.body)
      : lightbox;
  }

  function FilePreview({ preview, onClose, onDownload }) {
    const entry = preview?.entry;
    const kind = preview?.kind;
    const [text, setText] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    React.useEffect(() => {
      setText("");
      setError("");
      if (!entry?.path || kind !== "text") {
        setLoading(false);
        return undefined;
      }

      const controller = new AbortController();
      let cancelled = false;
      setLoading(true);
      fetch(folderBrowserFileURL(entry.path), {
        credentials: "same-origin",
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error(await response.text() || `HTTP ${response.status}`);
          return response.text();
        })
        .then((body) => {
          if (!cancelled) setText(body);
        })
        .catch((e) => {
          if (!cancelled && e.name !== "AbortError") setError(e.message || String(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
        controller.abort();
      };
    }, [entry?.path, kind]);

    React.useEffect(() => {
      if (!entry) return undefined;
      function onKeyDown(event) {
        if (event.key === "Escape") onClose();
      }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [entry, onClose]);

    if (!entry) return null;

    const title = entry.basename || pathBasename(entry.path) || "文件";
    const previewNode = React.createElement(
      "div",
      { className: "folder-browser-file-preview" },
      React.createElement(
        "div",
        { className: "folder-browser-file-preview-toolbar" },
        React.createElement(
          "button",
          {
            type: "button",
            className: "folder-browser-file-preview-back",
            onClick: onClose,
            title: "返回",
            "aria-label": "返回",
          },
          iconNode(faArrowLeft, "←")
        ),
        React.createElement(
          "div",
          { className: "folder-browser-file-preview-title", title: entry.path },
          React.createElement("strong", null, title),
          React.createElement(
            "span",
            null,
            [entry.path, formatBytes(entry.size)].filter(Boolean).join(" · ")
          )
        ),
        React.createElement(
          "button",
          {
            type: "button",
            className: "folder-browser-file-preview-action",
            onClick: () => onDownload(entry),
            title: "下载",
            "aria-label": "下载",
          },
          iconNode(faDownload, "下载")
        )
      ),
      React.createElement(
        "div",
        { className: "folder-browser-file-preview-body" },
        kind === "pdf"
          ? React.createElement("iframe", {
              className: "folder-browser-file-preview-frame",
              src: folderBrowserFileURL(entry.path),
              title,
            })
          : React.createElement(
              "div",
              { className: "folder-browser-file-preview-text-wrap" },
              loading ? React.createElement("div", { className: "folder-browser-file-preview-message" }, "Loading...") : null,
              error ? React.createElement("div", { className: "folder-browser-file-preview-message error" }, error) : null,
              !loading && !error ? React.createElement("pre", { className: "folder-browser-file-preview-text" }, text) : null
            )
      )
    );

    return ReactDOM?.createPortal
      ? ReactDOM.createPortal(previewNode, document.body)
      : previewNode;
  }

  function propertyEntry(target) {
    if (!target) return null;
    if (target.kind === "video") return primarySceneFile(target.item);
    if (target.kind === "image") {
      const file = primaryImageFile(target.item?.image);
      return {
        ...(file || {}),
        path: file?.path || target.item?.path,
        basename: file?.basename || target.item?.basename || target.item?.title,
        size: file?.size || target.item?.size,
        width: file?.width || target.item?.width,
        height: file?.height || target.item?.height,
      };
    }
    return target.entry || target.item?.entry || null;
  }

  async function collectFolderProperties(path, onProgress, isCancelled) {
    const stats = {
      totalSize: 0,
      fileCount: 0,
      folderCount: 0,
      videoCount: 0,
      imageCount: 0,
      galleryCount: 0,
      otherCount: 0,
      scannedFolderCount: 0,
      errorCount: 0,
      lastError: "",
      pendingFolderCount: 0,
    };
    const queue = [path];
    const seen = new Set();

    while (queue.length) {
      if (isCancelled?.()) return null;
      const currentPath = queue.shift();
      if (!currentPath || seen.has(currentPath)) continue;
      seen.add(currentPath);
      stats.scannedFolderCount += 1;
      stats.pendingFolderCount = queue.length;

      try {
        const data = await callGQL(FOLDER_LIST_ENTRIES_QUERY, { path: currentPath });
        const entries = data.folderListEntries?.entries || [];
        entries.forEach((entry) => {
          if (isDirectoryEntry(entry)) {
            stats.folderCount += 1;
            if (entry.path && !seen.has(entry.path)) queue.push(entry.path);
            return;
          }
          stats.fileCount += 1;
          stats.totalSize += Number(entry.size) || 0;
          if (entry.media_type === "VIDEO") stats.videoCount += 1;
          else if (entry.media_type === "IMAGE") stats.imageCount += 1;
          else if (entry.media_type === "GALLERY") stats.galleryCount += 1;
          else stats.otherCount += 1;
        });
      } catch (e) {
        stats.errorCount += 1;
        stats.lastError = e.message || String(e);
      }

      stats.pendingFolderCount = queue.length;
      onProgress?.({ ...stats });
    }

    return stats;
  }

  function PropertiesDialog({ target, onClose }) {
    const entry = propertyEntry(target);
    const isFolder = isDirectoryEntry(entry);
    const folderPath = isFolder ? entry?.path : "";
    const [folderStats, setFolderStats] = React.useState(null);
    const [folderStatsLoading, setFolderStatsLoading] = React.useState(false);

    React.useEffect(() => {
      let cancelled = false;
      setFolderStats(null);
      setFolderStatsLoading(false);
      if (!folderPath) return undefined;

      setFolderStatsLoading(true);
      collectFolderProperties(
        folderPath,
        (stats) => {
          if (!cancelled) setFolderStats(stats);
        },
        () => cancelled
      )
        .then((stats) => {
          if (!cancelled && stats) setFolderStats(stats);
        })
        .finally(() => {
          if (!cancelled) setFolderStatsLoading(false);
        });

      return () => {
        cancelled = true;
      };
    }, [folderPath]);

    React.useEffect(() => {
      if (!target) return undefined;
      function onKeyDown(event) {
        if (event.key === "Escape") onClose();
      }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [target, onClose]);

    if (!target || !entry) return null;

    const title = entry.basename || target.title || pathBasename(entry.path) || "属性";
    const extension = String(entry.extension || fileFormat(entry) || "").replace(/^\./, "");
    const parentPath = entry.parent_path || entry.parent_folder?.path || parentPathForPath(entry.path, entry.basename);
    const fingerprints = (entry.fingerprints || []).map((fingerprint) => `${fingerprint.type}: ${fingerprint.value}`);
    const typeLabel = isFolder
      ? "文件夹"
      : target.kind === "video"
        ? "视频"
        : target.kind === "image"
          ? "图片"
          : mediaTypeLabel(entry);
    const details = [
      detailRow("名称", title),
      detailRow("类型", extension ? `${typeLabel} (${extension.toUpperCase()})` : typeLabel),
      detailRow("位置", parentPath),
      detailRow("路径", entry.path),
      isFolder ? null : detailRow("大小", formatBytes(entry.size) || "0 B"),
      detailRow("修改日期", formatDateTime(entry.mod_time)),
      detailRow("创建日期", formatDateTime(entry.created_at)),
      detailRow("更新日期", formatDateTime(entry.updated_at)),
      entry.width && entry.height ? detailRow("分辨率", `${entry.width}x${entry.height}`) : null,
      entry.duration || entry.duration === 0 ? detailRow("时长", formatDuration(entry.duration)) : null,
      entry.format ? detailRow("格式", entry.format) : null,
      entry.video_codec ? detailRow("视频编码", entry.video_codec) : null,
      entry.audio_codec ? detailRow("音频编码", entry.audio_codec) : null,
      entry.frame_rate ? detailRow("帧率", formatFrameRate(entry.frame_rate)) : null,
      entry.bit_rate ? detailRow("码率", formatBitrate(entry.bit_rate)) : null,
      fingerprints.length ? detailRow("指纹", fingerprints) : null,
    ].filter(Boolean);

    const folderDetails = isFolder
      ? [
          detailRow("包含", folderStats
            ? `${folderStats.fileCount} 个文件，${folderStats.folderCount} 个文件夹`
            : "正在计算..."),
          detailRow("文件数量", folderStats ? `${folderStats.fileCount}` : "正在计算..."),
          detailRow("文件夹数量", folderStats ? `${folderStats.folderCount}` : "正在计算..."),
          detailRow("媒体", folderStats
            ? `${folderStats.videoCount} 个视频，${folderStats.imageCount} 个图片，${folderStats.otherCount} 个其他文件`
            : "正在计算..."),
          detailRow("合计大小", folderStats ? formatBytes(folderStats.totalSize) || "0 B" : "正在计算..."),
          detailRow("占用空间", folderStats ? `${formatBytes(folderStats.totalSize) || "0 B"}（估算）` : "正在计算..."),
          detailRow("已检查文件夹", folderStats
            ? `${folderStats.scannedFolderCount}${folderStatsLoading ? `，待检查 ${folderStats.pendingFolderCount}` : ""}`
            : "0"),
          folderStats?.errorCount ? detailRow("统计错误", `${folderStats.errorCount} 个文件夹读取失败：${folderStats.lastError}`) : null,
        ].filter(Boolean)
      : [];

    const node = React.createElement(
      "div",
      { className: "folder-browser-dialog folder-browser-properties-dialog" },
      React.createElement("div", { className: "folder-browser-dialog-backdrop", onClick: onClose }),
      React.createElement(
        "div",
        { className: "folder-browser-dialog-panel folder-browser-properties-panel" },
        React.createElement(
          "div",
          { className: "folder-browser-properties-head" },
          React.createElement("h3", null, "属性"),
          React.createElement("button", { type: "button", onClick: onClose, "aria-label": "关闭" }, "×")
        ),
        React.createElement("dl", { className: "folder-browser-properties-list" }, details, folderDetails),
        isFolder && folderStatsLoading
          ? React.createElement("div", { className: "folder-browser-properties-note" }, "正在递归统计文件夹内容...")
          : null
      )
    );

    return ReactDOM?.createPortal
      ? ReactDOM.createPortal(node, document.body)
      : node;
  }

  function FolderBrowserPage() {
    const savedStateRef = React.useRef(readFolderBrowserState());
    const restoreContentRef = React.useRef(true);
    const restoreScrollRef = React.useRef(true);
    const savedState = savedStateRef.current;
    const contentRef = React.useRef(null);
    const stickyRef = React.useRef(null);
    const scrollAreaRef = React.useRef(null);
    const mobileFolderTreeRef = React.useRef(null);
    const sceneLoadMoreRef = React.useRef(null);
    const imageLoadMoreRef = React.useRef(null);
    const sceneWallRef = React.useRef(null);
    const imageWallRef = React.useRef(null);
    const mobileScrollFrameRef = React.useRef(null);
    const initialSortState = savedState?.sortState?.key === "basename"
      ? { ...savedState.sortState, key: "filename" }
      : savedState?.sortState;
    const [currentFolder, setCurrentFolder] = React.useState(savedState?.currentFolder ?? null);
    const [contentWidth, setContentWidth] = React.useState(0);
    const [folderTree, setFolderTree] = React.useState([]);
    const [folderEntries, setFolderEntries] = React.useState([]);
    const [scenes, setScenes] = React.useState([]);
    const [images, setImages] = React.useState([]);
    const [sceneTotal, setSceneTotal] = React.useState(0);
    const [imageTotal, setImageTotal] = React.useState(0);
    const [scenePage, setScenePage] = React.useState(0);
    const [imagePage, setImagePage] = React.useState(0);
    const [includeChildren, setIncludeChildren] = React.useState(savedState?.includeChildren ?? true);
    const [activeView, setActiveView] = React.useState(["video", "image", "other"].includes(savedState?.activeView) ? savedState.activeView : "video");
    const [sortState, setSortState] = React.useState(initialSortState ?? { key: "created_at", direction: "DESC" });
    const [videoSizeIndex, setVideoSizeIndex] = React.useState(savedState?.videoSizeIndex ?? savedState?.sizeIndex ?? 2);
    const [imageSizeIndex, setImageSizeIndex] = React.useState(savedState?.imageSizeIndex ?? Math.min(3, (savedState?.sizeIndex ?? 2) + 1));
    const [mobileVideoSizeIndex, setMobileVideoSizeIndex] = React.useState(savedState?.mobileVideoSizeIndex ?? 1);
    const [mobileImageSizeIndex, setMobileImageSizeIndex] = React.useState(savedState?.mobileImageSizeIndex ?? 1);
    const [sidebarWidth, setSidebarWidth] = React.useState(savedState?.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH);
    const [sidebarCollapsed, setSidebarCollapsed] = React.useState(savedState?.sidebarCollapsed ?? false);
    const [isMobileLayout, setIsMobileLayout] = React.useState(mobileLayoutNow);
    const [mobileFoldersOpen, setMobileFoldersOpen] = React.useState(false);
    const [mobileControlsOpen, setMobileControlsOpen] = React.useState(false);
    const [previewAllVisible, setPreviewAllVisible] = React.useState(savedState?.previewAllVisible ?? false);
    const [previewVisibleSceneIDs, setPreviewVisibleSceneIDs] = React.useState([]);
    const [lightboxIndex, setLightboxIndex] = React.useState(null);
    const [touchPreviewSceneID, setTouchPreviewSceneID] = React.useState(null);
    const [slideshow, setSlideshow] = React.useState(false);
    const [filePreview, setFilePreview] = React.useState(null);
    const [propertiesTarget, setPropertiesTarget] = React.useState(null);
    const [selectedSceneIDs, setSelectedSceneIDs] = React.useState([]);
    const [selectedImageIDs, setSelectedImageIDs] = React.useState([]);
    const [moveDialog, setMoveDialog] = React.useState(null);
    const [contextMenu, setContextMenu] = React.useState(null);
    const [copyJobs, setCopyJobs] = React.useState({});
    const [moveTargetFolderID, setMoveTargetFolderID] = React.useState(null);
    const [reloadKey, setReloadKey] = React.useState(0);
    const [folderReloadKey, setFolderReloadKey] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [loadingScenes, setLoadingScenes] = React.useState(false);
    const [loadingImages, setLoadingImages] = React.useState(false);
    const [loadingEntries, setLoadingEntries] = React.useState(false);
    const [uploadStatus, setUploadStatus] = React.useState(null);
    const [mobileScrollMetrics, setMobileScrollMetrics] = React.useState({ top: 0, height: 0 });
    const [error, setError] = React.useState("");

    React.useEffect(() => {
      const media = window.matchMedia?.(MOBILE_LAYOUT_QUERY);
      const update = () => setIsMobileLayout(mobileLayoutNow());
      update();
      if (!media) {
        window.addEventListener("resize", update);
        return () => window.removeEventListener("resize", update);
      }
      media.addEventListener?.("change", update);
      media.addListener?.(update);
      return () => {
        media.removeEventListener?.("change", update);
        media.removeListener?.(update);
      };
    }, []);

    React.useEffect(() => {
      if (!isMobileLayout) {
        setMobileFoldersOpen(false);
        setMobileControlsOpen(false);
      }
    }, [isMobileLayout]);

    const updateMobileScrollMetrics = React.useCallback(() => {
      const node = scrollAreaRef.current;
      if (!node) return;
      setMobileScrollMetrics({
        top: node.scrollTop || 0,
        height: node.clientHeight || window.innerHeight || 0,
      });
    }, []);

    const scheduleMobileScrollMetrics = React.useCallback(() => {
      if (!isMobileLayout || mobileScrollFrameRef.current) return;
      mobileScrollFrameRef.current = window.requestAnimationFrame(() => {
        mobileScrollFrameRef.current = null;
        updateMobileScrollMetrics();
      });
    }, [isMobileLayout, updateMobileScrollMetrics]);

    React.useEffect(() => () => {
      if (mobileScrollFrameRef.current) {
        window.cancelAnimationFrame(mobileScrollFrameRef.current);
        mobileScrollFrameRef.current = null;
      }
    }, []);

    React.useEffect(() => {
      if (!isMobileLayout || !mobileFoldersOpen) return undefined;
      let frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(() => {
          const activeRow = mobileFolderTreeRef.current?.querySelector?.(".folder-browser-tree-row.active");
          activeRow?.scrollIntoView?.({ block: "center", inline: "nearest" });
        });
      });
      return () => window.cancelAnimationFrame(frame);
    }, [currentFolder?.id, folderTree, isMobileLayout, mobileFoldersOpen]);

    React.useEffect(() => {
      if (!contentRef.current) return undefined;
      const updateWidth = () => {
        setContentWidth(Math.floor(contentRef.current?.getBoundingClientRect().width || 0));
      };
      updateWidth();
      if (!window.ResizeObserver) {
        window.addEventListener("resize", updateWidth);
        return () => window.removeEventListener("resize", updateWidth);
      }
      const observer = new ResizeObserver(updateWidth);
      observer.observe(contentRef.current);
      return () => observer.disconnect();
    }, [folderReloadKey, isMobileLayout, sidebarCollapsed, sidebarWidth]);

    React.useEffect(() => {
      const node = contentRef.current;
      if (!node) return undefined;
      function resetHorizontalScroll() {
        if (node.scrollLeft !== 0) node.scrollLeft = 0;
      }
      resetHorizontalScroll();
      node.addEventListener("scroll", resetHorizontalScroll, { passive: true });
      return () => node.removeEventListener("scroll", resetHorizontalScroll);
    }, [isMobileLayout, sidebarCollapsed, sidebarWidth]);

    React.useEffect(() => {
      function closeMenu() {
        setContextMenu(null);
      }
      window.addEventListener("click", closeMenu);
      window.addEventListener("scroll", closeMenu, { passive: true });
      window.addEventListener("resize", closeMenu);
      return () => {
        window.removeEventListener("click", closeMenu);
        window.removeEventListener("scroll", closeMenu);
        window.removeEventListener("resize", closeMenu);
      };
    }, []);

    function startSidebarResize(event) {
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = sidebarWidth;
      function onPointerMove(moveEvent) {
        setSidebarWidth(clamp(startWidth + moveEvent.clientX - startX, MIN_SIDEBAR_WIDTH, MAX_SIDEBAR_WIDTH));
      }
      function onPointerUp() {
        window.removeEventListener("pointermove", onPointerMove);
        window.removeEventListener("pointerup", onPointerUp);
        document.body.classList.remove("folder-browser-resizing");
      }
      document.body.classList.add("folder-browser-resizing");
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    }

    const persistFolderState = React.useCallback((overrides = {}) => {
      if (!folderTree.length && !currentFolder) return;
      const previous = readFolderBrowserState() || {};
      writeFolderBrowserState({
        ...previous,
        currentFolder,
        currentFolderID: currentFolder?.id,
        expandedFolderIDs: expandedFolderIDs(folderTree),
        includeChildren,
        activeView,
        sortState,
        videoSizeIndex,
        imageSizeIndex,
        mobileVideoSizeIndex,
        mobileImageSizeIndex,
        sidebarWidth,
        sidebarCollapsed,
        previewAllVisible,
        scenePage,
        imagePage,
        scrollY: pageScrollY(),
        ...overrides,
      });
    }, [currentFolder, folderTree, includeChildren, activeView, sortState, videoSizeIndex, imageSizeIndex, mobileVideoSizeIndex, mobileImageSizeIndex, sidebarWidth, sidebarCollapsed, previewAllVisible, scenePage, imagePage]);

    React.useEffect(() => {
      persistFolderState();
    }, [persistFolderState]);

    React.useEffect(() => {
      let scheduled = false;
      function onScroll() {
        if (scheduled) return;
        scheduled = true;
        window.requestAnimationFrame(() => {
          scheduled = false;
          persistFolderState();
        });
      }
      window.addEventListener("scroll", onScroll, { passive: true });
      return () => window.removeEventListener("scroll", onScroll);
    }, [persistFolderState]);

    const openRoot = React.useCallback(() => {
      setCurrentFolder(null);
      setFolderEntries([]);
      setScenes([]);
      setImages([]);
      setSceneTotal(0);
      setImageTotal(0);
      setScenePage(0);
      setImagePage(0);
      setIncludeChildren(false);
      setSelectedSceneIDs([]);
      setSelectedImageIDs([]);
    }, []);

    React.useEffect(() => {
      let cancelled = false;
      async function loadRootFolders() {
        setLoading(true);
        setError("");
        try {
          const data = await callGQL(ROOT_FOLDERS_QUERY, {
            folderFilter: rootFolderFilter(),
            filter: findFilter("basename", "ASC", -1),
          });
          if (!cancelled) {
            const rootFolders = (data.findFolders.folders ?? []).map(asTreeNode);
            const rootsWithChildren = await Promise.all(
              rootFolders.map(async (folder) => {
                if (Array.isArray(folder.children) && folder.children.length === 0) return folder;
                const children = await loadFolderChildren(folder.id);
                return { ...folder, children, expanded: children.length > 0, loading: false };
              })
            );
            const restoredTree = await restoreTreeState(rootsWithChildren, savedStateRef.current);
            if (!cancelled) {
              setFolderTree(restoredTree);
              const savedFolderID = savedStateRef.current?.currentFolderID || savedStateRef.current?.currentFolder?.id;
              const savedFolder = savedStateRef.current?.currentFolder;
              const restoredFolder = savedFolderID ? findTreeNode(restoredTree, savedFolderID) : null;
              if (restoredFolder) setCurrentFolder(restoredFolder);
              const restoredPathOnlyFolder = !restoredFolder && isPathOnlyFolder(savedFolder) && savedFolder?.path;
              if (restoredPathOnlyFolder) {
                setCurrentFolder(savedFolder);
              }
              if (!restoredFolder && !restoredPathOnlyFolder && restoredTree[0]) {
                setCurrentFolder(restoredTree[0]);
                setIncludeChildren(true);
              }
            }
          }
        } catch (e) {
          if (!cancelled) setError(e.message || String(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      loadRootFolders();
      return () => {
        cancelled = true;
      };
    }, [folderReloadKey]);

    const videoSizePreset = isMobileLayout
      ? MOBILE_VIDEO_SIZE_PRESETS[mobileVideoSizeIndex] || MOBILE_VIDEO_SIZE_PRESETS[1]
      : VIDEO_SIZE_PRESETS[videoSizeIndex] || VIDEO_SIZE_PRESETS[2];
    const imageSizePreset = isMobileLayout
      ? MOBILE_IMAGE_SIZE_PRESETS[mobileImageSizeIndex] || MOBILE_IMAGE_SIZE_PRESETS[1]
      : IMAGE_SIZE_PRESETS[imageSizeIndex] || IMAGE_SIZE_PRESETS[3];
    const activeSizeIndex = activeView === "video"
      ? isMobileLayout ? mobileVideoSizeIndex : videoSizeIndex
      : isMobileLayout ? mobileImageSizeIndex : imageSizeIndex;
    const activeSizeMax = activeView === "video"
      ? (isMobileLayout ? MOBILE_VIDEO_SIZE_PRESETS : VIDEO_SIZE_PRESETS).length - 1
      : (isMobileLayout ? MOBILE_IMAGE_SIZE_PRESETS : IMAGE_SIZE_PRESETS).length - 1;
    const onActiveSizeChange = React.useCallback(
      (value) => {
        if (activeView === "video" && isMobileLayout) {
          setMobileVideoSizeIndex(value);
        } else if (activeView === "image" && isMobileLayout) {
          setMobileImageSizeIndex(value);
        } else if (activeView === "video") {
          setVideoSizeIndex(value);
        } else {
          setImageSizeIndex(value);
        }
      },
      [activeView, isMobileLayout]
    );
    const scenePageSize = React.useMemo(
      () => isMobileLayout
        ? mobilePageSizeForRows(videoSizePreset.columns, SCENE_PAGE_ROWS)
        : pageSizeForRows(contentWidth, videoSizePreset.wallHeight * 1.75, SCENE_PAGE_ROWS, WALL_GAP),
      [contentWidth, isMobileLayout, videoSizePreset.columns, videoSizePreset.wallHeight]
    );
    const imagePageSize = React.useMemo(
      () => isMobileLayout
        ? mobilePageSizeForRows(imageSizePreset.columns, IMAGE_PAGE_ROWS)
        : pageSizeForRows(contentWidth, imageSizePreset.wallHeight * 1.2, IMAGE_PAGE_ROWS, WALL_GAP),
      [contentWidth, imageSizePreset.columns, imageSizePreset.wallHeight, isMobileLayout]
    );
    const scenePageSizeRef = React.useRef(scenePageSize);
    const imagePageSizeRef = React.useRef(imagePageSize);

    React.useEffect(() => {
      scenePageSizeRef.current = scenePageSize;
    }, [scenePageSize]);

    React.useEffect(() => {
      imagePageSizeRef.current = imagePageSize;
    }, [imagePageSize]);

    React.useEffect(() => {
      if (!isMobileLayout) return undefined;
      const frame = window.requestAnimationFrame(updateMobileScrollMetrics);
      return () => window.cancelAnimationFrame(frame);
    }, [
      activeView,
      currentFolder?.id,
      imageSizePreset.wallHeight,
      images.length,
      isMobileLayout,
      scenes.length,
      updateMobileScrollMetrics,
      videoSizePreset.wallHeight,
    ]);

    React.useEffect(() => {
      if (!currentFolder) {
        setFolderEntries([]);
        setScenes([]);
        setImages([]);
        setSceneTotal(0);
        setImageTotal(0);
        setScenePage(0);
        setImagePage(0);
        setSelectedSceneIDs([]);
        setSelectedImageIDs([]);
        return;
      }

      let cancelled = false;
      async function loadInitialContent() {
        setLoading(true);
        setLoadingEntries(true);
        setLoadingScenes(true);
        setLoadingImages(true);
        setError("");
        setFolderEntries([]);
        setScenes([]);
        setImages([]);
        setSceneTotal(0);
        setImageTotal(0);
        setScenePage(0);
        setImagePage(0);
        setSelectedSceneIDs([]);
        setSelectedImageIDs([]);
        try {
          const canQueryScannedMedia = currentFolder.id && !isPathOnlyFolder(currentFolder);
          const criterion = canQueryScannedMedia ? folderCriterion(currentFolder.id, includeChildren) : null;
          const saved = savedStateRef.current;
          const shouldRestoreContent =
            restoreContentRef.current &&
            saved?.currentFolderID === currentFolder.id;
          const initialScenePage = shouldRestoreContent ? Math.max(1, saved.scenePage || 1) : 1;
          const initialImagePage = shouldRestoreContent ? Math.max(1, saved.imagePage || 1) : 1;
          const initialScenePageSize = scenePageSizeRef.current * initialScenePage;
          const initialImagePageSize = imagePageSizeRef.current * initialImagePage;
          const [listingData, sceneData, imageData] = await Promise.all([
            callGQL(FOLDER_LIST_ENTRIES_QUERY, { path: currentFolder.path }),
            canQueryScannedMedia
              ? callGQL(SCENES_QUERY, {
                  folderCriterion: criterion,
                  mediaFilter: findFilter(sortState.key, sortState.direction, initialScenePageSize, 1),
                })
              : Promise.resolve({ findScenes: { count: 0, scenes: [] } }),
            canQueryScannedMedia
              ? callGQL(IMAGES_QUERY, {
                  folderCriterion: criterion,
                  mediaFilter: findFilter(sortState.key, sortState.direction, initialImagePageSize, 1),
                })
              : Promise.resolve({ findImages: { count: 0, images: [] } }),
          ]);
          if (!cancelled) {
            setFolderEntries(listingData.folderListEntries?.entries ?? []);
            setScenes(sceneData.findScenes.scenes ?? []);
            setImages(imageData.findImages.images ?? []);
            setSceneTotal(sceneData.findScenes.count ?? 0);
            setImageTotal(imageData.findImages.count ?? 0);
            setScenePage(initialScenePage);
            setImagePage(initialImagePage);
            restoreContentRef.current = false;
            if (shouldRestoreContent && restoreScrollRef.current) {
              restoreScrollRef.current = false;
              restoreMediaIntoView(saved, saved.scrollY || 0);
            }
          }
        } catch (e) {
          if (!cancelled) setError(friendlyFileApiError(e));
        } finally {
          if (!cancelled) {
            setLoading(false);
            setLoadingEntries(false);
            setLoadingScenes(false);
            setLoadingImages(false);
          }
        }
      }
      loadInitialContent();
      return () => {
        cancelled = true;
      };
    }, [currentFolder, includeChildren, sortState, reloadKey]);

    async function loadChildren(folder) {
      setFolderTree((current) =>
        updateTreeNode(current, folder.id, (node) => ({ ...node, loading: true }))
      );

      try {
        const children = await loadFolderChildren(folder.id);
        setFolderTree((current) =>
          updateTreeNode(current, folder.id, (node) => ({
            ...node,
            children,
            expanded: true,
            loading: false,
          }))
        );
      } catch (e) {
        console.error("[Folder Browser] Failed to load folder children", e);
        setError(e.message || String(e));
        setFolderTree((current) =>
          updateTreeNode(current, folder.id, (node) => ({ ...node, loading: false }))
        );
      }
    }

    function onSelectFolder(folder) {
      setContextMenu(null);
      setCurrentFolder(findTreeNode(folderTree, folder.id) || folder);
      if (isMobileLayout) {
        setMobileFoldersOpen(false);
        setMobileControlsOpen(false);
      }
    }

    async function expandFolder(folder) {
      if (Array.isArray(folder.children) && folder.children.length === 0) return;
      if (folder.children === undefined && !folder.expanded) {
        await loadChildren(folder);
        return;
      }
      if (folder.expanded) return;
      setFolderTree((current) =>
        updateTreeNode(current, folder.id, (node) => ({
          ...node,
          expanded: true,
        }))
      );
    }

    async function onActivateTreeFolder(folder) {
      onSelectFolder(folder);
      await expandFolder(folder);
    }

    async function onToggleTreeFolder(folder) {
      onSelectFolder(folder);
      await onToggleFolder(folder);
    }

    function selectFolderByPath(path, fallbackEntry = null) {
      const existing = findTreeNodeByPath(folderTree, path);
      setCurrentFolder(existing || folderFromEntry(fallbackEntry || { path, basename: pathBasename(path) }));
      setSelectedSceneIDs([]);
      setSelectedImageIDs([]);
      setLightboxIndex(null);
      if (isMobileLayout) {
        setMobileFoldersOpen(false);
        setMobileControlsOpen(false);
      }
    }

    async function onToggleFolder(folder) {
      if (Array.isArray(folder.children) && folder.children.length === 0) return;

      if (folder.children === undefined && !folder.expanded) {
        await loadChildren(folder);
        return;
      }

      setFolderTree((current) =>
        updateTreeNode(current, folder.id, (node) => ({
          ...node,
          expanded: !node.expanded,
        }))
      );
    }

    const loadMoreScenes = React.useCallback(async () => {
      if (!currentFolder || loadingScenes || scenes.length >= sceneTotal) return;
      const nextPage = scenePage + 1;
      setLoadingScenes(true);
      setError("");
      try {
        const data = await callGQL(SCENES_QUERY, {
          folderCriterion: folderCriterion(currentFolder.id, includeChildren),
          mediaFilter: findFilter(sortState.key, sortState.direction, scenePageSize, nextPage),
        });
        setScenes((current) => [...current, ...(data.findScenes.scenes ?? [])]);
        setSceneTotal(data.findScenes.count ?? sceneTotal);
        setScenePage(nextPage);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingScenes(false);
      }
    }, [currentFolder, includeChildren, loadingScenes, scenePage, scenes.length, sceneTotal, sortState, scenePageSize]);

    const loadMoreImages = React.useCallback(async () => {
      if (!currentFolder || loadingImages || images.length >= imageTotal) return;
      const nextPage = imagePage + 1;
      setLoadingImages(true);
      setError("");
      try {
        const data = await callGQL(IMAGES_QUERY, {
          folderCriterion: folderCriterion(currentFolder.id, includeChildren),
          mediaFilter: findFilter(sortState.key, sortState.direction, imagePageSize, nextPage),
        });
        setImages((current) => [...current, ...(data.findImages.images ?? [])]);
        setImageTotal(data.findImages.count ?? imageTotal);
        setImagePage(nextPage);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingImages(false);
      }
    }, [currentFolder, includeChildren, imagePage, images.length, imageTotal, loadingImages, sortState, imagePageSize]);

    const onSortChange = React.useCallback((key) => {
      setSortState((current) => ({
        key,
        direction: current.key === key && current.direction === "DESC" ? "ASC" : "DESC",
      }));
    }, []);

    const videos = React.useMemo(
      () => scenes ?? [],
      [scenes]
    );
    const pictures = React.useMemo(() => imageItems(images), [images]);
    const sceneByPath = React.useMemo(() => {
      const map = new Map();
      videos.forEach((scene) => {
        const file = primarySceneFile(scene);
        if (file?.path) map.set(normalizePathKey(file.path), scene);
      });
      return map;
    }, [videos]);
    const imageByPath = React.useMemo(() => {
      const map = new Map();
      pictures.forEach((item) => {
        if (item.path) map.set(normalizePathKey(item.path), item);
      });
      return map;
    }, [pictures]);
    const fileEntryItems = React.useMemo(
      () =>
        sortFileEntries(folderEntries, sortState).map((entry) => ({
          entry,
          scene: sceneByPath.get(normalizePathKey(entry.path)),
          imageItem: imageByPath.get(normalizePathKey(entry.path)),
        })),
      [folderEntries, imageByPath, sceneByPath, sortState]
    );
    const otherEntryItems = React.useMemo(
      () =>
        fileEntryItems.filter((item) => {
          const entry = item.entry;
          const isDirectory = isDirectoryEntry(entry);
          return isDirectory || !["VIDEO", "IMAGE"].includes(entry.media_type);
        }),
      [fileEntryItems]
    );
    const visibleVideos = React.useMemo(
      () => videos,
      [videos]
    );
    const wallVideos = React.useMemo(
      () =>
        completeWallItems(
          visibleVideos,
          contentWidth,
          videoSizePreset.wallHeight,
          scenes.length >= sceneTotal,
          sceneAspect,
          isMobileLayout ? videoSizePreset.columns : null
      ),
      [visibleVideos, contentWidth, isMobileLayout, videoSizePreset.columns, videoSizePreset.wallHeight, scenes.length, sceneTotal]
    );
    const visibleImages = React.useMemo(
      () => pictures,
      [pictures]
    );
    const wallImages = React.useMemo(
      () =>
        completeWallItems(
          visibleImages,
          contentWidth,
          imageSizePreset.wallHeight,
          images.length >= imageTotal,
          imageAspect,
          isMobileLayout ? imageSizePreset.columns : null
        ),
      [visibleImages, contentWidth, imageSizePreset.columns, imageSizePreset.wallHeight, images.length, imageTotal, isMobileLayout]
    );
    const renderVideoWindow = React.useMemo(
      () =>
        mediaWallWindow(wallVideos, {
          enabled: isMobileLayout,
          wallRef: sceneWallRef,
          scrollTop: mobileScrollMetrics.top,
          viewportHeight: mobileScrollMetrics.height,
          wallHeight: videoSizePreset.wallHeight,
          columns: videoSizePreset.columns,
        }),
      [isMobileLayout, mobileScrollMetrics.height, mobileScrollMetrics.top, videoSizePreset.columns, videoSizePreset.wallHeight, wallVideos]
    );
    const renderImageWindow = React.useMemo(
      () =>
        mediaWallWindow(wallImages, {
          enabled: isMobileLayout,
          wallRef: imageWallRef,
          scrollTop: mobileScrollMetrics.top,
          viewportHeight: mobileScrollMetrics.height,
          wallHeight: imageSizePreset.wallHeight,
          columns: imageSizePreset.columns,
        }),
      [imageSizePreset.columns, imageSizePreset.wallHeight, isMobileLayout, mobileScrollMetrics.height, mobileScrollMetrics.top, wallImages]
    );
    const lightboxImages = pictures;
    const selectedImages = React.useMemo(
      () => wallImages.filter((item) => selectedImageIDs.includes(item.imageID)),
      [wallImages, selectedImageIDs]
    );
    const selectedScenes = React.useMemo(
      () => wallVideos.filter((item) => selectedSceneIDs.includes(item.id)),
      [wallVideos, selectedSceneIDs]
    );
    const selectedMediaCount = selectedScenes.length + selectedImages.length;
    const selectedFileIDs = React.useMemo(
      () => [
        ...selectedScenes.map((item) => primarySceneFile(item)?.id).filter(Boolean),
        ...selectedImages.map((item) => item.fileID).filter(Boolean),
      ],
      [selectedScenes, selectedImages]
    );
    const selectedCopyEntries = React.useMemo(
      () => [
        ...selectedScenes.map((item) => {
          const file = primarySceneFile(item);
          return file?.path
            ? { path: file.path, basename: file.basename || item.title || pathBasename(file.path), type: "FILE", media_type: "VIDEO" }
            : null;
        }),
        ...selectedImages.map((item) =>
          item.path
            ? { path: item.path, basename: item.basename || item.title || pathBasename(item.path), type: "FILE", media_type: "IMAGE" }
            : null
        ),
      ].filter(Boolean),
      [selectedScenes, selectedImages]
    );

    const toggleSceneSelection = React.useCallback((sceneID, selected) => {
      setContextMenu(null);
      setSelectedSceneIDs((current) => {
        if (selected) return current.includes(sceneID) ? current : [...current, sceneID];
        return current.filter((id) => id !== sceneID);
      });
    }, []);

    const toggleImageSelection = React.useCallback((imageID, selected) => {
      setContextMenu(null);
      setSelectedImageIDs((current) => {
        if (selected) return current.includes(imageID) ? current : [...current, imageID];
        return current.filter((id) => id !== imageID);
      });
    }, []);

    const toggleAllScenes = React.useCallback((selected) => {
      setContextMenu(null);
      const ids = wallVideos.map((item) => item.id);
      setSelectedSceneIDs((current) => {
        const rest = current.filter((id) => !ids.includes(id));
        return selected ? [...rest, ...ids] : rest;
      });
    }, [wallVideos]);

    const toggleAllImages = React.useCallback((selected) => {
      setContextMenu(null);
      const ids = wallImages.map((item) => item.imageID);
      setSelectedImageIDs((current) => {
        const rest = current.filter((id) => !ids.includes(id));
        return selected ? [...rest, ...ids] : rest;
      });
    }, [wallImages]);

    const allWallVideosSelected = wallVideos.length > 0 && wallVideos.every((item) => selectedSceneIDs.includes(item.id));
    const someWallVideosSelected = wallVideos.some((item) => selectedSceneIDs.includes(item.id));
    const allWallImagesSelected = wallImages.length > 0 && wallImages.every((item) => selectedImageIDs.includes(item.imageID));
    const someWallImagesSelected = wallImages.some((item) => selectedImageIDs.includes(item.imageID));

    function scrollImageIntoView(imageID) {
      if (!imageID) return;
      window.requestAnimationFrame(() => {
        const tile = scrollAreaRef.current?.querySelector(`[data-folder-browser-image-id="${imageID}"]`);
        tile?.scrollIntoView?.({ block: "center", inline: "nearest" });
      });
    }

    const openImagePreview = React.useCallback((index) => {
      const item = lightboxImages[index];
      if (item) persistFolderState({ activeView: "image", lastOpenedImageID: item.imageID });
      setLightboxIndex(index);
    }, [lightboxImages, persistFolderState]);

    const openImageItem = React.useCallback((item) => {
      const index = lightboxImages.findIndex((image) => image.imageID === item?.imageID);
      if (index >= 0) openImagePreview(index);
    }, [lightboxImages, openImagePreview]);

    const closeImagePreview = React.useCallback(() => {
      const item = lightboxIndex === null ? null : lightboxImages[lightboxIndex];
      if (item) persistFolderState({ activeView: "image", lastOpenedImageID: item.imageID });
      setLightboxIndex(null);
      if (item) scrollImageIntoView(item.imageID);
    }, [lightboxIndex, lightboxImages, persistFolderState]);

    const moveLightbox = React.useCallback(
      (delta) => {
        setLightboxIndex((current) => {
          if (current === null || lightboxImages.length === 0) return null;
          return (current + delta + lightboxImages.length) % lightboxImages.length;
        });
      },
      [lightboxImages.length]
    );

    React.useEffect(() => {
      if (lightboxIndex !== null && loadingImages && lightboxImages.length === 0) return;
      if (lightboxIndex !== null && lightboxIndex >= lightboxImages.length) {
        setLightboxIndex(lightboxImages.length ? lightboxImages.length - 1 : null);
      }
    }, [lightboxIndex, lightboxImages.length, loadingImages]);

    React.useEffect(() => {
      if (!previewAllVisible || activeView !== "video" || !wallVideos.length) {
        setPreviewVisibleSceneIDs([]);
        return undefined;
      }

      let raf = 0;
      function updateVisiblePreviews() {
        window.cancelAnimationFrame(raf);
        raf = window.requestAnimationFrame(() => {
          const stickyBottom = stickyRef.current?.getBoundingClientRect().bottom || 0;
          const topLimit = Math.max(0, stickyBottom) + 8;
          const bottomLimit = window.innerHeight - 8;
          const ids = [...document.querySelectorAll(".folder-browser-video-wall-tile[data-folder-scene-id]")]
            .filter((node) => {
              const rect = node.getBoundingClientRect();
              return rect.top >= topLimit && rect.bottom <= bottomLimit;
            })
            .map((node) => node.getAttribute("data-folder-scene-id"))
            .filter(Boolean);
          setPreviewVisibleSceneIDs((current) => {
            if (current.length === ids.length && current.every((id, index) => id === ids[index])) return current;
            return ids;
          });
        });
      }

      const scrollRoot = scrollAreaRef.current;
      updateVisiblePreviews();
      scrollRoot?.addEventListener("scroll", updateVisiblePreviews, { passive: true });
      window.addEventListener("resize", updateVisiblePreviews);
      return () => {
        window.cancelAnimationFrame(raf);
        scrollRoot?.removeEventListener("scroll", updateVisiblePreviews);
        window.removeEventListener("resize", updateVisiblePreviews);
      };
    }, [activeView, previewAllVisible, wallVideos.length, videoSizePreset.wallHeight]);

    React.useEffect(() => {
      if (!currentFolder) return undefined;
      const canLoadVideos = activeView === "video" && scenes.length < sceneTotal && !loadingScenes;
      const canLoadImages = activeView === "image" && images.length < imageTotal && !loadingImages;
      const targets = [
        canLoadVideos && sceneLoadMoreRef.current ? { node: sceneLoadMoreRef.current, load: loadMoreScenes } : null,
        canLoadImages && imageLoadMoreRef.current ? { node: imageLoadMoreRef.current, load: loadMoreImages } : null,
      ].filter(Boolean);
      if (!targets.length) return undefined;

      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const target = targets.find((item) => item.node === entry.target);
            target?.load();
          });
        },
        { root: scrollAreaRef.current, rootMargin: "700px 0px", threshold: 0.01 }
      );
      targets.forEach((target) => observer.observe(target.node));
      return () => observer.disconnect();
    }, [
      activeView,
      currentFolder,
      scenes.length,
      sceneTotal,
      images.length,
      imageTotal,
      loadingScenes,
      loadingImages,
      loadMoreScenes,
      loadMoreImages,
    ]);

    const refreshContent = React.useCallback(() => {
      setReloadKey((current) => current + 1);
    }, []);

    const refreshFoldersAndContent = React.useCallback(() => {
      setFolderReloadKey((current) => current + 1);
      setReloadKey((current) => current + 1);
    }, []);

    const activeCopyJobIDs = React.useMemo(
      () => Object.values(copyJobs)
        .filter((job) => job?.id && !isTerminalCopyJob(job))
        .map((job) => job.id)
        .join(","),
      [copyJobs]
    );

    function trackCopyJobs(jobs) {
      const startedJobs = (jobs || []).filter((job) => job?.id);
      if (!startedJobs.length) return;
      const now = Date.now();
      setCopyJobs((current) => {
        const next = { ...current };
        startedJobs.forEach((job) => {
          next[job.id] = {
            ...(next[job.id] || {}),
            id: job.id,
            title: job.title,
            description: job.description || job.title,
            status: next[job.id]?.status || "READY",
            progress: next[job.id]?.progress ?? null,
            startedAt: next[job.id]?.startedAt || now,
            updatedAt: now,
          };
        });
        return next;
      });
    }

    React.useEffect(() => {
      if (!activeCopyJobIDs) return undefined;
      let cancelled = false;
      const ids = activeCopyJobIDs.split(",").filter(Boolean);

      async function pollCopyJobs() {
        const results = await Promise.all(ids.map((id) =>
          callGQL(FIND_JOB_QUERY, { input: { id } })
            .then((data) => data?.findJob || { id, status: "FINISHED" })
            .catch((error) => ({ id, status: "FAILED", error: error.message || String(error) }))
        ));
        if (cancelled) return;
        const shouldRefresh = results.some((job) => job.status === "FINISHED");
        const now = Date.now();
        setCopyJobs((current) => {
          const next = { ...current };
          results.forEach((job) => {
            const previous = next[job.id] || { id: job.id };
            const nextJob = {
              ...previous,
              ...job,
              description: job.description || previous.description,
              title: previous.title,
              updatedAt: now,
            };
            next[job.id] = nextJob;
          });
          return next;
        });
        if (shouldRefresh) refreshFoldersAndContent();
      }

      pollCopyJobs();
      const timer = window.setInterval(pollCopyJobs, 1200);
      return () => {
        cancelled = true;
        window.clearInterval(timer);
      };
    }, [activeCopyJobIDs, refreshFoldersAndContent]);

    function clearCopyJobs() {
      setCopyJobs((current) => {
        const active = {};
        Object.values(current).forEach((job) => {
          if (!isTerminalCopyJob(job)) active[job.id] = job;
        });
        return active;
      });
    }

    const handleScrollAreaScroll = React.useCallback(() => {
      scheduleMobileScrollMetrics();
    }, [scheduleMobileScrollMetrics]);

    function openFileEntry(item) {
      const entry = item?.entry;
      if (!entry) return;
      if (isDirectoryEntry(entry)) {
        selectFolderByPath(entry.path, entry);
        return;
      }
      const previewKind = previewKindForEntry(entry);
      if (previewKind) {
        setFilePreview({ entry, kind: previewKind });
        return;
      }
      if (item.scene?.id) {
        persistFolderState({ lastOpenedSceneID: item.scene.id });
        window.location.assign(`${baseURL.replace(/\/$/, "")}/scenes/${item.scene.id}?${SCENE_RETURN_PARAM}=1`);
        return;
      }
      if (item.imageItem?.imageID) {
        const index = lightboxImages.findIndex((image) => image.imageID === item.imageItem.imageID);
        if (index >= 0) openImagePreview(index);
      }
    }

    async function createFolderAt(path) {
      const basename = window.prompt("新文件夹名");
      if (!basename) return;
      setLoading(true);
      setError("");
      try {
        await callGQL(FOLDER_CREATE_MUTATION, { path: joinFolderPath(path, basename) });
        refreshFoldersAndContent();
      } catch (e) {
        setError(friendlyFileApiError(e));
      } finally {
        setLoading(false);
      }
    }

    function openUploadPicker(destinationPath, mode) {
      if (!destinationPath) return;
      const input = document.createElement("input");
      input.type = "file";
      input.multiple = true;
      input.style.display = "none";
      if (mode === "folder") {
        input.setAttribute("webkitdirectory", "");
        input.setAttribute("directory", "");
      }
      input.addEventListener("change", () => {
        const files = Array.from(input.files || []);
        input.remove();
        if (!files.length) return;
        if (mode === "folder") {
          uploadFolderToPath(destinationPath, files);
        } else {
          uploadFilesToPath(destinationPath, files);
        }
      }, { once: true });
      document.body.appendChild(input);
      input.click();
    }

    function uploadFilesHere(path = currentFolder?.path) {
      openUploadPicker(path, "files");
    }

    function uploadFolderHere(path = currentFolder?.path) {
      openUploadPicker(path, "folder");
    }

    async function uploadFilesToPath(destinationPath, selectedFiles) {
      const files = selectedFiles.filter((file) => file?.name);
      if (!destinationPath || !files.length) return;
      const totalBytes = files.reduce((sum, file) => sum + (Number(file.size) || 0), 0);
      let uploadedBytes = 0;
      setLoading(true);
      setError("");
      setUploadStatus({
        id: `upload-files-${Date.now()}`,
        status: "RUNNING",
        title: `上传 ${files.length} 个文件`,
        description: destinationPath,
        progress: 0,
      });
      try {
        for (let index = 0; index < files.length; index += 1) {
          const file = files[index];
          await callUploadGQL(
            FILE_UPLOAD_MUTATION,
            {
              input: {
                file: null,
                destination_folder: destinationPath,
                destination_basename: null,
              },
            },
            [{ path: "variables.input.file", file }],
            (progress) => {
              const currentBytes = Number(file.size) ? Number(file.size) * progress : 0;
              const aggregateProgress = totalBytes
                ? (uploadedBytes + currentBytes) / totalBytes
                : (index + progress) / files.length;
              setUploadStatus((current) => ({
                ...current,
                status: "RUNNING",
                title: `上传文件 ${index + 1}/${files.length}`,
                description: file.name,
                progress: aggregateProgress,
              }));
            }
          );
          uploadedBytes += Number(file.size) || 0;
        }
        setUploadStatus((current) => ({
          ...current,
          status: "FINISHED",
          title: `已上传 ${files.length} 个文件`,
          description: destinationPath,
          progress: 1,
        }));
        refreshFoldersAndContent();
      } catch (e) {
        const message = friendlyFileApiError(e);
        setUploadStatus((current) => ({
          ...current,
          status: "FAILED",
          error: message,
        }));
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    async function uploadFolderToPath(destinationPath, selectedFiles) {
      const files = selectedFiles
        .map((file) => ({ file, relativePath: uploadRelativePath(file) }))
        .filter((item) => item.file?.name && item.relativePath);
      if (!destinationPath || !files.length) return;
      const firstPath = files[0]?.relativePath || "";
      const folderName = firstPath.includes("/") ? firstPath.split("/")[0] : pathBasename(firstPath) || "文件夹";
      setLoading(true);
      setError("");
      setUploadStatus({
        id: `upload-folder-${Date.now()}`,
        status: "RUNNING",
        title: `上传文件夹 ${folderName}`,
        description: `${files.length} 个文件`,
        progress: 0,
      });
      try {
        await callUploadGQL(
          FOLDER_UPLOAD_MUTATION,
          {
            input: {
              destination_folder: destinationPath,
              destination_basename: null,
              files: files.map((item) => ({
                file: null,
                relative_path: item.relativePath,
              })),
            },
          },
          files.map((item, index) => ({
            path: `variables.input.files.${index}.file`,
            file: item.file,
          })),
          (progress, loaded, total) => {
            const detail = total ? `${formatBytes(loaded)} / ${formatBytes(total)}` : `${files.length} 个文件`;
            setUploadStatus((current) => ({
              ...current,
              status: "RUNNING",
              title: `上传文件夹 ${folderName}`,
              description: detail,
              progress,
            }));
          }
        );
        setUploadStatus((current) => ({
          ...current,
          status: "FINISHED",
          title: `已上传文件夹 ${folderName}`,
          description: destinationPath,
          progress: 1,
        }));
        refreshFoldersAndContent();
      } catch (e) {
        const message = friendlyFileApiError(e);
        setUploadStatus((current) => ({
          ...current,
          status: "FAILED",
          error: message,
        }));
        setError(message);
      } finally {
        setLoading(false);
      }
    }

    async function renameFileEntry(item) {
      const entry = item?.entry;
      if (!entry) return;
      const basename = window.prompt("新的名称", entry.basename || pathBasename(entry.path));
      if (!basename || basename === entry.basename) return;
      setLoading(true);
      setError("");
      try {
        if (isDirectoryEntry(entry)) {
          await callGQL(FOLDER_RENAME_MUTATION, { path: entry.path, basename });
          if (currentFolder?.path === entry.path) selectFolderByPath(joinFolderPath(entry.parent_path || "", basename));
          refreshFoldersAndContent();
        } else {
          await callGQL(FILE_RENAME_MUTATION, { path: entry.path, basename });
          refreshContent();
        }
      } catch (e) {
        setError(friendlyFileApiError(e));
      } finally {
        setLoading(false);
      }
    }

    async function moveFileEntry(item) {
      const entry = item?.entry;
      if (!entry) return;
      openEntryMoveDialog(entry);
    }

    function copyFileEntry(item) {
      const entry = item?.entry;
      if (!entry) return;
      openEntryCopyDialog(entry);
    }

    async function deleteFileEntry(item) {
      const entry = item?.entry;
      if (!entry) return;
      const label = entry.basename || pathBasename(entry.path);
      const confirmed = window.confirm(`直接删除 ${label}？这个操作不可撤销。`);
      if (!confirmed) return;
      setLoading(true);
      setError("");
      try {
        if (isDirectoryEntry(entry)) {
          await callGQL(FOLDER_DELETE_MUTATION, { path: entry.path });
          if (currentFolder?.path === entry.path) {
            const parentPath = entry.parent_path || folderParentPath(currentFolder);
            if (parentPath) {
              selectFolderByPath(parentPath, {
                path: parentPath,
                basename: pathBasename(parentPath),
                type: "DIRECTORY",
                media_type: "DIRECTORY",
              });
            } else {
              openRoot();
            }
          }
          refreshFoldersAndContent();
        } else {
          await callGQL(FILE_DELETE_MUTATION, { path: entry.path });
          refreshContent();
        }
      } catch (e) {
        setError(friendlyFileApiError(e));
      } finally {
        setLoading(false);
      }
    }

    function openFolderProperties(folder = currentFolder) {
      const entry = folderActionEntry(folder);
      if (!entry) return;
      setPropertiesTarget({ kind: "folder", entry, title: entry.basename || pathBasename(entry.path) });
    }

    function openFileEntryProperties(item) {
      const entry = item?.entry;
      if (!entry) return;
      setPropertiesTarget({
        kind: isDirectoryEntry(entry) ? "folder" : "file",
        item,
        entry,
        title: entry.basename || pathBasename(entry.path),
      });
    }

    function openFileEntryContextMenu(event, item) {
      event.preventDefault();
      event.stopPropagation();
      const entry = item?.entry;
      const isDirectory = isDirectoryEntry(entry);
      const canOpen = isDirectory || canPreviewEntry(entry) || item?.scene || item?.imageItem;
      setContextMenu({
        kind: "entry",
        item,
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 230),
        actions: [
          { label: "打开", disabled: !canOpen, onClick: () => openFileEntry(item) },
          { label: "属性", onClick: () => openFileEntryProperties(item) },
          ...(!isDirectory ? [{ label: "下载", onClick: () => downloadFileEntry(entry) }] : []),
          ...(isDirectory ? [{ label: "新建文件夹", onClick: () => createFolderAt(entry.path) }] : []),
          ...(isDirectory ? [{ label: "上传文件", onClick: () => uploadFilesHere(entry.path) }] : []),
          ...(isDirectory ? [{ label: "上传文件夹", onClick: () => uploadFolderHere(entry.path) }] : []),
          { label: "移动", onClick: () => moveFileEntry(item) },
          { label: "复制到", onClick: () => copyFileEntry(item) },
          { label: "重命名", onClick: () => renameFileEntry(item) },
          { label: "删除", danger: true, onClick: () => deleteFileEntry(item) },
        ],
      });
    }

    function openCurrentFolderContextMenu(event) {
      if (activeView !== "other" || !currentFolder?.path) return;
      if (event.target.closest?.(".folder-browser-file-entry-row, .folder-browser-context-menu")) return;
      event.preventDefault();
      event.stopPropagation();
      setContextMenu({
        kind: "current-folder",
        item: { entry: folderActionEntry(currentFolder) },
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 180),
        actions: [
          { label: "属性", onClick: () => openFolderProperties(currentFolder) },
          { label: "新建文件夹", onClick: () => createFolderAt(currentFolder.path) },
          { label: "上传文件", onClick: () => uploadFilesHere(currentFolder.path) },
          { label: "上传文件夹", onClick: () => uploadFolderHere(currentFolder.path) },
        ],
      });
    }

    function openFolderTreeContextMenu(event, folder) {
      event.preventDefault();
      event.stopPropagation();
      const entry = folderActionEntry(folder);
      const canMutate = canMutateFolder(folder);
      setContextMenu({
        kind: "tree-folder",
        item: { entry },
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 230),
        actions: [
          { label: "打开", onClick: () => onSelectFolder(folder) },
          { label: "属性", disabled: !entry, onClick: () => openFolderProperties(folder) },
          { label: "新建文件夹", disabled: !folder?.path, onClick: () => createFolderAt(folder.path) },
          { label: "上传文件", disabled: !folder?.path, onClick: () => uploadFilesHere(folder.path) },
          { label: "上传文件夹", disabled: !folder?.path, onClick: () => uploadFolderHere(folder.path) },
          { label: "移动", disabled: !canMutate, onClick: () => moveFileEntry({ entry }) },
          { label: "复制到", disabled: !canMutate, onClick: () => copyFileEntry({ entry }) },
          { label: "重命名", disabled: !canMutate, onClick: () => renameFileEntry({ entry }) },
          { label: "删除", danger: true, disabled: !canMutate, onClick: () => deleteFileEntry({ entry }) },
        ],
      });
    }

    function downloadSelectedImages() {
      selectedImages.forEach((item) => {
        downloadImageItem(item);
      });
    }

    function downloadSceneItem(scene) {
      const url = scene?.paths?.stream || (scene?.id ? `${baseURL.replace(/\/$/, "")}/scene/${scene.id}/stream` : "");
      if (!url) return;
      const file = primarySceneFile(scene);
      const link = document.createElement("a");
      link.href = url;
      link.download = file?.basename || scene.title || "video";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function downloadImageItem(item) {
      const url = item?.original || item?.full;
      if (!url) return;
      const link = document.createElement("a");
      link.href = url;
      link.download = item.basename || item.title || "image";
      link.target = "_blank";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function downloadFileEntry(itemOrEntry) {
      const entry = itemOrEntry?.entry || itemOrEntry;
      if (!entry?.path) return;
      const link = document.createElement("a");
      link.href = folderBrowserFileURL(entry.path, { download: true });
      link.download = entry.basename || pathBasename(entry.path) || "file";
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function clearSelection() {
      setSelectedSceneIDs([]);
      setSelectedImageIDs([]);
    }

    function openMediaContextMenu(event, kind, item) {
      event.preventDefault();
      event.stopPropagation();
      if (kind === "video") {
        setSelectedSceneIDs([item.id]);
        setSelectedImageIDs([]);
      } else {
        setSelectedImageIDs([item.imageID]);
        setSelectedSceneIDs([]);
      }
      setContextMenu({
        kind,
        item,
        x: Math.min(event.clientX, window.innerWidth - 190),
        y: Math.min(event.clientY, window.innerHeight - 190),
      });
    }

    function contextFileInfo() {
      if (!contextMenu?.item) return {};
      if (contextMenu.kind === "video") {
        const file = primarySceneFile(contextMenu.item);
        return {
          fileID: file?.id,
          path: file?.path,
          parentFolderID: file?.parent_folder?.id,
          basename: file?.basename,
          title: contextMenu.item.title,
        };
      }
      return {
        fileID: contextMenu.item.fileID,
        path: contextMenu.item.path,
        parentFolderID: contextMenu.item.parentFolderID,
        basename: contextMenu.item.basename,
        title: contextMenu.item.title,
      };
    }

    function downloadContextMedia() {
      if (!contextMenu?.item) return;
      if (contextMenu.kind === "video") {
        downloadSceneItem(contextMenu.item);
      } else {
        downloadImageItem(contextMenu.item);
      }
    }

    function openContextMedia() {
      if (!contextMenu?.item) return;
      if (contextMenu.kind === "video") {
        persistFolderState({ activeView: "video", lastOpenedSceneID: contextMenu.item.id });
        window.location.assign(`${baseURL.replace(/\/$/, "")}/scenes/${contextMenu.item.id}?${SCENE_RETURN_PARAM}=1`);
        return;
      }
      if (contextMenu.kind === "image") {
        const index = lightboxImages.findIndex((image) => image.imageID === contextMenu.item.imageID);
        if (index >= 0) openImagePreview(index);
      }
    }

    function openContextProperties() {
      if (!contextMenu?.item) return;
      if (contextMenu.kind === "video" || contextMenu.kind === "image") {
        setPropertiesTarget({
          kind: contextMenu.kind,
          item: contextMenu.item,
          title: contextMenu.item.title,
        });
      }
    }

    function moveContextMedia() {
      const file = contextFileInfo();
      if (!file.fileID) return;
      openMoveDialog(`移动 ${file.basename || file.title || "文件"}`, [file.fileID], () => {
        if (contextMenu?.kind === "video") setSelectedSceneIDs((current) => current.filter((id) => id !== contextMenu.item.id));
        if (contextMenu?.kind === "image") setSelectedImageIDs((current) => current.filter((id) => id !== contextMenu.item.imageID));
      });
    }

    function copyContextMedia() {
      const file = contextFileInfo();
      if (!file.path) {
        setError("找不到文件路径，无法复制。");
        return;
      }
      openPathCopyDialog(`复制 ${file.basename || file.title || "文件"}`, [{
        path: file.path,
        basename: file.basename || file.title || pathBasename(file.path),
        type: "FILE",
        media_type: contextMenu?.kind === "video" ? "VIDEO" : "IMAGE",
      }]);
    }

    async function renameContextMedia() {
      const file = contextFileInfo();
      if (!file.fileID || !file.parentFolderID || !file.basename) return;
      const basename = window.prompt("新的文件名（需要保留扩展名）", file.basename);
      if (!basename || basename === file.basename) return;
      setLoadingScenes(true);
      setLoadingImages(true);
      setError("");
      try {
        await callGQL(MOVE_FILES_MUTATION, {
          input: {
            ids: [file.fileID],
            destination_folder_id: file.parentFolderID,
            destination_basename: basename,
          },
        });
        clearSelection();
        refreshContent();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingScenes(false);
        setLoadingImages(false);
      }
    }

    async function deleteContextMedia() {
      if (!contextMenu?.item) return;
      const name = contextFileInfo().basename || contextFileInfo().title || "文件";
      const confirmed = window.confirm(`删除 ${name} 及其文件？这个操作会修改 NAS 上的实际文件。`);
      if (!confirmed) return;
      setLoadingScenes(true);
      setLoadingImages(true);
      setError("");
      try {
        if (contextMenu.kind === "video") {
          await callGQL(SCENES_DESTROY_MUTATION, {
            input: {
              ids: [contextMenu.item.id],
              delete_file: true,
              delete_generated: true,
              destroy_file_entry: true,
            },
          });
        } else {
          await callGQL(IMAGES_DESTROY_MUTATION, {
            input: {
              ids: [contextMenu.item.imageID],
              delete_file: true,
              delete_generated: true,
              destroy_file_entry: true,
            },
          });
        }
        clearSelection();
        refreshContent();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingScenes(false);
        setLoadingImages(false);
      }
    }

    async function deleteSelectedMedia() {
      if (!selectedMediaCount) return;
      const confirmed = window.confirm(`删除 ${selectedMediaCount} 个已选项目及其文件？这个操作会修改 NAS 上的实际文件。`);
      if (!confirmed) return;
      setLoadingScenes(true);
      setLoadingImages(true);
      setError("");
      try {
        await Promise.all([
          selectedScenes.length
            ? callGQL(SCENES_DESTROY_MUTATION, {
                input: {
                  ids: selectedScenes.map((item) => item.id),
                  delete_file: true,
                  delete_generated: true,
                  destroy_file_entry: true,
                },
              })
            : Promise.resolve(),
          selectedImages.length
            ? callGQL(IMAGES_DESTROY_MUTATION, {
                input: {
                  ids: selectedImages.map((item) => item.imageID),
                  delete_file: true,
                  delete_generated: true,
                  destroy_file_entry: true,
                },
              })
            : Promise.resolve(),
        ]);
        clearSelection();
        refreshContent();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingScenes(false);
        setLoadingImages(false);
      }
    }

    async function deleteImageItem(item) {
      if (!item) return;
      if (!item.path) {
        setError("找不到图片文件路径，无法删除。");
        return;
      }
      const confirmed = window.confirm(`直接删除 ${item.basename || item.title}？这个操作不可撤销。`);
      if (!confirmed) return;
      setLoadingImages(true);
      setError("");
      try {
        await callGQL(FILE_DELETE_MUTATION, { path: item.path });
        setSelectedImageIDs((current) => current.filter((id) => id !== item.imageID));
        if (lightboxImages.length <= 1) setLightboxIndex(null);
        refreshContent();
      } catch (e) {
        setError(friendlyFileApiError(e));
      } finally {
        setLoadingImages(false);
      }
    }

    function moveImageItem(item) {
      if (!item?.fileID) {
        setError("找不到图片文件 ID，无法移动。");
        return;
      }
      openMoveDialog(`移动 ${item.basename || item.title || "图片"}`, [item.fileID], () => {
        setSelectedImageIDs((current) => current.filter((id) => id !== item.imageID));
        setLightboxIndex(null);
      });
    }

    function copyImageItem(item) {
      if (!item?.path) {
        setError("找不到图片文件路径，无法复制。");
        return;
      }
      openPathCopyDialog(`复制 ${item.basename || item.title || "图片"}`, [{
        path: item.path,
        basename: item.basename || item.title || pathBasename(item.path),
        type: "FILE",
        media_type: "IMAGE",
      }]);
    }

    function initialMoveTargetIDForEntry(entry) {
      const sourcePath = normalizePathKey(entry?.path);
      const parentPath = normalizePathKey(entry?.parent_path) || parentPathForPath(sourcePath);
      const preferredPath = entry?.type === "DIRECTORY" || entry?.media_type === "DIRECTORY"
        ? parentPath
        : normalizePathKey(currentFolder?.path) || parentPath;
      const currentTreeNode = currentFolder?.id ? findTreeNode(folderTree, currentFolder.id) : null;
      return (
        findTreeNodeByPath(folderTree, preferredPath)?.id ||
        findTreeNodeByPath(folderTree, parentPath)?.id ||
        currentTreeNode?.id ||
        folderTree[0]?.id ||
        null
      );
    }

    function openEntryMoveDialog(entry) {
      if (!entry?.path || !folderTree.length) return;
      setMoveTargetFolderID(initialMoveTargetIDForEntry(entry));
      setMoveDialog({
        mode: "move",
        title: `移动 ${entry.basename || pathBasename(entry.path) || "文件"}`,
        entry,
      });
    }

    function openEntryCopyDialog(entry) {
      if (!entry?.path || !folderTree.length) return;
      setMoveTargetFolderID(initialMoveTargetIDForEntry(entry));
      setMoveDialog({
        mode: "copy",
        title: `复制 ${entry.basename || pathBasename(entry.path) || "文件"}`,
        entry,
        confirmLabel: "复制到这里",
      });
    }

    function openMoveDialog(title, fileIDs, onDone) {
      if (!fileIDs.length || !currentFolder) return;
      setMoveTargetFolderID(currentFolder.id);
      setMoveDialog({ mode: "move", title, fileIDs, onDone });
    }

    function openPathCopyDialog(title, entries, onDone) {
      const copyEntries = (entries || []).filter((entry) => entry?.path);
      if (!copyEntries.length || !folderTree.length) {
        setError("找不到文件路径，无法复制。");
        return;
      }
      const firstEntryTarget = initialMoveTargetIDForEntry(copyEntries[0]);
      const currentTreeNode = currentFolder?.id ? findTreeNode(folderTree, currentFolder.id) : null;
      setMoveTargetFolderID(currentTreeNode?.id || firstEntryTarget || folderTree[0]?.id || null);
      setMoveDialog({
        mode: "copy",
        title,
        copyEntries,
        onDone,
        confirmLabel: "复制到这里",
      });
    }

    function moveSelectedMedia() {
      openMoveDialog(`移动 ${selectedFileIDs.length} 个文件`, selectedFileIDs, clearSelection);
    }

    function copySelectedMedia() {
      openPathCopyDialog(`复制 ${selectedCopyEntries.length} 个文件`, selectedCopyEntries);
    }

    async function confirmEntryMoveDialog() {
      const entry = moveDialog?.entry;
      const destinationFolder = findTreeNode(folderTree, moveTargetFolderID);
      if (!entry?.path || !destinationFolder?.path) return;
      const isDirectory = isDirectoryEntry(entry);
      setLoading(true);
      setError("");
      try {
        if (isDirectory) {
          await callGQL(FOLDER_MOVE_MUTATION, {
            path: entry.path,
            destination: destinationFolder.path,
            basename: null,
          });
          if (currentFolder?.path === entry.path) {
            selectFolderByPath(joinFolderPath(destinationFolder.path, entry.basename || pathBasename(entry.path)));
          }
          refreshFoldersAndContent();
        } else {
          await callGQL(FILE_MOVE_MUTATION, {
            path: entry.path,
            destination: destinationFolder.path,
            basename: null,
          });
          refreshContent();
        }
        moveDialog.onDone?.();
        setMoveDialog(null);
        setMoveTargetFolderID(null);
      } catch (e) {
        setError(friendlyFileApiError(e));
      } finally {
        setLoading(false);
      }
    }

    async function confirmCopyDialog() {
      const destinationFolder = findTreeNode(folderTree, moveTargetFolderID);
      const entries = moveDialog?.copyEntries || (moveDialog?.entry ? [moveDialog.entry] : []);
      if (!entries.length || !destinationFolder?.path) return;
      setLoading(true);
      setError("");
      try {
        const startedJobs = await Promise.all(entries.map(async (entry) => {
          const isDirectory = isDirectoryEntry(entry);
          const data = await callGQL(isDirectory ? FOLDER_COPY_MUTATION : FILE_COPY_MUTATION, {
            path: entry.path,
            destination: destinationFolder.path,
            basename: null,
          });
          const jobID = isDirectory ? data?.folderCopy : data?.fileCopy;
          return {
            id: jobID ? String(jobID) : "",
            title: `复制 ${entry.basename || pathBasename(entry.path) || "文件"}`,
          };
        }));
        trackCopyJobs(startedJobs);
        moveDialog.onDone?.();
        setMoveDialog(null);
        setMoveTargetFolderID(null);
      } catch (e) {
        setError(friendlyFileApiError(e));
      } finally {
        setLoading(false);
      }
    }

    async function confirmMoveDialog() {
      if (moveDialog?.mode === "copy") {
        await confirmCopyDialog();
        return;
      }
      if (moveDialog?.entry) {
        await confirmEntryMoveDialog();
        return;
      }
      if (!moveDialog?.fileIDs?.length || !moveTargetFolderID) return;
      setLoadingScenes(true);
      setLoadingImages(true);
      setError("");
      try {
        await callGQL(MOVE_FILES_MUTATION, {
          input: {
            ids: moveDialog.fileIDs,
            destination_folder_id: moveTargetFolderID,
          },
        });
        moveDialog.onDone?.();
        setMoveDialog(null);
        setMoveTargetFolderID(null);
        refreshContent();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingScenes(false);
        setLoadingImages(false);
      }
    }

    async function renameSelectedMedia() {
      if (selectedMediaCount !== 1) return;
      const selectedScene = selectedScenes[0];
      const selectedImage = selectedImages[0];
      const file = selectedScene ? primarySceneFile(selectedScene) : null;
      const fileID = file?.id || selectedImage?.fileID;
      const parentFolderID = file?.parent_folder?.id || selectedImage?.parentFolderID;
      const currentBasename = file?.basename || selectedImage?.basename;
      if (!fileID || !parentFolderID || !currentBasename) return;
      const basename = window.prompt("新的文件名（需要保留扩展名）", currentBasename);
      if (!basename || basename === currentBasename) return;
      setLoadingScenes(true);
      setLoadingImages(true);
      setError("");
      try {
        await callGQL(MOVE_FILES_MUTATION, {
          input: {
            ids: [fileID],
            destination_folder_id: parentFolderID,
            destination_basename: basename,
          },
        });
        clearSelection();
        refreshContent();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingScenes(false);
        setLoadingImages(false);
      }
    }

    async function renameCurrentFolder() {
      const entry = folderActionEntry(currentFolder);
      if (!entry || !canMutateFolder(currentFolder)) return;
      await renameFileEntry({ entry });
    }

    async function moveCurrentFolder() {
      const entry = folderActionEntry(currentFolder);
      if (!entry || !canMutateFolder(currentFolder)) return;
      await moveFileEntry({ entry });
    }

    async function copyCurrentFolder() {
      const entry = folderActionEntry(currentFolder);
      if (!entry || !canMutateFolder(currentFolder)) return;
      copyFileEntry({ entry });
    }

    async function deleteCurrentFolder() {
      const entry = folderActionEntry(currentFolder);
      if (!entry || !canMutateFolder(currentFolder)) return;
      await deleteFileEntry({ entry });
    }

    function renameToolbarTarget() {
      if (selectedMediaCount) {
        renameSelectedMedia();
        return;
      }
      renameCurrentFolder();
    }

    function moveToolbarTarget() {
      if (selectedMediaCount) {
        moveSelectedMedia();
        return;
      }
      moveCurrentFolder();
    }

    function copyToolbarTarget() {
      if (selectedMediaCount) {
        copySelectedMedia();
        return;
      }
      copyCurrentFolder();
    }

    function deleteToolbarTarget() {
      if (selectedMediaCount) {
        deleteSelectedMedia();
        return;
      }
      deleteCurrentFolder();
    }

    function renderSidebar(className, includeResizer, treeRef = null) {
      return React.createElement(
        "aside",
        { className },
        React.createElement(FileActionToolbar, {
          currentFolder,
          canActOnCurrentFolder: canMutateFolder(currentFolder),
          selectedCount: selectedMediaCount,
          selectedImageCount: selectedImages.length,
          selectedSceneCount: selectedScenes.length,
          onDownload: downloadSelectedImages,
          onRename: renameToolbarTarget,
          onMove: moveToolbarTarget,
          onCopy: copyToolbarTarget,
          onDelete: deleteToolbarTarget,
          onClear: clearSelection,
          onCreateFolder: currentFolder ? () => createFolderAt(currentFolder.path) : undefined,
          onUploadFiles: currentFolder ? () => uploadFilesHere(currentFolder.path) : undefined,
          onUploadFolder: currentFolder ? () => uploadFolderHere(currentFolder.path) : undefined,
        }),
        React.createElement(
          "div",
          { className: "folder-browser-tree", ref: treeRef },
            folderTree.map((folder) =>
              React.createElement(FolderTreeNode, {
                key: folder.id,
                folder,
                depth: 0,
                currentID: currentFolder?.id,
                onSelect: onActivateTreeFolder,
                onToggle: onToggleTreeFolder,
                onContextMenu: openFolderTreeContextMenu,
              })
            )
        ),
        includeResizer
          ? React.createElement("div", {
              className: "folder-browser-sidebar-resizer",
              role: "separator",
              title: "拖动调整目录宽度",
              onPointerDown: startSidebarResize,
              onDoubleClick: () => setSidebarWidth(DEFAULT_SIDEBAR_WIDTH),
            })
          : null
      );
    }

    const showVideoSection = activeView === "video";
    const showImageSection = activeView === "image";
    const showOtherSection = activeView === "other";
    const activeMediaCount = activeView === "video"
      ? `${visibleVideos.length}/${sceneTotal}`
      : activeView === "image"
        ? `${visibleImages.length}/${imageTotal}`
        : `${otherEntryItems.length}`;
    const activeViewEmpty =
      !loading &&
      !loadingEntries &&
      currentFolder &&
      ((activeView === "video" && visibleVideos.length === 0) ||
        (activeView === "image" && visibleImages.length === 0) ||
        (activeView === "other" && otherEntryItems.length === 0));

    function renderVideoSection() {
      if (!showVideoSection) return null;
      return React.createElement(
        "section",
        { className: "folder-browser-section", key: "videos" },
        React.createElement(MediaViewHeader, {
          title: "视频",
          count: `${visibleVideos.length}/${sceneTotal}`,
          checked: allWallVideosSelected,
          indeterminate: someWallVideosSelected && !allWallVideosSelected,
          onSelectAllChange: toggleAllScenes,
        }),
        React.createElement(SceneWall, {
          scenes: renderVideoWindow.items,
          wallHeight: videoSizePreset.wallHeight,
          mobileColumns: isMobileLayout ? videoSizePreset.columns : undefined,
          fillTail: scenes.length >= sceneTotal,
          selectedIDs: selectedSceneIDs,
          touchPreviewSceneID,
          previewSceneIDs: previewVisibleSceneIDs,
          topSpacer: renderVideoWindow.topSpacer,
          bottomSpacer: renderVideoWindow.bottomSpacer,
          innerRef: sceneWallRef,
          onBeforeOpen: (scene) => persistFolderState({ activeView: "video", lastOpenedSceneID: scene.id }),
          onSelectionChange: toggleSceneSelection,
          onContextMenu: (event, scene) => openMediaContextMenu(event, "video", scene),
          onTouchPreview: setTouchPreviewSceneID,
        }),
        React.createElement(AutoLoadMore, {
          innerRef: sceneLoadMoreRef,
          disabled: false,
          loading: loadingScenes,
          remaining: Math.max(0, sceneTotal - scenes.length),
          onLoad: loadMoreScenes,
        })
      );
    }

    function renderImageSection() {
      if (!showImageSection) return null;
      return React.createElement(
        "section",
        { className: "folder-browser-section", key: "images" },
        React.createElement(MediaViewHeader, {
          title: "图片",
          count: `${visibleImages.length}/${imageTotal}`,
          checked: allWallImagesSelected,
          indeterminate: someWallImagesSelected && !allWallImagesSelected,
          onSelectAllChange: toggleAllImages,
        }),
        React.createElement(ImageWall, {
          items: renderImageWindow.items,
          wallHeight: imageSizePreset.wallHeight,
          mobileColumns: isMobileLayout ? imageSizePreset.columns : undefined,
          fillTail: images.length >= imageTotal,
          selectedIDs: selectedImageIDs,
          topSpacer: renderImageWindow.topSpacer,
          bottomSpacer: renderImageWindow.bottomSpacer,
          innerRef: imageWallRef,
          onOpen: openImageItem,
          onSelectionChange: toggleImageSelection,
          onContextMenu: (event, item) => openMediaContextMenu(event, "image", item),
        }),
        React.createElement(AutoLoadMore, {
          innerRef: imageLoadMoreRef,
          disabled: false,
          loading: loadingImages,
          remaining: Math.max(0, imageTotal - images.length),
          onLoad: loadMoreImages,
        })
      );
    }

    function renderOtherSection() {
      if (!showOtherSection) return null;
      const activePath = contextMenu?.kind === "entry" ? contextMenu.item?.entry?.path : "";
      return React.createElement(
        "section",
        { className: "folder-browser-section", key: "other" },
        React.createElement(MediaViewHeader, {
          title: "其他",
          count: `${otherEntryItems.length}`,
        }),
        React.createElement(OtherEntryList, {
          items: otherEntryItems,
          activePath,
          onOpen: openFileEntry,
          onContextMenu: openFileEntryContextMenu,
        })
      );
    }

    return React.createElement(
      "div",
      {
        className: "folder-browser-page" + (sidebarCollapsed ? " sidebar-collapsed" : "") + (isMobileLayout ? " folder-browser-mobile" : ""),
        style: {
          "--folder-browser-sidebar-width": `${sidebarWidth}px`,
        },
      },
      loading ? React.createElement("div", { className: "folder-browser-loading" }, "Loading...") : null,
      error ? React.createElement("div", { className: "folder-browser-error" }, error) : null,
      React.createElement(UploadStatus, { status: uploadStatus, onClear: () => setUploadStatus(null) }),
      !isMobileLayout
        ? React.createElement(
            Button,
            {
              className: "folder-browser-sidebar-collapse",
              size: "sm",
              variant: "secondary",
              onClick: () => setSidebarCollapsed(!sidebarCollapsed),
              title: sidebarCollapsed ? "展开目录树" : "收起目录树",
            },
            sidebarCollapsed ? "›" : "‹"
          )
        : null,
      isMobileLayout && mobileFoldersOpen
        ? React.createElement(
            React.Fragment,
            null,
            React.createElement("div", { className: "folder-browser-mobile-drawer-backdrop", onClick: () => setMobileFoldersOpen(false) }),
            renderSidebar("folder-browser-sidebar folder-browser-mobile-drawer", false, mobileFolderTreeRef)
          )
        : null,
      React.createElement(
        "div",
        { className: "folder-browser-shell" },
        !isMobileLayout && !sidebarCollapsed ? renderSidebar("folder-browser-sidebar", true) : null,
        React.createElement(
          "main",
          { className: "folder-browser-content", ref: contentRef },
          React.createElement(
            "div",
            { className: "folder-browser-sticky-controls", ref: stickyRef },
            isMobileLayout
              ? React.createElement(MobileToolbar, {
                  currentFolder,
                  activeView,
                  mediaCount: activeMediaCount,
                  sortState,
                  includeChildren,
                  previewAllVisible,
                  sizeIndex: activeSizeIndex,
                  copyJobs,
                  canActOnCurrentFolder: canMutateFolder(currentFolder),
                  onClearCopyJobs: clearCopyJobs,
                  controlsOpen: mobileControlsOpen,
                  onControlsToggle: () => setMobileControlsOpen((current) => !current),
                  onOpenFolders: () => setMobileFoldersOpen(true),
                  onCreateFolder: currentFolder ? () => createFolderAt(currentFolder.path) : undefined,
                  onUploadFiles: currentFolder ? () => uploadFilesHere(currentFolder.path) : undefined,
                  onUploadFolder: currentFolder ? () => uploadFolderHere(currentFolder.path) : undefined,
                  onRenameFolder: renameCurrentFolder,
                  onMoveFolder: moveCurrentFolder,
                  onCopyFolder: copyCurrentFolder,
                  onDeleteFolder: deleteCurrentFolder,
                  onActiveViewChange: setActiveView,
                  onSortChange,
                  onSizeChange: onActiveSizeChange,
                  onIncludeChildrenChange: setIncludeChildren,
                  onPreviewAllVisibleChange: setPreviewAllVisible,
                })
              : React.createElement(Breadcrumbs, {
                  currentFolder,
                  includeChildren,
                  activeView,
                  sortState,
                  sizeIndex: activeSizeIndex,
                  sizeMax: activeSizeMax,
                  previewAllVisible,
                  mediaCount: activeMediaCount,
                  allSelected: activeView === "video" ? allWallVideosSelected : activeView === "image" ? allWallImagesSelected : false,
                  someSelected: activeView === "video" ? someWallVideosSelected : activeView === "image" ? someWallImagesSelected : false,
                  copyJobs,
                  onClearCopyJobs: clearCopyJobs,
                  onSelectAllChange: activeView === "video" ? toggleAllScenes : activeView === "image" ? toggleAllImages : undefined,
                  onIncludeChildrenChange: setIncludeChildren,
                  onActiveViewChange: setActiveView,
                  onSortChange,
                  onSizeChange: onActiveSizeChange,
                  onPreviewAllVisibleChange: setPreviewAllVisible,
                  onOpen: onSelectFolder,
                })
          ),
          React.createElement(
            "div",
            {
              className: "folder-browser-scroll-area",
              ref: scrollAreaRef,
              onClick: (event) => {
                if (!event.target.closest?.(".folder-browser-wall-tile")) setTouchPreviewSceneID(null);
              },
              onContextMenu: openCurrentFolderContextMenu,
              onScroll: () => {
                handleScrollAreaScroll();
                setContextMenu(null);
                setMobileControlsOpen(false);
                setTouchPreviewSceneID(null);
              },
            },
            React.createElement(
              "div",
              { className: "folder-browser-sections" },
              renderVideoSection(),
              renderImageSection(),
              renderOtherSection()
            ),
            activeViewEmpty
              ? React.createElement(
                  "div",
                  { className: "folder-browser-empty" },
                  activeView === "video"
                    ? "This folder has no scanned scenes."
                    : activeView === "image"
                      ? "This folder has no scanned images."
                      : activeView === "other"
                        ? "当前文件夹没有其他文件。"
                        : "当前文件夹没有可显示条目。"
                )
              : null
          ),
          React.createElement(ImageLightbox, {
            items: lightboxImages,
            index: lightboxIndex,
            playing: slideshow,
            isMobileLayout,
            onClose: () => {
              closeImagePreview();
              setSlideshow(false);
            },
            onNavigate: moveLightbox,
            onPlayingChange: setSlideshow,
            onDownload: downloadImageItem,
            onDelete: deleteImageItem,
            onMoveFile: moveImageItem,
            onCopyFile: copyImageItem,
          }),
          React.createElement(FilePreview, {
            preview: filePreview,
            onClose: () => setFilePreview(null),
            onDownload: downloadFileEntry,
          }),
          React.createElement(PropertiesDialog, {
            target: propertiesTarget,
            onClose: () => setPropertiesTarget(null),
          }),
          React.createElement(MoveTargetDialog, {
            open: Boolean(moveDialog),
            title: moveDialog?.title || "选择目标文件夹",
            confirmLabel: moveDialog?.confirmLabel,
            folderTree,
            selectedFolderID: moveTargetFolderID,
            currentFolderID: currentFolder?.id,
            onSelect: (folder) => setMoveTargetFolderID(folder.id),
            onToggle: onToggleFolder,
              onCancel: () => {
                setMoveDialog(null);
                setMoveTargetFolderID(null);
              },
              onConfirm: confirmMoveDialog,
            }),
            isMobileLayout
              ? React.createElement(MobileSelectionBar, {
                  selectedCount: selectedMediaCount,
                  selectedImageCount: selectedImages.length,
                  onDownload: downloadSelectedImages,
                  onMove: moveSelectedMedia,
                  onCopy: copySelectedMedia,
                  onRename: renameSelectedMedia,
                  onDelete: deleteSelectedMedia,
                  onClear: clearSelection,
                })
              : null
          )
        ),
        React.createElement(ContextMenu, {
          menu: contextMenu,
          onOpen: openContextMedia,
          onDownload: downloadContextMedia,
          onRename: renameContextMedia,
          onMove: moveContextMedia,
          onCopy: copyContextMedia,
          onDelete: deleteContextMedia,
          onProperties: openContextProperties,
          onClose: () => setContextMenu(null),
        })
      );
  }

  api.register.route(ROUTE, FolderBrowserPage);

  setupFolderBrowserRouteClass();
  setupFolderBrowserHomeRedirect();
  setupPlayerReturnButton();
  setupMobilePlayerLayer();
  setupMobileFullscreenOrientation();

  api.patch.before("MainNavBar.MenuItems", function (props) {
    const children = React.Children.toArray(props.children);
    if (children.some((child) => child?.props?.eventKey === ROUTE)) {
      return [props];
    }

    const node = React.createElement(
      "div",
      {
        key: "folder-browser-nav-link",
        className: "col-4 col-sm-3 col-md-2 col-lg-auto",
      },
      React.createElement(
        NavLink,
        {
          exact: true,
          to: ROUTE,
          activeClassName: "active",
          className:
            "btn minimal p-4 p-xl-2 d-flex d-xl-inline-block flex-column justify-content-between align-items-center",
        },
        FontAwesomeIcon
          ? React.createElement(FontAwesomeIcon, {
              icon: faFolderOpen || faFolder,
              className: "fa-icon nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0",
            })
          : null,
        React.createElement("span", null, "Folders")
      )
    );

    return [
      {
        children: React.createElement(React.Fragment, null, props.children, node),
      },
    ];
  });

  api.patch.before("MainNavBar.UtilityItems", function (props) {
    const children = React.Children.toArray(props.children);
    if (children.some((child) => child?.key === "folder-browser-nav-refresh")) {
      return [props];
    }

    return [
      {
        children: React.createElement(
          React.Fragment,
          null,
          React.createElement(NavRefreshButton, { key: "folder-browser-nav-refresh" }),
          React.createElement(NavPluginUpdateButton, { key: "folder-browser-nav-plugin-update" }),
          props.children
        ),
      },
    ];
  });

})();
