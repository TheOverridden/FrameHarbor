import {
  DEFAULT_INSTANCES,
  INSTANCE_LIST_URL,
  channelIdFromPath,
  cleanApiUrl,
  compactNumber,
  formatDate,
  formatDuration,
  getRoute,
  normalizeVideo,
  parseInstanceMarkdown,
  plainText,
  routeForChannel,
  routeForVideo,
  sortProgressiveStreams,
  uniqueVideos,
  videoIdFromUrl
} from "./lib.js";

const $ = (selector, root = document) => root.querySelector(selector);
const app = $("#app");
const searchInput = $("#search-input");
const suggestions = $("#suggestions");
const settingsDialog = $("#settings-dialog");
const STORAGE_KEY = "frameharbor:v1";
const MAX_HISTORY = 80;

function loadState() {
  const fallback = {
    theme: matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
    region: "US",
    instance: DEFAULT_INSTANCES[0].api,
    failover: true,
    history: [],
    saved: []
  };
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    return { ...fallback, ...stored, history: stored.history || [], saved: stored.saved || [] };
  } catch {
    return fallback;
  }
}

const state = {
  ...loadState(),
  instances: [...DEFAULT_INSTANCES],
  activeInstance: "",
  requestToken: 0,
  suggestionTimer: null
};

function persist() {
  const { theme, region, instance, failover, history, saved } = state;
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, region, instance, failover, history, saved }));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeUrl(value = "") {
  try {
    const url = new URL(value, location.href);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function initials(value = "FH") {
  return String(value).split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase() || "FH";
}

function icon(name) {
  return `<svg aria-hidden="true"><use href="#i-${name}"></use></svg>`;
}

function toast(message, detail = "", type = "info") {
  const item = document.createElement("div");
  item.className = `toast ${type}`;
  item.innerHTML = `<span class="toast-dot"></span><div>${escapeHtml(message)}${detail ? `<small>${escapeHtml(detail)}</small>` : ""}</div>`;
  $("#toast-region").append(item);
  setTimeout(() => item.remove(), 4200);
}

class PipedClient {
  candidates() {
    const current = cleanApiUrl(state.instance);
    const list = state.instances.map((item) => cleanApiUrl(item.api)).filter(Boolean);
    return [...new Set([current, ...list])];
  }

  async request(path, { timeout = 13000, maxAttempts = Infinity } = {}) {
    const candidates = this.candidates().slice(0, maxAttempts);
    let lastError;
    for (let index = 0; index < candidates.length; index += 1) {
      if (index > 0 && !state.failover) break;
      const base = candidates[index];
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      try {
        const response = await fetch(`${base}${path}`, { signal: controller.signal, headers: { Accept: "application/json" } });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data?.error) throw new Error(data.error);
        if (base !== state.activeInstance && state.activeInstance) toast("Playback server switched", new URL(base).host);
        state.activeInstance = base;
        return data;
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(lastError?.name === "AbortError" ? "The video service timed out." : lastError?.message || "Every configured video service failed.");
  }

  trending() { return this.request(`/trending?region=${encodeURIComponent(state.region)}`); }
  search(query) { return this.request(`/search?q=${encodeURIComponent(query)}&filter=videos`); }
  suggestions(query) { return this.request(`/suggestions?query=${encodeURIComponent(query)}`, { timeout: 7000 }); }
  streams(id) { return this.request(`/streams/${encodeURIComponent(id)}`, { timeout: 8000, maxAttempts: 2 }); }
  comments(id) { return this.request(`/comments/${encodeURIComponent(id)}`, { timeout: 8000, maxAttempts: 2 }); }
  channel(id) { return this.request(`/channel/${encodeURIComponent(id)}`, { timeout: 16000 }); }
}

const api = new PipedClient();

function avatar(url, name, className = "channel-avatar") {
  const src = safeUrl(url);
  return src
    ? `<img class="${className}" src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />`
    : `<span class="${className} avatar-fallback" aria-hidden="true">${escapeHtml(initials(name))}</span>`;
}

function thumbnail(video) {
  const duration = video.livestream ? "LIVE" : formatDuration(video.duration);
  const src = safeUrl(video.thumbnail);
  return `<div class="thumbnail">
    ${src ? `<img src="${escapeHtml(src)}" alt="" loading="lazy" referrerpolicy="no-referrer" />` : ""}
    ${duration ? `<span class="duration ${video.livestream ? "live-badge" : ""}">${escapeHtml(duration)}</span>` : ""}
  </div>`;
}

function videoMeta(video) {
  const bits = [];
  if (video.views) bits.push(`${compactNumber(video.views)} views`);
  if (video.uploaded) bits.push(video.uploaded);
  return bits.join(" · ");
}

function channelLink(video) {
  const route = routeForChannel(video.uploaderUrl);
  if (!route) return `<span>${escapeHtml(video.uploader)}</span>`;
  return `<a href="${escapeHtml(route)}" data-route>${escapeHtml(video.uploader)}</a>`;
}

function videoCard(item) {
  const video = normalizeVideo(item);
  if (!video.id) return "";
  return `<article class="video-card" data-video-id="${escapeHtml(video.id)}" tabindex="0" role="link" aria-label="Play ${escapeHtml(video.title)}">
    ${thumbnail(video)}
    <div class="card-info">
      ${avatar(video.uploaderAvatar, video.uploader)}
      <div class="card-text">
        <h3 class="card-title">${escapeHtml(video.title)}</h3>
        <div class="card-channel">${channelLink(video)} ${video.verified ? '<span class="verified" title="Verified">●</span>' : ""}</div>
        <div class="card-meta">${escapeHtml(videoMeta(video))}</div>
      </div>
    </div>
  </article>`;
}

function resultCard(item) {
  const video = normalizeVideo(item);
  if (!video.id) return "";
  return `<article class="result-card" data-video-id="${escapeHtml(video.id)}" tabindex="0" role="link">
    ${thumbnail(video)}
    <div class="result-copy">
      <h3>${escapeHtml(video.title)}</h3>
      <div class="card-meta">${escapeHtml(videoMeta(video))}</div>
      <div class="channel-line">${avatar(video.uploaderAvatar, video.uploader)}<span>${channelLink(video)} ${video.verified ? '<span class="verified">●</span>' : ""}</span></div>
      ${video.description ? `<p class="description">${escapeHtml(plainText(video.description))}</p>` : ""}
    </div>
  </article>`;
}

function relatedCard(item) {
  const video = normalizeVideo(item);
  if (!video.id) return "";
  return `<article class="related-card" data-video-id="${escapeHtml(video.id)}" tabindex="0" role="link">
    ${thumbnail(video)}
    <div><h3>${escapeHtml(video.title)}</h3><div class="card-meta">${escapeHtml(video.uploader)}</div><div class="card-meta">${escapeHtml(videoMeta(video))}</div></div>
  </article>`;
}

function skeletonGrid(count = 8) {
  return `<div class="video-grid">${Array.from({ length: count }, () => `<div class="skeleton-card"><div class="thumbnail skeleton"></div><div class="skeleton-line skeleton"></div><div class="skeleton-line short skeleton"></div></div>`).join("")}</div>`;
}

function pageError(title, message, action = "retry") {
  app.innerHTML = `<section class="page"><div class="error-state">
    <div class="empty-icon">${icon("x")}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p>
    <button class="button primary" type="button" data-action="${action}">Try again</button>
  </div></section>`;
}

function renderEmbedFallback(videoId, reason = "The public Piped instances could not provide a playable stream.") {
  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?autoplay=1&rel=0`;
  app.innerHTML = `<section class="watch-page fallback-watch">
    <div class="watch-main">
      <div class="player-shell">
        <iframe src="${escapeHtml(embedUrl)}" title="Video player" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin"></iframe>
      </div>
      <h1 class="watch-title">Playing through privacy-enhanced fallback</h1>
      <div class="description-box"><strong>Piped fallback active</strong>\n\n${escapeHtml(reason)} FrameHarbor kept you on the same page and switched to YouTube’s privacy-enhanced embed so the video can still play.</div>
    </div>
    <aside class="watch-side"><div class="empty-state"><div class="empty-icon">${icon("play")}</div><h1>Still in FrameHarbor</h1><p>The fallback player is embedded here; no tab change required.</p><button class="button secondary" type="button" data-action="retry-watch" data-video-id="${escapeHtml(videoId)}">Retry Piped</button></div></aside>
  </section>`;
  document.title = "Watch · FrameHarbor";
}

function emptyState(title, message, iconName = "compass") {
  return `<div class="empty-state"><div class="empty-icon">${icon(iconName)}</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p></div>`;
}

function setActiveNav(name) {
  document.querySelectorAll("[data-nav]").forEach((item) => item.classList.toggle("active", item.dataset.nav === name));
}

function routeTo(href, { replace = false } = {}) {
  const url = new URL(href, location.href);
  if (replace) history.replaceState({}, "", url);
  else history.pushState({}, "", url);
  document.body.classList.remove("nav-open");
  renderRoute();
}

async function loadInstances() {
  try {
    const response = await fetch(INSTANCE_LIST_URL, { headers: { Accept: "text/plain" } });
    if (!response.ok) return;
    const dynamic = parseInstanceMarkdown(await response.text());
    if (dynamic.length) {
      const all = [...dynamic, ...DEFAULT_INSTANCES];
      state.instances = all.filter((item, index) => all.findIndex((candidate) => candidate.api === item.api) === index);
    }
  } catch {
    // The bundled list is deliberately usable when the live registry is unavailable.
  }
  populateInstanceSelect();
}

function populateInstanceSelect() {
  const select = $("#instance-select");
  if (!select) return;
  const selected = cleanApiUrl(state.instance);
  select.innerHTML = state.instances.map((item) => `<option value="${escapeHtml(item.api)}" ${item.api === selected ? "selected" : ""}>${escapeHtml(item.name)} · ${escapeHtml(new URL(item.api).host)}</option>`).join("");
  if (selected && !state.instances.some((item) => item.api === selected)) {
    select.insertAdjacentHTML("afterbegin", `<option value="${escapeHtml(selected)}" selected>Custom · ${escapeHtml(new URL(selected).host)}</option>`);
  }
}

async function renderHome(explore = false) {
  setActiveNav(explore ? "explore" : "home");
  const token = ++state.requestToken;
  const chips = ["All", "Gaming", "Music", "Technology", "News", "Live", "Documentaries"];
  app.innerHTML = `<section class="page">
    ${explore ? `<div class="page-head"><div><span class="eyebrow">Explore ${escapeHtml(state.region)}</span><h1>What’s moving right now</h1><p>Trending videos routed through a public Piped instance.</p></div></div>` : `<div class="hero"><div class="hero-content"><span class="eyebrow">Private by design</span><h1>Watch widely.<br>Leave a smaller wake.</h1><p>Search, discover, and play videos without hopping between pages—or feeding the usual surveillance buffet.</p><form class="hero-search" id="hero-search"><input type="search" placeholder="What do you want to watch?" aria-label="Search videos" /><button class="button primary">Search</button></form></div></div>`}
    <div class="chips" aria-label="Search categories">${chips.map((chip, index) => `<button class="chip ${index === 0 ? "active" : ""}" type="button" data-category="${escapeHtml(chip)}">${escapeHtml(chip)}</button>`).join("")}</div>
    <div class="section-head"><h2>${explore ? "Trending now" : "Popular today"}</h2><span class="subtle">${escapeHtml(state.region)}</span></div>
    <div id="feed">${skeletonGrid(12)}</div>
  </section>`;
  try {
    const data = await api.trending();
    if (token !== state.requestToken) return;
    const videos = uniqueVideos(Array.isArray(data) ? data : data?.items || []);
    $("#feed").innerHTML = videos.length ? `<div class="video-grid">${videos.map(videoCard).join("")}</div>` : emptyState("Nothing surfaced", "This Piped instance returned an empty trending feed.");
  } catch (error) {
    if (token === state.requestToken) pageError("The harbor is quiet", error.message);
  }
}

async function renderSearch(query) {
  setActiveNav("");
  const token = ++state.requestToken;
  searchInput.value = query;
  app.innerHTML = `<section class="page"><div class="page-head"><div><span class="eyebrow">Search results</span><h1>${escapeHtml(query)}</h1><p>Results stay inside FrameHarbor when opened.</p></div></div><div id="search-results" class="result-list">${Array.from({length: 5}, () => `<div class="result-card"><div class="thumbnail skeleton"></div><div><div class="skeleton-line skeleton"></div><div class="skeleton-line short skeleton"></div></div></div>`).join("")}</div></section>`;
  try {
    const data = await api.search(query);
    if (token !== state.requestToken) return;
    const videos = uniqueVideos(data?.items || data || []);
    $("#search-results").innerHTML = videos.length ? videos.map(resultCard).join("") : emptyState("No videos found", `Nothing matched “${query}”. Try a broader phrase.`, "search");
  } catch (error) {
    if (token === state.requestToken) pageError("Search ran aground", error.message);
  }
}

function addHistory(video) {
  state.history = [video, ...state.history.filter((item) => item.id !== video.id)].slice(0, MAX_HISTORY);
  persist();
}

function isSaved(id) { return state.saved.some((item) => item.id === id); }

function attachPlayer(data, videoId) {
  const video = $("#main-player");
  const overlay = $("#player-overlay");
  const quality = $("#quality-select");
  if (!video) return;
  const progressive = sortProgressiveStreams(data.videoStreams);
  const hls = safeUrl(data.hls);
  const playableHls = hls && video.canPlayType("application/vnd.apple.mpegurl");
  const streams = progressive.length ? progressive : [];

  function useStream(stream) {
    video.src = safeUrl(stream.url);
    video.load();
    overlay.hidden = true;
  }

  if (playableHls) {
    video.src = hls;
    overlay.hidden = true;
  } else if (streams.length) {
    useStream(streams[0]);
    if (quality) {
      quality.innerHTML = streams.map((stream, index) => `<option value="${index}">${escapeHtml(stream.quality || `${stream.height || "?"}p`)}</option>`).join("");
      quality.hidden = streams.length < 2;
      quality.addEventListener("change", () => {
        const time = video.currentTime;
        const paused = video.paused;
        useStream(streams[Number(quality.value)] || streams[0]);
        video.addEventListener("loadedmetadata", () => { video.currentTime = Math.min(time, video.duration || time); if (!paused) video.play().catch(() => {}); }, { once: true });
      });
    }
  } else {
    overlay.innerHTML = `<div class="error-state"><h1>Playback unavailable</h1><p>This video has no browser-compatible combined stream on the current Piped instance.</p><button class="button primary" data-action="retry-watch" data-video-id="${escapeHtml(videoId)}">Try another server</button></div>`;
  }

  for (const subtitle of data.subtitles || []) {
    if (!/vtt/i.test(subtitle.mimeType || "")) continue;
    const track = document.createElement("track");
    track.kind = "subtitles";
    track.label = subtitle.name || subtitle.code;
    track.srclang = subtitle.code || "en";
    track.src = safeUrl(subtitle.url);
    video.append(track);
  }

  video.addEventListener("error", () => {
    overlay.hidden = false;
    overlay.innerHTML = `<div class="error-state"><h1>The stream stopped</h1><p>The current video proxy rejected or expired this stream.</p><button class="button primary" data-action="retry-watch" data-video-id="${escapeHtml(videoId)}">Switch server</button></div>`;
  }, { once: true });
}

function renderComments(data) {
  if (data?.disabled) return `<p class="subtle">Comments are disabled for this video.</p>`;
  const comments = (data?.comments || []).slice(0, 30);
  if (!comments.length) return `<p class="subtle">No comments were returned.</p>`;
  return `<div class="comment-list">${comments.map((comment) => `<article class="comment">
    ${avatar(comment.thumbnail, comment.author, "comment-avatar")}
    <div><div class="comment-head"><b>${escapeHtml(comment.author || "Viewer")}</b><span>${escapeHtml(comment.commentedTime || "")}</span></div>
    <div class="comment-text">${escapeHtml(plainText(comment.commentText || ""))}</div>
    ${comment.likeCount ? `<div class="comment-likes">♡ ${compactNumber(comment.likeCount)}</div>` : ""}</div>
  </article>`).join("")}</div>`;
}

async function renderWatch(videoId, { forceFailover = false } = {}) {
  setActiveNav("");
  const token = ++state.requestToken;
  if (forceFailover) {
    const candidates = api.candidates();
    const currentIndex = candidates.indexOf(state.activeInstance || state.instance);
    state.instance = candidates[(currentIndex + 1 + candidates.length) % candidates.length] || DEFAULT_INSTANCES[0].api;
    persist();
  }
  app.innerHTML = `<section class="watch-page">
    <div><div class="player-shell"><div class="player-overlay" id="player-overlay"><span class="player-spinner" aria-label="Loading video"></span></div><video id="main-player" controls playsinline preload="metadata"></video></div>
    <div class="skeleton-line skeleton" style="height:26px;width:72%;margin-top:20px"></div><div class="skeleton-line skeleton" style="width:45%"></div></div>
    <aside class="watch-side"><div class="section-head" style="margin-top:0"><h2>Up next</h2></div>${Array.from({length: 6}, () => `<div class="related-card" style="margin-bottom:12px"><div class="thumbnail skeleton"></div><div><div class="skeleton-line skeleton"></div><div class="skeleton-line short skeleton"></div></div></div>`).join("")}</aside>
  </section>`;
  try {
    const [data, commentsResult] = await Promise.all([api.streams(videoId), api.comments(videoId).catch(() => null)]);
    if (token !== state.requestToken) return;
    const video = normalizeVideo({ ...data, id: videoId, uploaderAvatar: data.uploaderAvatar || "" });
    addHistory(video);
    const saved = isSaved(videoId);
    app.innerHTML = `<section class="watch-page">
      <div class="watch-main">
        <div class="player-shell"><div class="player-overlay" id="player-overlay"><span class="player-spinner"></span></div><video id="main-player" controls playsinline preload="metadata" poster="${escapeHtml(safeUrl(data.thumbnailUrl))}"></video></div>
        <h1 class="watch-title">${escapeHtml(data.title || "Untitled video")}</h1>
        <div class="watch-meta-row">
          <a class="channel-block" href="${escapeHtml(routeForChannel(data.uploaderUrl) || "#")}" ${routeForChannel(data.uploaderUrl) ? "data-route" : ""}>
            ${avatar(data.uploaderAvatar, data.uploader, "watch-avatar")}
            <span><b>${escapeHtml(data.uploader || "Unknown channel")} ${data.uploaderVerified ? '<span class="verified">●</span>' : ""}</b><small>${compactNumber(data.views || 0)} views · ${escapeHtml(formatDate(data.uploadDate))}</small></span>
          </a>
          <div class="watch-actions">
            <button class="action-pill ${saved ? "active" : ""}" type="button" data-action="toggle-save" data-video-id="${escapeHtml(videoId)}">${icon("bookmark")}<span>${saved ? "Saved" : "Save"}</span></button>
            <button class="action-pill" type="button" data-action="share">${icon("share")}<span>Share</span></button>
            <select class="action-pill" id="quality-select" aria-label="Video quality" hidden></select>
          </div>
        </div>
        <div class="description-box ${String(data.description || "").length > 500 ? "collapsed" : ""}" data-action="expand-description"><strong>${compactNumber(data.likes || 0)} likes</strong> · ${escapeHtml(formatDate(data.uploadDate))}\n\n${escapeHtml(plainText(data.description || "No description provided."))}</div>
        <section class="comments"><div class="section-head"><h2>Comments</h2></div>${renderComments(commentsResult)}</section>
      </div>
      <aside class="watch-side"><div class="section-head" style="margin-top:0"><h2>Up next</h2></div><div class="related-list">${uniqueVideos(data.relatedStreams || []).slice(0, 24).map(relatedCard).join("")}</div></aside>
    </section>`;
    document.title = `${data.title || "Watch"} · FrameHarbor`;
    attachPlayer(data, videoId);
  } catch (error) {
    if (token === state.requestToken) renderEmbedFallback(videoId, error.message);
  }
}

async function renderChannel(channelId) {
  setActiveNav("");
  const token = ++state.requestToken;
  app.innerHTML = `<section class="page"><div class="channel-hero skeleton" style="height:250px"></div>${skeletonGrid(8)}</section>`;
  try {
    const data = await api.channel(channelId);
    if (token !== state.requestToken) return;
    const videos = uniqueVideos(data.relatedStreams || []);
    app.innerHTML = `<section class="page">
      <div class="channel-hero"><div class="channel-banner">${safeUrl(data.bannerUrl) ? `<img src="${escapeHtml(safeUrl(data.bannerUrl))}" alt="" referrerpolicy="no-referrer" />` : ""}</div>
        <div class="channel-profile">${avatar(data.avatarUrl, data.name, "channel-avatar-large")}<div><h1>${escapeHtml(data.name || "Channel")} ${data.verified ? '<span class="verified">●</span>' : ""}</h1><p>${compactNumber(data.subscriberCount || 0)} subscribers</p></div></div>
      </div>
      <div class="section-head"><h2>Videos</h2><span class="subtle">${videos.length} shown</span></div>
      ${videos.length ? `<div class="video-grid">${videos.map(videoCard).join("")}</div>` : emptyState("No videos returned", "This channel feed is empty on the current instance.")}
    </section>`;
    document.title = `${data.name || "Channel"} · FrameHarbor`;
  } catch (error) {
    if (token === state.requestToken) pageError("Channel unavailable", error.message);
  }
}

function renderLibrary(kind) {
  const historyMode = kind === "history";
  setActiveNav(kind);
  const items = historyMode ? state.history : state.saved;
  const title = historyMode ? "Watch history" : "Saved videos";
  const text = historyMode ? "Stored only in this browser." : "Your local watch-later shelf.";
  app.innerHTML = `<section class="page"><div class="page-head"><div><span class="eyebrow">Your library</span><h1>${title}</h1><p>${text}</p></div>${items.length ? `<button class="button secondary" data-action="clear-${kind}">Clear ${historyMode ? "history" : "saved"}</button>` : ""}</div>
    ${items.length ? `<div class="video-grid">${items.map(videoCard).join("")}</div>` : emptyState(historyMode ? "No watch history yet" : "Nothing saved yet", historyMode ? "Videos you open will appear here—locally, without an account." : "Use the Save button beneath a video to keep it here.", historyMode ? "clock" : "bookmark")}
  </section>`;
}

async function renderRoute() {
  window.scrollTo({ top: 0, behavior: "instant" });
  suggestions.hidden = true;
  const route = getRoute(location.search);
  if (route.name !== "watch") document.title = "FrameHarbor";
  if (route.name === "home") return renderHome(false);
  if (route.name === "explore") return renderHome(true);
  if (route.name === "search") return renderSearch(route.query);
  if (route.name === "watch") return renderWatch(route.video);
  if (route.name === "channel") return renderChannel(route.channel);
  if (["history", "saved"].includes(route.name)) return renderLibrary(route.name);
}

function submitSearch(value) {
  const query = String(value || "").trim();
  if (!query) return;
  const directId = videoIdFromUrl(query);
  if (directId) routeTo(routeForVideo(directId));
  else routeTo(`?q=${encodeURIComponent(query)}`);
}

async function updateSuggestions(query) {
  if (query.length < 2) { suggestions.hidden = true; return; }
  try {
    const data = await api.suggestions(query);
    if (searchInput.value.trim() !== query) return;
    const items = (Array.isArray(data) ? data : []).slice(0, 7);
    suggestions.innerHTML = items.map((item) => `<button type="button" data-suggestion="${escapeHtml(item)}">${icon("search")}<span>${escapeHtml(item)}</span></button>`).join("");
    suggestions.hidden = !items.length;
  } catch { suggestions.hidden = true; }
}

function openSettings() {
  populateInstanceSelect();
  $("#region-select").value = state.region;
  $("#instance-select").value = cleanApiUrl(state.instance);
  $("#custom-instance").value = state.instances.some((item) => item.api === state.instance) ? "" : state.instance;
  $("#failover-toggle").checked = state.failover;
  settingsDialog.showModal();
}

function saveSettings() {
  const custom = cleanApiUrl($("#custom-instance").value);
  if ($("#custom-instance").value && !custom) {
    toast("Invalid API URL", "Use a complete HTTPS address.", "error");
    return false;
  }
  state.region = $("#region-select").value;
  state.instance = custom || $("#instance-select").value;
  state.failover = $("#failover-toggle").checked;
  state.activeInstance = "";
  persist();
  settingsDialog.close();
  renderRoute();
  toast("Settings saved", new URL(state.instance).host);
  return true;
}

document.addEventListener("click", (event) => {
  const route = event.target.closest("[data-route]");
  if (route && !event.metaKey && !event.ctrlKey && !event.shiftKey && event.button === 0) {
    event.preventDefault();
    routeTo(route.getAttribute("href"));
    return;
  }
  const video = event.target.closest("[data-video-id]:not(button)");
  if (video && !event.target.closest("a,button,select")) {
    routeTo(routeForVideo(video.dataset.videoId));
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "toggle-nav") document.body.classList.toggle("nav-open");
  if (action === "toggle-theme") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = state.theme;
    persist();
  }
  if (action === "open-settings") openSettings();
  if (action === "save-settings") { event.preventDefault(); saveSettings(); }
  if (action === "retry") renderRoute();
  if (action === "retry-watch") {
    const id = event.target.closest("[data-video-id]")?.dataset.videoId || getRoute(location.search).video;
    renderWatch(id, { forceFailover: true });
  }
  if (action === "share") navigator.clipboard.writeText(location.href).then(() => toast("Link copied", "Ready to share."));
  if (action === "toggle-save") {
    const id = event.target.closest("[data-video-id]").dataset.videoId;
    if (isSaved(id)) state.saved = state.saved.filter((item) => item.id !== id);
    else {
      const item = state.history.find((candidate) => candidate.id === id);
      if (item) state.saved.unshift(item);
    }
    persist();
    const button = event.target.closest("button");
    const saved = isSaved(id);
    button.classList.toggle("active", saved);
    $("span", button).textContent = saved ? "Saved" : "Save";
    toast(saved ? "Saved locally" : "Removed from saved");
  }
  if (action === "expand-description") event.target.closest(".description-box").classList.toggle("collapsed");
  if (action === "clear-history") { state.history = []; persist(); renderLibrary("history"); }
  if (action === "clear-saved") { state.saved = []; persist(); renderLibrary("saved"); }
});

document.addEventListener("keydown", (event) => {
  const card = event.target.closest("[data-video-id]:not(button)");
  if (card && (event.key === "Enter" || event.key === " ")) {
    event.preventDefault();
    routeTo(routeForVideo(card.dataset.videoId));
  }
  if (event.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) {
    event.preventDefault(); searchInput.focus();
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "search-form") { event.preventDefault(); submitSearch(searchInput.value); }
  if (event.target.id === "hero-search") { event.preventDefault(); submitSearch($("input", event.target).value); }
});

document.addEventListener("click", (event) => {
  const suggestion = event.target.closest("[data-suggestion]");
  if (suggestion) submitSearch(suggestion.dataset.suggestion);
  const category = event.target.closest("[data-category]");
  if (category) {
    if (category.dataset.category === "All") routeTo("?page=explore");
    else submitSearch(category.dataset.category);
  }
  if (!event.target.closest(".search-field")) suggestions.hidden = true;
});

searchInput.addEventListener("input", () => {
  clearTimeout(state.suggestionTimer);
  state.suggestionTimer = setTimeout(() => updateSuggestions(searchInput.value.trim()), 230);
});

window.addEventListener("popstate", renderRoute);
document.documentElement.dataset.theme = state.theme;
populateInstanceSelect();
loadInstances();
renderRoute();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("./service-worker.js").catch(() => {});
}
