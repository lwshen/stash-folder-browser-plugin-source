(function () {
  const api = window.PluginApi;
  if (!api) return;

  const React = api.React;
  const { Button, Form } = api.libraries.Bootstrap;
  const { Link, NavLink } = api.libraries.ReactRouterDOM;
  const { FontAwesomeIcon } = api.libraries.ReactFontAwesome;
  const { faFolder, faFolderOpen } = api.libraries.FontAwesomeSolid;

  const ROUTE = "/folders";
  const baseURL = document.querySelector("base")?.getAttribute("href") ?? "/";

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
  `;

  const ROOT_FOLDERS_QUERY = `
    query FolderBrowserRootFolders($folderFilter: FolderFilterType!, $filter: FindFilterType) {
      findFolders(folder_filter: $folderFilter, filter: $filter) {
        folders { ${FOLDER_FIELDS} }
      }
    }
  `;

  const CONTENT_QUERY = `
    query FolderBrowserContent(
      $folderID: ID!
      $folderFilter: FolderFilterType!
      $folderFindFilter: FindFilterType
      $mediaFilter: FindFilterType
    ) {
      findFolders(folder_filter: $folderFilter, filter: $folderFindFilter) {
        folders { ${FOLDER_FIELDS} }
      }
      findScenes(
        scene_filter: { files_filter: { parent_folder: { value: $folderID, modifier: EQUALS } } }
        filter: $mediaFilter
      ) {
        count
        scenes {
          id
          title
          paths { screenshot preview }
          files {
            id
            path
            basename
            duration
            width
            height
            size
          }
        }
      }
      findImages(
        image_filter: { files_filter: { parent_folder: { value: $folderID, modifier: EQUALS } } }
        filter: $mediaFilter
      ) {
        count
        images {
          id
          title
          paths { thumbnail preview image }
          files {
            id
            path
            basename
            width
            height
            size
          }
        }
      }
    }
  `;

  function rootFolderFilter() {
    return {
      parent_folder: { modifier: "IS_NULL" },
      zip_file: { modifier: "IS_NULL" },
    };
  }

  function childFolderFilter(folderID) {
    return {
      parent_folder: { value: folderID, modifier: "EQUALS" },
      zip_file: { modifier: "IS_NULL" },
    };
  }

  function findFilter(sort, perPage) {
    return {
      sort,
      direction: "ASC",
      per_page: perPage,
    };
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "";
    const total = Math.max(0, Math.floor(seconds));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function primarySceneFile(scene) {
    return scene.files?.[0];
  }

  function primaryImageFile(image) {
    return image.files?.[0];
  }

  function mediaItems(scenes, images) {
    const sceneItems = (scenes ?? []).map((scene) => {
      const file = primarySceneFile(scene);
      return {
        id: `scene-${scene.id}`,
        kind: "video",
        title: scene.title || file?.basename || "Untitled scene",
        path: file?.path || "",
        basename: file?.basename || scene.title || "Untitled scene",
        meta: ["Video", formatDuration(file?.duration)].filter(Boolean).join(" / "),
        thumb: scene.paths?.screenshot || scene.paths?.preview,
        href: `/scenes/${scene.id}`,
      };
    });

    const imageItems = (images ?? []).map((image) => {
      const file = primaryImageFile(image);
      return {
        id: `image-${image.id}`,
        kind: "image",
        title: image.title || file?.basename || "Untitled image",
        path: file?.path || "",
        basename: file?.basename || image.title || "Untitled image",
        meta: "Image",
        thumb: image.paths?.thumbnail || image.paths?.preview || image.paths?.image,
        href: `/images/${image.id}`,
      };
    });

    return [...sceneItems, ...imageItems].sort((a, b) =>
      a.basename.localeCompare(b.basename, undefined, { sensitivity: "base" })
    );
  }

  function FolderButton({ folder, currentID, onOpen }) {
    return React.createElement(
      "button",
      {
        className:
          "folder-browser-tree-button" + (folder.id === currentID ? " active" : ""),
        title: folder.path,
        onClick: () => onOpen(folder),
      },
      folder.basename || folder.path
    );
  }

  function Breadcrumbs({ currentFolder, onRoot, onOpen }) {
    if (!currentFolder) {
      return React.createElement(
        "div",
        { className: "folder-browser-breadcrumbs" },
        React.createElement(Button, { size: "sm", variant: "secondary", disabled: true }, "Library roots")
      );
    }

    const parents = [...(currentFolder.parent_folders ?? [])].reverse();
    const crumbs = [
      React.createElement(Button, { key: "root", size: "sm", variant: "secondary", onClick: onRoot }, "Roots"),
      ...parents.map((folder) =>
        React.createElement(
          Button,
          {
            key: folder.id,
            size: "sm",
            variant: "secondary",
            onClick: () => onOpen(folder),
            title: folder.path,
          },
          folder.basename || folder.path
        )
      ),
      React.createElement(
        Button,
        { key: currentFolder.id, size: "sm", variant: "primary", disabled: true, title: currentFolder.path },
        currentFolder.basename || currentFolder.path
      ),
    ];

    return React.createElement("div", { className: "folder-browser-breadcrumbs" }, crumbs);
  }

  function FolderCard({ folder, onOpen }) {
    return React.createElement(
      "button",
      { className: "folder-browser-folder-card", onClick: () => onOpen(folder), title: folder.path },
      React.createElement(
        "span",
        { className: "folder-browser-folder-icon" },
        FontAwesomeIcon ? React.createElement(FontAwesomeIcon, { icon: faFolder }) : null
      ),
      React.createElement(
        "span",
        null,
        React.createElement("span", { className: "folder-browser-name" }, folder.basename || folder.path),
        React.createElement("span", { className: "folder-browser-meta" }, folder.path)
      )
    );
  }

  function MediaCard({ item }) {
    return React.createElement(
      Link,
      { className: "folder-browser-media-card", to: item.href, title: item.path },
      React.createElement(
        "div",
        { className: "folder-browser-media-thumb" },
        item.thumb
          ? React.createElement("img", { src: item.thumb, alt: item.title, loading: "lazy" })
          : React.createElement("span", { className: "folder-browser-media-placeholder" }, item.kind)
      ),
      React.createElement(
        "div",
        { className: "folder-browser-card-body" },
        React.createElement("span", { className: "folder-browser-name" }, item.title),
        React.createElement("span", { className: "folder-browser-meta" }, item.meta)
      )
    );
  }

  function FolderBrowserPage() {
    const [currentFolder, setCurrentFolder] = React.useState(null);
    const [rootFolders, setRootFolders] = React.useState([]);
    const [childFolders, setChildFolders] = React.useState([]);
    const [scenes, setScenes] = React.useState([]);
    const [images, setImages] = React.useState([]);
    const [query, setQuery] = React.useState("");
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState("");

    const openRoot = React.useCallback(() => {
      setCurrentFolder(null);
      setScenes([]);
      setImages([]);
    }, []);

    React.useEffect(() => {
      let cancelled = false;
      async function loadRootFolders() {
        setLoading(true);
        setError("");
        try {
          const data = await callGQL(ROOT_FOLDERS_QUERY, {
            folderFilter: rootFolderFilter(),
            filter: findFilter("basename", -1),
          });
          if (!cancelled) {
            setRootFolders(data.findFolders.folders ?? []);
            setChildFolders(data.findFolders.folders ?? []);
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

    React.useEffect(() => {
      if (!currentFolder) {
        setChildFolders(rootFolders);
        setScenes([]);
        setImages([]);
        return;
      }

      let cancelled = false;
      async function loadContent() {
        setLoading(true);
        setError("");
        try {
          const data = await callGQL(CONTENT_QUERY, {
            folderID: currentFolder.id,
            folderFilter: childFolderFilter(currentFolder.id),
            folderFindFilter: findFilter("basename", -1),
            mediaFilter: findFilter("path", -1),
          });
          if (!cancelled) {
            setChildFolders(data.findFolders.folders ?? []);
            setScenes(data.findScenes.scenes ?? []);
            setImages(data.findImages.images ?? []);
          }
        } catch (e) {
          if (!cancelled) setError(e.message || String(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
      loadContent();
      return () => {
        cancelled = true;
      };
    }, [currentFolder, rootFolders]);

    const items = React.useMemo(() => mediaItems(scenes, images), [scenes, images]);
    const queryLower = query.trim().toLowerCase();
    const visibleFolders = React.useMemo(
      () =>
        childFolders.filter((folder) =>
          !queryLower
            ? true
            : `${folder.basename} ${folder.path}`.toLowerCase().includes(queryLower)
        ),
      [childFolders, queryLower]
    );
    const visibleItems = React.useMemo(
      () =>
        items.filter((item) =>
          !queryLower
            ? true
            : `${item.title} ${item.basename} ${item.path}`.toLowerCase().includes(queryLower)
        ),
      [items, queryLower]
    );

    return React.createElement(
      "div",
      { className: "folder-browser-page" },
      React.createElement(
        "div",
        { className: "folder-browser-header" },
        React.createElement("h2", null, "Folders"),
        loading ? React.createElement("span", { className: "folder-browser-meta" }, "Loading...") : null
      ),
      error ? React.createElement("div", { className: "folder-browser-error" }, error) : null,
      React.createElement(
        "div",
        { className: "folder-browser-shell" },
        React.createElement(
          "aside",
          { className: "folder-browser-sidebar" },
          React.createElement(Form.Control, {
            className: "folder-browser-search",
            placeholder: "Filter this folder",
            value: query,
            onChange: (event) => setQuery(event.target.value),
          }),
          React.createElement(
            "div",
            { className: "folder-browser-tree" },
            rootFolders.map((folder) =>
              React.createElement(FolderButton, {
                key: folder.id,
                folder,
                currentID: currentFolder?.id,
                onOpen: setCurrentFolder,
              })
            )
          )
        ),
        React.createElement(
          "main",
          { className: "folder-browser-content" },
          React.createElement(Breadcrumbs, {
            currentFolder,
            onRoot: openRoot,
            onOpen: setCurrentFolder,
          }),
          React.createElement(
            "div",
            { className: "folder-browser-grid" },
            visibleFolders.map((folder) =>
              React.createElement(FolderCard, { key: `folder-${folder.id}`, folder, onOpen: setCurrentFolder })
            ),
            visibleItems.map((item) => React.createElement(MediaCard, { key: item.id, item }))
          ),
          !loading && visibleFolders.length === 0 && visibleItems.length === 0
            ? React.createElement(
                "div",
                { className: "folder-browser-empty" },
                currentFolder ? "This folder has no scanned scenes or images." : "No library folders found."
              )
            : null
        )
      )
    );
  }

  api.register.route(ROUTE, FolderBrowserPage);

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
              className: "nav-menu-icon d-block d-xl-inline mb-2 mb-xl-0",
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
})();
