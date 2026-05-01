(function () {
  const api = window.PluginApi;
  if (!api) return;

  const React = api.React;
  const { Button, Form } = api.libraries.Bootstrap;
  const { Link, NavLink } = api.libraries.ReactRouterDOM;
  const { FontAwesomeIcon } = api.libraries.ReactFontAwesome;
  const { faFolder, faFolderOpen, faSyncAlt, faRedoAlt } = api.libraries.FontAwesomeSolid;

  const ROUTE = "/folders";
  const PLUGIN_PACKAGE_ID = "folderBrowser";
  const STATE_KEY = "folderBrowser.state.v1";
  const SCENE_RETURN_PARAM = "folderBrowserReturn";
  const SCENE_PAGE_ROWS = 4;
  const IMAGE_PAGE_ROWS = 5;
  const WALL_GAP = 4;
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
  const SORT_OPTIONS = [
    { key: "file_mod_time", label: "修改时间" },
    { key: "created_at", label: "入库时间" },
    { key: "filesize", label: "文件大小" },
  ];
  const baseURL = document.querySelector("base")?.getAttribute("href") ?? "/";
  const touchPreviewEnabled =
    window.matchMedia?.("(hover: none), (pointer: coarse)")?.matches ||
    navigator.maxTouchPoints > 0;

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
            width
            height
            size
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

  function findFilter(sort, direction, perPage, page) {
    return {
      sort,
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

  function imageItems(images) {
    return (images ?? []).map((image) => {
      const file = primaryImageFile(image);
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
        full: image.paths?.image || image.paths?.preview || image.paths?.thumbnail,
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

  function FolderTreeNode({ folder, depth, currentID, onSelect, onToggle }) {
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
            })
          )
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
          variant: isCurrent ? "primary" : "link",
          disabled: isCurrent,
          onClick: isCurrent ? undefined : () => onOpen(folder),
          title: folder.path,
          className: "folder-browser-path-crumb",
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
        React.createElement(
          "label",
          { className: "folder-browser-media-summary" },
          React.createElement("input", {
            type: "checkbox",
            checked: allSelected,
            ref: (input) => {
              if (input) input.indeterminate = Boolean(someSelected && !allSelected);
            },
            onChange: (event) => onSelectAllChange?.(event.target.checked),
          }),
          React.createElement("span", null, `全选 ${mediaCount}`)
        ),
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
        React.createElement(
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
        ),
        React.createElement(
          Button,
          {
            size: "sm",
            variant: includeChildren ? "primary" : "secondary",
            onClick: () => onIncludeChildrenChange(!includeChildren),
          },
          "包括子文件夹"
        ),
        activeView === "video"
          ? React.createElement(
              Button,
              {
                size: "sm",
                variant: previewAllVisible ? "primary" : "secondary",
                onClick: () => onPreviewAllVisibleChange(!previewAllVisible),
              },
              "自动播放可见预览"
            )
          : null,
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
    onOpenFolders,
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
        React.createElement(Button, { size: "sm", variant: controlsOpen ? "primary" : "secondary", onClick: onControlsToggle }, "排序")
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
          )
        ),
        React.createElement("span", { className: "folder-browser-mobile-divider" }),
        React.createElement(
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
        ),
        React.createElement("span", { className: "folder-browser-mobile-divider" }),
        React.createElement(
          "div",
          { className: "folder-browser-mobile-quick-actions folder-browser-mobile-control-cluster" },
          React.createElement(
            Button,
            { size: "sm", variant: includeChildren ? "primary" : "secondary", onClick: () => onIncludeChildrenChange(!includeChildren) },
            "子文件夹"
          ),
          activeView === "video"
            ? React.createElement(
                Button,
                { size: "sm", variant: previewAllVisible ? "primary" : "secondary", onClick: () => onPreviewAllVisibleChange(!previewAllVisible) },
                "自动预览"
              )
            : null
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
              )
            )
          )
        : null
    );
  }

  function MobileSelectionBar({ selectedCount, selectedImageCount, onDownload, onMove, onRename, onDelete, onClear }) {
    if (!selectedCount) return null;

    return React.createElement(
      "div",
      { className: "folder-browser-mobile-selection-bar" },
      React.createElement("span", null, `已选 ${selectedCount}`),
      React.createElement(Button, { size: "sm", variant: "secondary", disabled: !selectedImageCount, onClick: onDownload }, "下载"),
      React.createElement(Button, { size: "sm", variant: "secondary", disabled: selectedCount !== 1, onClick: onRename }, "重命名"),
      React.createElement(Button, { size: "sm", variant: "secondary", onClick: onMove }, "移动"),
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

  function SceneWall({ scenes, wallHeight, mobileColumns, fillTail, selectedIDs, touchPreviewSceneID, previewSceneIDs, onBeforeOpen, onSelectionChange, onContextMenu, onTouchPreview }) {
    return React.createElement(
      "div",
      {
        className: "folder-browser-media-wall" + (fillTail ? " folder-browser-media-wall-fill-tail" : ""),
        style: wallStyle(wallHeight, mobileColumns),
      },
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
      )
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

    if (sceneDetailsButton?.parentElement) return;

    sceneDetailsButton = document.createElement("button");
    sceneDetailsButton.type = "button";
    sceneDetailsButton.className = "folder-browser-scene-details-toggle";
    sceneDetailsButton.textContent = "详情";
    sceneDetailsButton.title = "显示/隐藏视频详情";
    sceneDetailsButton.addEventListener("click", () => {
      document.body?.classList.toggle("folder-browser-scene-details-open");
    });
    document.body.appendChild(sceneDetailsButton);
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

  function lockCurrentOrientation() {
    if (!mobileLayoutNow()) return;
    const orientation = window.innerWidth > window.innerHeight ? "landscape" : "portrait";
    screen.orientation?.lock?.(orientation).catch?.(() => {});
  }

  function setupMobileFullscreenOrientation() {
    document.addEventListener(
      "click",
      (event) => {
        if (!isScenePath()) return;
        if (!event.target.closest?.(".vjs-fullscreen-control")) return;
        lockCurrentOrientation();
      },
      true
    );

    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement) {
        screen.orientation?.unlock?.();
      }
    });
  }

  function ImageWall({ items, wallHeight, mobileColumns, fillTail, selectedIDs, onOpen, onSelectionChange, onContextMenu }) {
    return React.createElement(
      "div",
      {
        className: "folder-browser-media-wall" + (fillTail ? " folder-browser-media-wall-fill-tail" : ""),
        style: wallStyle(wallHeight, mobileColumns),
      },
      items.map((item, index) => {
        const selected = selectedIDs.includes(item.imageID);
        return (
        React.createElement(
          "button",
          {
            key: item.id,
            className: "folder-browser-wall-tile folder-browser-image-tile" + (selected ? " selected" : ""),
            onClick: () => onOpen(index),
            onContextMenu: (event) => onContextMenu(event, item),
            style: { "--folder-wall-aspect": imageAspect(item) },
            title: item.path,
          },
          React.createElement("input", {
            type: "checkbox",
            className: "folder-browser-media-check",
            checked: selected,
            onChange: (event) => onSelectionChange(item.imageID, event.target.checked),
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
      })
    );
  }

  function ContextMenu({ menu, onDownload, onRename, onMove, onDelete, onClose }) {
    if (!menu) return null;

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

    return React.createElement(
      "div",
      {
        className: "folder-browser-context-menu",
        style: { left: menu.x, top: menu.y },
        onClick: (event) => event.stopPropagation(),
        onContextMenu: (event) => event.preventDefault(),
      },
      item("下载", onDownload),
      item("移动", onMove),
      item("重命名", onRename),
      item("删除", onDelete, { danger: true })
    );
  }

  function FileActionToolbar({
    currentFolder,
    selectedCount,
    selectedImageCount,
    selectedSceneCount,
    onDownload,
    onRename,
    onMove,
    onDelete,
    onClear,
  }) {
    return React.createElement(
      "div",
      { className: "folder-browser-file-toolbar" },
      React.createElement("div", { className: "folder-browser-toolbar-title" }, currentFolder ? currentFolder.basename || currentFolder.path : "未选择目录"),
      React.createElement(
        "div",
        { className: "folder-browser-toolbar-buttons" },
        React.createElement(Button, { size: "sm", variant: "secondary", disabled: !selectedImageCount, onClick: onDownload }, "下载"),
        React.createElement(Button, { size: "sm", variant: "secondary", disabled: selectedCount !== 1, onClick: onRename }, "重命名"),
        React.createElement(Button, { size: "sm", variant: "secondary", disabled: !selectedCount, onClick: onMove }, "移动"),
        React.createElement(Button, { size: "sm", variant: "danger", disabled: !selectedCount, onClick: onDelete }, "删除")
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

  function MoveTargetDialog({ open, title, folderTree, selectedFolderID, currentFolderID, onSelect, onToggle, onCancel, onConfirm }) {
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
            onClick: () => onSelect(folder.id),
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
          React.createElement(Button, { size: "sm", variant: "primary", disabled: !selectedFolderID, onClick: onConfirm }, "移动到这里")
        )
      )
    );
  }

  function ImageLightbox({ items, index, playing, onClose, onMove, onPlayingChange, onDownload, onDelete }) {
    const item = index === null ? null : items[index];
    const [zoom, setZoom] = React.useState(1);
    const [pan, setPan] = React.useState({ x: 0, y: 0 });
    const [detailsOpen, setDetailsOpen] = React.useState(false);
    const [menuOpen, setMenuOpen] = React.useState(false);
    const dragRef = React.useRef(null);
    const imageRef = React.useRef(null);

    React.useEffect(() => {
      if (!playing || !item || items.length <= 1) return undefined;
      const timer = window.setInterval(() => onMove(1), 3000);
      return () => window.clearInterval(timer);
    }, [playing, item, items.length, onMove]);

    React.useEffect(() => {
      if (!item) return undefined;
      function onKeyDown(event) {
        if (event.key === "Escape") onClose();
        if (event.key === "ArrowLeft") onMove(-1);
        if (event.key === "ArrowRight") onMove(1);
      }
      window.addEventListener("keydown", onKeyDown);
      return () => window.removeEventListener("keydown", onKeyDown);
    }, [item, onClose, onMove]);

    React.useEffect(() => {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setDetailsOpen(false);
      setMenuOpen(false);
    }, [index]);

    React.useEffect(() => {
      if (zoom === 1) setPan({ x: 0, y: 0 });
    }, [zoom]);

    if (!item) return null;

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

    function onPointerDown(event) {
      if (zoom === 1) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, pan };
    }

    function onPointerMove(event) {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      setPan({
        x: drag.pan.x + event.clientX - drag.startX,
        y: drag.pan.y + event.clientY - drag.startY,
      });
    }

    function onPointerUp(event) {
      const drag = dragRef.current;
      if (drag?.pointerId === event.pointerId) dragRef.current = null;
    }

    const file = primaryImageFile(item.image);
    const fingerprints = file?.fingerprints?.map((fingerprint) => `${fingerprint.type}: ${fingerprint.value}`) || [];
    const customFields = item.image?.custom_fields || {};

    return React.createElement(
      "div",
      { className: "folder-browser-lightbox", role: "dialog", "aria-modal": "true" },
      React.createElement("div", { className: "folder-browser-lightbox-backdrop" }),
      React.createElement(
        "div",
        { className: "folder-browser-lightbox-panel" },
        React.createElement(
          "div",
          { className: "folder-browser-lightbox-toolbar" },
          React.createElement(Button, {
            className: "folder-browser-lightbox-back",
            variant: "link",
            onClick: onClose,
            title: "返回",
          }, "←"),
          React.createElement(
            "div",
            { className: "folder-browser-lightbox-actions" },
            React.createElement("span", { className: "folder-browser-lightbox-count" }, `${index + 1} / ${items.length}`),
            React.createElement(Button, { size: "sm", variant: detailsOpen ? "primary" : "secondary", onClick: () => setDetailsOpen(!detailsOpen), title: "详情" }, "!"),
            React.createElement(Button, { size: "sm", variant: "secondary", onClick: () => setZoom(1), disabled: zoom === 1 }, "重置"),
            React.createElement(
              "div",
              { className: "folder-browser-lightbox-menu-wrap" },
              React.createElement(Button, { size: "sm", variant: "secondary", onClick: () => setMenuOpen(!menuOpen), title: "更多" }, "..."),
              menuOpen
                ? React.createElement(
                    "div",
                    { className: "folder-browser-lightbox-menu" },
                    React.createElement("button", { onClick: () => { setMenuOpen(false); onDownload(item); } }, "下载原图"),
                    React.createElement("button", { onClick: () => { setMenuOpen(false); onPlayingChange(!playing); } }, playing ? "停止幻灯片" : "播放幻灯片"),
                    React.createElement("button", { className: "danger", onClick: () => { setMenuOpen(false); onDelete(item); } }, "删除")
                  )
                : null
            )
          )
        ),
        React.createElement(
          "div",
          { className: "folder-browser-lightbox-stage", onWheel },
          React.createElement("button", {
            className: "folder-browser-lightbox-zone prev",
            onClick: () => onMove(-1),
            title: "上一张",
          }),
          React.createElement("img", {
            ref: imageRef,
            src: item.full || item.thumb,
            alt: item.title,
            onClick: () => {
              if (zoom === 1) onMove(1);
            },
            onPointerDown,
            onPointerMove,
            onPointerUp,
            onPointerCancel: onPointerUp,
            style: {
              "--folder-lightbox-zoom": zoom,
              "--folder-lightbox-pan-x": `${pan.x}px`,
              "--folder-lightbox-pan-y": `${pan.y}px`,
            },
          }),
          React.createElement("button", {
            className: "folder-browser-lightbox-zone next",
            onClick: () => onMove(1),
            title: "下一张",
          }),
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
  }

  function FolderBrowserPage() {
    const savedStateRef = React.useRef(readFolderBrowserState());
    const restoreContentRef = React.useRef(true);
    const restoreScrollRef = React.useRef(true);
    const savedState = savedStateRef.current;
    const contentRef = React.useRef(null);
    const stickyRef = React.useRef(null);
    const scrollAreaRef = React.useRef(null);
    const loadMoreRef = React.useRef(null);
    const [currentFolder, setCurrentFolder] = React.useState(savedState?.currentFolder ?? null);
    const [contentWidth, setContentWidth] = React.useState(0);
    const [folderTree, setFolderTree] = React.useState([]);
    const [scenes, setScenes] = React.useState([]);
    const [images, setImages] = React.useState([]);
    const [sceneTotal, setSceneTotal] = React.useState(0);
    const [imageTotal, setImageTotal] = React.useState(0);
    const [scenePage, setScenePage] = React.useState(0);
    const [imagePage, setImagePage] = React.useState(0);
    const [includeChildren, setIncludeChildren] = React.useState(savedState?.includeChildren ?? true);
    const [activeView, setActiveView] = React.useState(savedState?.activeView ?? "video");
    const [sortState, setSortState] = React.useState(savedState?.sortState ?? { key: "created_at", direction: "DESC" });
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
    const [selectedSceneIDs, setSelectedSceneIDs] = React.useState([]);
    const [selectedImageIDs, setSelectedImageIDs] = React.useState([]);
    const [moveDialog, setMoveDialog] = React.useState(null);
    const [contextMenu, setContextMenu] = React.useState(null);
    const [moveTargetFolderID, setMoveTargetFolderID] = React.useState(null);
    const [reloadKey, setReloadKey] = React.useState(0);
    const [folderReloadKey, setFolderReloadKey] = React.useState(0);
    const [loading, setLoading] = React.useState(false);
    const [loadingScenes, setLoadingScenes] = React.useState(false);
    const [loadingImages, setLoadingImages] = React.useState(false);
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
              const restoredFolder = savedFolderID ? findTreeNode(restoredTree, savedFolderID) : null;
              if (restoredFolder) setCurrentFolder(restoredFolder);
              if (!restoredFolder && restoredTree[0]) {
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
    }, []);

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

    React.useEffect(() => {
      if (!currentFolder) {
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
        setLoadingScenes(true);
        setLoadingImages(true);
        setError("");
        setScenes([]);
        setImages([]);
        setSceneTotal(0);
        setImageTotal(0);
        setScenePage(0);
        setImagePage(0);
        setSelectedSceneIDs([]);
        setSelectedImageIDs([]);
        try {
          const saved = savedStateRef.current;
          const shouldRestoreContent =
            restoreContentRef.current &&
            saved?.currentFolderID === currentFolder.id;
          const initialScenePage = shouldRestoreContent ? Math.max(1, saved.scenePage || 1) : 1;
          const initialImagePage = shouldRestoreContent ? Math.max(1, saved.imagePage || 1) : 1;
          const initialScenePageSize = scenePageSize * initialScenePage;
          const initialImagePageSize = imagePageSize * initialImagePage;
          const criterion = folderCriterion(currentFolder.id, includeChildren);
          const [sceneData, imageData] = await Promise.all([
            callGQL(SCENES_QUERY, {
              folderCriterion: criterion,
              mediaFilter: findFilter(sortState.key, sortState.direction, initialScenePageSize, 1),
            }),
            callGQL(IMAGES_QUERY, {
              folderCriterion: criterion,
              mediaFilter: findFilter(sortState.key, sortState.direction, initialImagePageSize, 1),
            }),
          ]);
          if (!cancelled) {
            setScenes(sceneData.findScenes.scenes ?? []);
            setImages(imageData.findImages.images ?? []);
            setSceneTotal(sceneData.findScenes.count ?? 0);
            setImageTotal(imageData.findImages.count ?? 0);
            setScenePage(initialScenePage);
            setImagePage(initialImagePage);
            restoreContentRef.current = false;
            if (shouldRestoreContent && restoreScrollRef.current) {
              restoreScrollRef.current = false;
              restoreSceneIntoView(saved.lastOpenedSceneID, saved.scrollY || 0);
            }
          }
        } catch (e) {
          if (!cancelled) setError(e.message || String(e));
        } finally {
          if (!cancelled) {
            setLoading(false);
            setLoadingScenes(false);
            setLoadingImages(false);
          }
        }
      }
      loadInitialContent();
      return () => {
        cancelled = true;
      };
    }, [currentFolder, includeChildren, sortState, scenePageSize, imagePageSize, reloadKey]);

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
      setCurrentFolder(findTreeNode(folderTree, folder.id) || folder);
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

    const toggleSceneSelection = React.useCallback((sceneID, selected) => {
      setSelectedSceneIDs((current) => {
        if (selected) return current.includes(sceneID) ? current : [...current, sceneID];
        return current.filter((id) => id !== sceneID);
      });
    }, []);

    const toggleImageSelection = React.useCallback((imageID, selected) => {
      setSelectedImageIDs((current) => {
        if (selected) return current.includes(imageID) ? current : [...current, imageID];
        return current.filter((id) => id !== imageID);
      });
    }, []);

    const toggleAllScenes = React.useCallback((selected) => {
      const ids = wallVideos.map((item) => item.id);
      setSelectedSceneIDs((current) => {
        const rest = current.filter((id) => !ids.includes(id));
        return selected ? [...rest, ...ids] : rest;
      });
    }, [wallVideos]);

    const toggleAllImages = React.useCallback((selected) => {
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

    const openImagePreview = React.useCallback((index) => setLightboxIndex(index), []);

    const moveLightbox = React.useCallback(
      (delta) => {
        setLightboxIndex((current) => {
          if (current === null || wallImages.length === 0) return null;
          return (current + delta + wallImages.length) % wallImages.length;
        });
      },
      [wallImages.length]
    );

    React.useEffect(() => {
      if (lightboxIndex !== null && lightboxIndex >= wallImages.length) {
        setLightboxIndex(wallImages.length ? wallImages.length - 1 : null);
      }
    }, [lightboxIndex, wallImages.length]);

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
      const node = loadMoreRef.current;
      if (!node || !currentFolder) return undefined;
      const canLoadVideos = activeView === "video" && scenes.length < sceneTotal && !loadingScenes;
      const canLoadImages = activeView === "image" && images.length < imageTotal && !loadingImages;
      if (!canLoadVideos && !canLoadImages) return undefined;

      const observer = new IntersectionObserver(
        (entries) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          if (activeView === "video") {
            loadMoreScenes();
          } else {
            loadMoreImages();
          }
        },
        { root: scrollAreaRef.current, rootMargin: "700px 0px", threshold: 0.01 }
      );
      observer.observe(node);
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
      if (!item?.full) return;
      const link = document.createElement("a");
      link.href = item.full;
      link.download = item.basename || item.title || "image";
      link.target = "_blank";
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
          parentFolderID: file?.parent_folder?.id,
          basename: file?.basename,
          title: contextMenu.item.title,
        };
      }
      return {
        fileID: contextMenu.item.fileID,
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

    function moveContextMedia() {
      const file = contextFileInfo();
      if (!file.fileID) return;
      openMoveDialog(`移动 ${file.basename || file.title || "文件"}`, [file.fileID], () => {
        if (contextMenu?.kind === "video") setSelectedSceneIDs((current) => current.filter((id) => id !== contextMenu.item.id));
        if (contextMenu?.kind === "image") setSelectedImageIDs((current) => current.filter((id) => id !== contextMenu.item.imageID));
      });
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
      const confirmed = window.confirm(`删除 ${item.basename || item.title} 及其文件？这个操作会修改 NAS 上的实际文件。`);
      if (!confirmed) return;
      setLoadingImages(true);
      setError("");
      try {
        await callGQL(IMAGES_DESTROY_MUTATION, {
          input: {
            ids: [item.imageID],
            delete_file: true,
            delete_generated: true,
            destroy_file_entry: true,
          },
        });
        setSelectedImageIDs((current) => current.filter((id) => id !== item.imageID));
        if (wallImages.length <= 1) setLightboxIndex(null);
        refreshContent();
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoadingImages(false);
      }
    }

    function openMoveDialog(title, fileIDs, onDone) {
      if (!fileIDs.length || !currentFolder) return;
      setMoveTargetFolderID(currentFolder.id);
      setMoveDialog({ title, fileIDs, onDone });
    }

    function moveSelectedMedia() {
      openMoveDialog(`移动 ${selectedFileIDs.length} 个文件`, selectedFileIDs, clearSelection);
    }

    async function confirmMoveDialog() {
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

    async function loadAllCurrentMedia(includeDescendants = false) {
      if (!currentFolder) return { scenes: [], images: [] };
      const criterion = folderCriterion(currentFolder.id, includeDescendants);
      const [sceneData, imageData] = await Promise.all([
        callGQL(SCENES_QUERY, {
          folderCriterion: criterion,
          mediaFilter: findFilter(sortState.key, sortState.direction, -1, 1),
        }),
        callGQL(IMAGES_QUERY, {
          folderCriterion: criterion,
          mediaFilter: findFilter(sortState.key, sortState.direction, -1, 1),
        }),
      ]);
      return {
        scenes: sceneData.findScenes.scenes ?? [],
        images: imageItems(imageData.findImages.images ?? []),
      };
    }

    async function renameCurrentFolder() {
      if (!currentFolder) return;
      const parentPath = currentFolder.path.slice(0, Math.max(0, currentFolder.path.length - (currentFolder.basename || "").length)).replace(/[\\/]$/, "");
      const basename = window.prompt("新的目录名", currentFolder.basename || "");
      if (!basename || basename === currentFolder.basename) return;
      const destination = parentPath ? `${parentPath}/${basename}` : basename;
      const confirmed = window.confirm("会把当前目录直属媒体文件移动到新目录。子目录不会被整体重命名。继续？");
      if (!confirmed) return;
      setLoading(true);
      setError("");
      try {
        const media = await loadAllCurrentMedia(false);
        const fileIDs = [
          ...media.scenes.map((item) => primarySceneFile(item)?.id).filter(Boolean),
          ...media.images.map((item) => item.fileID).filter(Boolean),
        ];
        if (!fileIDs.length) throw new Error("当前目录没有可移动的媒体文件。");
        await callGQL(MOVE_FILES_MUTATION, {
          input: {
            ids: fileIDs,
            destination_folder: destination,
          },
        });
        clearSelection();
        openRoot();
        setFolderReloadKey((current) => current + 1);
        setReloadKey((current) => current + 1);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    }

    async function deleteCurrentFolderMedia() {
      if (!currentFolder) return;
      const confirmed = window.confirm("会递归删除当前目录、所有子目录里的已扫描视频/图片及其文件。这个操作会修改 NAS 上的实际文件。继续？");
      if (!confirmed) return;
      setLoading(true);
      setError("");
      try {
        const media = await loadAllCurrentMedia(true);
        await Promise.all([
          media.scenes.length
            ? callGQL(SCENES_DESTROY_MUTATION, {
                input: {
                  ids: media.scenes.map((item) => item.id),
                  delete_file: true,
                  delete_generated: true,
                  destroy_file_entry: true,
                },
              })
            : Promise.resolve(),
          media.images.length
            ? callGQL(IMAGES_DESTROY_MUTATION, {
                input: {
                  ids: media.images.map((item) => item.imageID),
                  delete_file: true,
                  delete_generated: true,
                  destroy_file_entry: true,
                },
              })
            : Promise.resolve(),
        ]);
        await callGQL(METADATA_CLEAN_MUTATION, {
          input: {
            paths: [currentFolder.path],
            ignoreZipFileContents: true,
            dryRun: false,
          },
        });
        clearSelection();
        openRoot();
        setFolderReloadKey((current) => current + 1);
      } catch (e) {
        setError(e.message || String(e));
      } finally {
        setLoading(false);
      }
    }

    function renderSidebar(className, includeResizer) {
      return React.createElement(
        "aside",
        { className },
        React.createElement(FileActionToolbar, {
          currentFolder,
          selectedCount: selectedMediaCount,
          selectedImageCount: selectedImages.length,
          selectedSceneCount: selectedScenes.length,
          onDownload: downloadSelectedImages,
          onRename: renameSelectedMedia,
          onMove: moveSelectedMedia,
          onDelete: deleteSelectedMedia,
          onClear: clearSelection,
        }),
        React.createElement(
          "div",
          { className: "folder-browser-tree" },
          folderTree.map((folder) =>
            React.createElement(FolderTreeNode, {
              key: folder.id,
              folder,
              depth: 0,
              currentID: currentFolder?.id,
              onSelect: onSelectFolder,
              onToggle: onToggleFolder,
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
            renderSidebar("folder-browser-sidebar folder-browser-mobile-drawer", false)
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
                  mediaCount: activeView === "video" ? `${wallVideos.length}/${sceneTotal}` : `${wallImages.length}/${imageTotal}`,
                  sortState,
                  includeChildren,
                  previewAllVisible,
                  sizeIndex: activeSizeIndex,
                  controlsOpen: mobileControlsOpen,
                  onControlsToggle: () => setMobileControlsOpen((current) => !current),
                  onOpenFolders: () => setMobileFoldersOpen(true),
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
                  mediaCount: activeView === "video" ? `${wallVideos.length}/${sceneTotal}` : `${wallImages.length}/${imageTotal}`,
                  allSelected: activeView === "video" ? allWallVideosSelected : allWallImagesSelected,
                  someSelected: activeView === "video" ? someWallVideosSelected : someWallImagesSelected,
                  onSelectAllChange: activeView === "video" ? toggleAllScenes : toggleAllImages,
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
              onScroll: () => {
                setContextMenu(null);
                setMobileControlsOpen(false);
                setTouchPreviewSceneID(null);
              },
            },
            React.createElement(
              "div",
              { className: "folder-browser-sections" },
              activeView === "video"
                ? React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(SceneWall, {
                      scenes: wallVideos,
                      wallHeight: videoSizePreset.wallHeight,
                      mobileColumns: isMobileLayout ? videoSizePreset.columns : undefined,
                      fillTail: scenes.length >= sceneTotal,
                      selectedIDs: selectedSceneIDs,
                      touchPreviewSceneID,
                      previewSceneIDs: previewVisibleSceneIDs,
                      onBeforeOpen: (scene) => persistFolderState({ lastOpenedSceneID: scene.id }),
                      onSelectionChange: toggleSceneSelection,
                      onContextMenu: (event, scene) => openMediaContextMenu(event, "video", scene),
                      onTouchPreview: setTouchPreviewSceneID,
                    }),
                    React.createElement(AutoLoadMore, {
                      innerRef: loadMoreRef,
                      disabled: false,
                      loading: loadingScenes,
                      remaining: Math.max(0, sceneTotal - scenes.length),
                      onLoad: loadMoreScenes,
                    })
                  )
                : React.createElement(
                    React.Fragment,
                    null,
                    React.createElement(ImageWall, {
                      items: wallImages,
                      wallHeight: imageSizePreset.wallHeight,
                      mobileColumns: isMobileLayout ? imageSizePreset.columns : undefined,
                      fillTail: images.length >= imageTotal,
                      selectedIDs: selectedImageIDs,
                      onOpen: openImagePreview,
                      onSelectionChange: toggleImageSelection,
                      onContextMenu: (event, item) => openMediaContextMenu(event, "image", item),
                    }),
                    React.createElement(AutoLoadMore, {
                      innerRef: loadMoreRef,
                      disabled: false,
                      loading: loadingImages,
                      remaining: Math.max(0, imageTotal - images.length),
                      onLoad: loadMoreImages,
                    })
                  )
            ),
            !loading && ((activeView === "video" && visibleVideos.length === 0) || (activeView === "image" && visibleImages.length === 0))
              ? React.createElement(
                  "div",
                  { className: "folder-browser-empty" },
                  currentFolder ? (activeView === "video" ? "This folder has no scanned scenes." : "This folder has no scanned images.") : "No library folders found."
                )
              : null
          ),
          React.createElement(ImageLightbox, {
            items: wallImages,
            index: lightboxIndex,
            playing: slideshow,
            onClose: () => {
              setLightboxIndex(null);
              setSlideshow(false);
            },
            onMove: moveLightbox,
            onPlayingChange: setSlideshow,
            onDownload: downloadImageItem,
            onDelete: deleteImageItem,
          }),
          React.createElement(MoveTargetDialog, {
            open: Boolean(moveDialog),
            title: moveDialog?.title || "选择目标目录",
            folderTree,
            selectedFolderID: moveTargetFolderID,
            currentFolderID: currentFolder?.id,
            onSelect: setMoveTargetFolderID,
            onToggle: onToggleFolder,
            onCancel: () => {
              setMoveDialog(null);
              setMoveTargetFolderID(null);
            },
            onConfirm: confirmMoveDialog,
          }),
          React.createElement(ContextMenu, {
            menu: contextMenu,
            onDownload: downloadContextMedia,
            onRename: renameContextMedia,
            onMove: moveContextMedia,
            onDelete: deleteContextMedia,
            onClose: () => setContextMenu(null),
          }),
          isMobileLayout
            ? React.createElement(MobileSelectionBar, {
                selectedCount: selectedMediaCount,
                selectedImageCount: selectedImages.length,
                onDownload: downloadSelectedImages,
                onMove: moveSelectedMedia,
                onRename: renameSelectedMedia,
                onDelete: deleteSelectedMedia,
                onClear: clearSelection,
              })
            : null
        )
      )
    );
  }

  api.register.route(ROUTE, FolderBrowserPage);

  setupFolderBrowserRouteClass();
  setupFolderBrowserHomeRedirect();
  setupPlayerReturnButton();
  setupMobileSceneDetailsMenu();
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
