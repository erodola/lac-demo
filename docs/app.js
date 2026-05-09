const RELATIVE_MANIFEST_JSON_CANDIDATES = [
  "data/manifest.json",
];

const RELATIVE_MANIFEST_JS_CANDIDATES = [
  "data/manifest.js",
];

const dom = {
  nav: document.getElementById("section-nav"),
  root: document.getElementById("content-root"),
  updatedAt: document.getElementById("updated-at"),
  brandTitle: document.querySelector(".brand-title"),
};

let manifestSourceUrl = null;
let manifestAssetVersion = null;

function getApiRepoPrefix() {
  const path = window.location.pathname || "";
  const match = path.match(/^(\/api\/repo\/[^/]+\/file)(?:\/|$)/);
  return match ? match[1] : null;
}

function getManifestCandidates(relativeCandidates, filename) {
  const seen = new Set();
  const out = [];

  const add = (candidate) => {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    out.push(candidate);
  };

  const apiRepoPrefix = getApiRepoPrefix();
  if (apiRepoPrefix) {
    add(`${apiRepoPrefix}/data/${filename}`);
  }

  relativeCandidates.forEach(add);
  return out;
}

function make(tag, className, text) {
  const el = document.createElement(tag);
  if (className) {
    el.className = className;
  }
  if (typeof text === "string") {
    el.textContent = text;
  }
  return el;
}

function renderError(message) {
  const box = make("div", "error-box");
  box.textContent = message;
  dom.root.replaceChildren(box);
}

function renderNav(sections) {
  const fragment = document.createDocumentFragment();
  for (const section of sections) {
    const a = make("a");
    a.href = `#${section.id}`;
    a.textContent = section.nav_label || section.title;
    fragment.appendChild(a);
  }
  dom.nav.replaceChildren(fragment);
}

function createTrackTile(track) {
  const tile = make("div", "track-tile");
  tile.appendChild(make("p", "track-label", track.label));

  const player = make("audio");
  player.controls = true;
  player.preload = "none";
  player.src = resolveAssetPath(track.file);
  tile.appendChild(player);

  return tile;
}

function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags.filter((tag) => typeof tag === "string" && tag.length > 0);
  }
  if (typeof tags === "string" && tags.length > 0) {
    return [tags];
  }
  return [];
}

function createPlotTile(plotImagePath, plotLabel) {
  const tile = make("div", "track-tile plot-tile");
  tile.appendChild(make("p", "track-label", plotLabel || "Waveform plot"));

  const img = make("img", "plot-image");
  img.loading = "lazy";
  img.decoding = "async";
  img.alt = plotLabel || "Waveform plot";
  img.src = resolveAssetPath(plotImagePath);
  tile.appendChild(img);

  return tile;
}

function resolveAssetPath(filePath) {
  if (!filePath) {
    return "";
  }

  if (/^(?:[a-z]+:)?\/\//i.test(filePath) || /^[a-z]+:/i.test(filePath)) {
    return filePath;
  }

  let resolvedUrl = null;
  if (filePath.startsWith("data/") && manifestSourceUrl) {
    try {
      const manifestDir = new URL("./", manifestSourceUrl);
      resolvedUrl = new URL(filePath.slice("data/".length), manifestDir).toString();
    } catch {
      // Fallback below.
    }
  }

  if (!resolvedUrl) {
    resolvedUrl = new URL(filePath, document.baseURI).toString();
  }

  if (manifestAssetVersion) {
    const separator = resolvedUrl.includes("?") ? "&" : "?";
    return `${resolvedUrl}${separator}v=${encodeURIComponent(manifestAssetVersion)}`;
  }

  return resolvedUrl;
}

function createDescriptionPanel(text) {
  if (!text) {
    return null;
  }

  const details = make("details", "description-panel");
  details.open = true;
  const summary = make("summary", "", "Full lexical description");
  const body = make("p", "description-text", text);
  details.append(summary, body);
  return details;
}

function appendInlineMarkdownText(parent, text) {
  const source = String(text);
  const tokenRegex = /(\*\*[^*]+\*\*|\[[^\]]+\]\((?:https?|ftp):\/\/[^)\s]+\))/g;
  let lastIndex = 0;
  let match;

  while ((match = tokenRegex.exec(source)) !== null) {
    if (match.index > lastIndex) {
      parent.appendChild(document.createTextNode(source.slice(lastIndex, match.index)));
    }

    const token = match[0];
    const isBoldToken = token.startsWith("**") && token.endsWith("**") && token.length > 4;
    if (isBoldToken) {
      parent.appendChild(make("strong", "", token.slice(2, -2)));
    } else {
      const linkMatch = token.match(/^\[([^\]]+)\]\(((?:https?|ftp):\/\/[^)\s]+)\)$/);
      if (linkMatch) {
        const anchor = make("a", "section-link", linkMatch[1]);
        anchor.href = linkMatch[2];
        anchor.target = "_blank";
        anchor.rel = "noopener noreferrer";
        parent.appendChild(anchor);
      } else {
        parent.appendChild(document.createTextNode(token));
      }
    }

    lastIndex = tokenRegex.lastIndex;
  }

  if (lastIndex < source.length) {
    parent.appendChild(document.createTextNode(source.slice(lastIndex)));
  }
}

function createSectionDescription(text) {
  if (!text) {
    return null;
  }

  const container = make("div", "section-description");
  const lines = String(text).split(/\r?\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      container.appendChild(make("div", "section-gap"));
      continue;
    }

    if (trimmed.startsWith("- ")) {
      const list = make("ul", "section-list");
      while (i < lines.length) {
        const bullet = lines[i].trim();
        if (!bullet.startsWith("- ")) {
          i -= 1;
          break;
        }
        const li = make("li");
        appendInlineMarkdownText(li, bullet.slice(2).trim());
        list.appendChild(li);
        i += 1;
      }
      container.appendChild(list);
      continue;
    }

    const row = make("p", "section-line");
    appendInlineMarkdownText(row, line);
    container.appendChild(row);
  }

  return container;
}

function renderExampleTitle(titleElement, titleText) {
  const safeTitle = titleText || "Sample";
  const loopedMatch = safeTitle.match(/^(.*)\s(\[looped\])$/i);

  titleElement.textContent = "";
  if (!loopedMatch) {
    titleElement.textContent = safeTitle;
    return;
  }

  titleElement.appendChild(document.createTextNode(loopedMatch[1] + " "));
  titleElement.appendChild(make("span", "looped-tag", loopedMatch[2]));
}

function markTitleAsLooped(title) {
  const safeTitle = title || "Sample";
  if (/\s\[looped\]$/i.test(safeTitle)) {
    return safeTitle;
  }
  return `${safeTitle} [looped]`;
}

function applyLoopedTitleRule(sections) {
  const sampleSection = sections.find((section) => section.id === "samples-instruments");
  if (!sampleSection?.examples?.length) {
    return;
  }

  sampleSection.examples.forEach((example) => {
    if (example.looped === true) {
      example.title = markTitleAsLooped(example.title);
    }
  });
}

function createExampleCard(example) {
  const card = make("article", "example-card");
  card.id = example.id;

  const head = make("div", "example-head");
  const titleWrap = make("div");
  const titleEl = make("h4", "example-title");
  renderExampleTitle(titleEl, example.title);
  titleWrap.appendChild(titleEl);

  const subtitleEl = createSubtitleNode(example);
  if (subtitleEl) {
    titleWrap.appendChild(subtitleEl);
  }

  const chips = make("div", "chip-row");
  for (const tag of normalizeTags(example.tags)) {
    chips.appendChild(make("span", "chip", tag));
  }

  head.append(titleWrap, chips);
  card.appendChild(head);

  const tracks = make("div", "track-grid");
  for (const track of example.tracks) {
    tracks.appendChild(createTrackTile(track));
  }
  if (example.plot_image) {
    tracks.classList.add("with-plot");
    tracks.appendChild(
      createPlotTile(example.plot_image, example.plot_label || "Waveform plot")
    );
  }
  card.appendChild(tracks);

  const details = createDescriptionPanel(example.lexical_description);
  if (details) {
    card.appendChild(details);
  }

  return card;
}

function createSubtitleNode(example) {
  if (!example?.subtitle) {
    return null;
  }

  const subtitle = String(example.subtitle);
  const meta = make("p", "example-meta");
  const songName = typeof example.song_name === "string" ? example.song_name.trim() : "";
  const directDownload =
    typeof example.direct_download === "string" ? example.direct_download.trim() : "";

  if (songName && directDownload) {
    const idx = subtitle.indexOf(songName);
    if (idx >= 0) {
      const before = subtitle.slice(0, idx);
      const after = subtitle.slice(idx + songName.length);

      if (before) {
        meta.appendChild(document.createTextNode(before));
      }
      const link = make("a", "example-meta-link", songName);
      link.href = directDownload;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      meta.appendChild(link);
      if (after) {
        meta.appendChild(document.createTextNode(after));
      }
      return meta;
    }
  }

  meta.textContent = subtitle;
  return meta;
}

function renderSections(sections) {
  const fragment = document.createDocumentFragment();

  for (const section of sections) {
    const wrapper = make("section", "content-section");
    wrapper.id = section.id;
    wrapper.appendChild(make("h3", "section-heading", section.title));

    if (section.description) {
      wrapper.appendChild(createSectionDescription(section.description));
    }

    const list = make("div", "example-list");
    for (const example of section.examples || []) {
      list.appendChild(createExampleCard(example));
    }

    wrapper.appendChild(list);
    fragment.appendChild(wrapper);
  }

  dom.root.replaceChildren(fragment);
}

function getEmbeddedManifest() {
  if (typeof window !== "undefined" && window.LAC_MANIFEST) {
    return window.LAC_MANIFEST;
  }
  return null;
}

function loadScript(url) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = url;
    script.async = true;
    script.onload = () => resolve(url);
    script.onerror = () => reject(new Error(`Failed to load script: ${url}`));
    document.head.appendChild(script);
  });
}

async function loadManifestFromScriptCandidates() {
  const embedded = getEmbeddedManifest();
  if (embedded) {
    return embedded;
  }

  const candidates = getManifestCandidates(
    RELATIVE_MANIFEST_JS_CANDIDATES,
    "manifest.js"
  );
  const cacheBust = Date.now();
  for (const candidate of candidates) {
    const separator = candidate.includes("?") ? "&" : "?";
    const url = new URL(`${candidate}${separator}v=${cacheBust}`, document.baseURI).toString();
    try {
      await loadScript(url);
      const loaded = getEmbeddedManifest();
      if (loaded) {
        return {
          manifest: loaded,
          sourceUrl: url,
        };
      }
    } catch {
      // Try next candidate.
    }
  }

  return null;
}

async function loadManifest() {
  const jsonCandidates = getManifestCandidates(
    RELATIVE_MANIFEST_JSON_CANDIDATES,
    "manifest.json"
  );
  const errors = [];

  for (const candidate of jsonCandidates) {
    const url = new URL(candidate, document.baseURI).toString();
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) {
        return {
          manifest: await response.json(),
          sourceUrl: url,
        };
      }
      errors.push(`${url} -> HTTP ${response.status}`);
    } catch {
      errors.push(`${url} -> fetch error`);
    }
  }

  const embedded = await loadManifestFromScriptCandidates();
  if (embedded) {
    return embedded;
  }

  const jsCandidates = getManifestCandidates(
    RELATIVE_MANIFEST_JS_CANDIDATES,
    "manifest.js"
  );
  throw new Error(
    `Failed to fetch manifest. JSON attempts: ${errors.join(" | ")}. JS candidates: ${jsCandidates.join(", ")}`
  );
}

async function init() {
  try {
    const loaded = await loadManifest();
    manifestSourceUrl = loaded.sourceUrl;
    const manifest = loaded.manifest;
    manifestAssetVersion =
      manifest.meta?.asset_version || manifest.meta?.updated || Date.now().toString();
    const sections = manifest.sections || [];
    applyLoopedTitleRule(sections);

    if (manifest.meta?.page_title) {
      document.title = manifest.meta.page_title;
      if (dom.brandTitle) {
        dom.brandTitle.textContent = manifest.meta.page_title;
      }
    }

    renderNav(sections);
    renderSections(sections);

    if (manifest.meta?.updated) {
      dom.updatedAt.textContent = `Updated: ${manifest.meta.updated}`;
    }
  } catch (error) {
    renderError(
      `Could not load listening examples. Ensure data/manifest.js (preferred) or data/manifest.json is available. (${error.message})`
    );
  }
}

init();
