export const DEFAULT_INSTANCES = [
  { name: "Kavin Rocks · Official", api: "https://pipedapi.kavin.rocks" },
  { name: "Leptons", api: "https://pipedapi.leptons.xyz" },
  { name: "Moomoo", api: "https://pipedapi.moomoo.me" },
  { name: "Syncpundit", api: "https://pipedapi.syncpundit.io" },
  { name: "MHA", api: "https://api-piped.mha.fi" },
  { name: "Garuda Linux", api: "https://piped-api.garudalinux.org" }
];

export const INSTANCE_LIST_URL =
  "https://raw.githubusercontent.com/TeamPiped/documentation/refs/heads/main/content/docs/public-instances/index.md";

export function cleanApiUrl(value = "") {
  const trimmed = String(value).trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" ? url.origin + url.pathname.replace(/\/$/, "") : "";
  } catch {
    return "";
  }
}

export function parseApiKeys(value = "") {
  return [...new Set(String(value)
    .split(/[\s,;]+/)
    .map((key) => key.trim())
    .filter((key) => key.length >= 20))];
}

export function isoDurationToSeconds(value = "") {
  const match = String(value).match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  return (Number(match[1]) || 0) * 86400 + (Number(match[2]) || 0) * 3600 + (Number(match[3]) || 0) * 60 + (Number(match[4]) || 0);
}

export function normalizeYoutubeVideo(item = {}) {
  const snippet = item.snippet || {};
  const id = typeof item.id === "string" ? item.id : item.id?.videoId;
  return normalizeVideo({
    id,
    title: snippet.title,
    thumbnail: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url || snippet.thumbnails?.default?.url,
    duration: isoDurationToSeconds(item.contentDetails?.duration),
    views: item.statistics?.viewCount,
    uploadedDate: snippet.publishedAt,
    uploaderName: snippet.channelTitle,
    uploaderUrl: snippet.channelId ? `/channel/${snippet.channelId}` : "",
    shortDescription: snippet.description,
    isLive: snippet.liveBroadcastContent === "live"
  });
}

export function parseInstanceMarkdown(markdown = "") {
  const seen = new Set();
  return String(markdown)
    .split("\n")
    .map((line) => line.split("|").map((part) => part.trim()))
    .filter((parts) => parts.length >= 3 && /^https:\/\//.test(parts[1] || ""))
    .map((parts) => ({ name: parts[0].replace(/\*+/g, "").trim(), api: cleanApiUrl(parts[1]) }))
    .filter((item) => item.api && !seen.has(item.api) && seen.add(item.api));
}

export function videoIdFromUrl(value = "") {
  const raw = String(value);
  const match = raw.match(/[?&]v=([\w-]{6,})/) || raw.match(/\/shorts\/([\w-]{6,})/) || raw.match(/youtu\.be\/([\w-]{6,})/);
  return match?.[1] || "";
}

export function idFromPath(value = "") {
  return String(value).match(/[?&]v=([\w-]+)/)?.[1] || String(value).match(/\/watch\/([\w-]+)/)?.[1] || "";
}

export function channelIdFromPath(value = "") {
  return String(value).match(/\/channel\/([^/?]+)/)?.[1] || "";
}

export function compactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat(undefined, { notation: "compact", maximumFractionDigits: 1 }).format(number);
}

export function formatDuration(totalSeconds) {
  const value = Number(totalSeconds);
  if (!Number.isFinite(value) || value <= 0) return "";
  const seconds = Math.floor(value % 60);
  const minutes = Math.floor((value / 60) % 60);
  const hours = Math.floor(value / 3600);
  return hours
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDate(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "numeric" }).format(date);
}

export function normalizeVideo(item = {}) {
  const url = item.url || item.videoUrl || "";
  return {
    id: item.id || videoIdFromUrl(url) || idFromPath(url),
    url,
    title: item.title || "Untitled video",
    thumbnail: item.thumbnail || item.thumbnailUrl || "",
    duration: Number(item.duration) || 0,
    views: Number(item.views) || 0,
    uploaded: item.uploadedDate || item.uploadDate || "",
    uploader: item.uploaderName || item.uploader || "Unknown channel",
    uploaderUrl: item.uploaderUrl || "",
    uploaderAvatar: item.uploaderAvatar || "",
    verified: Boolean(item.uploaderVerified),
    description: item.shortDescription || item.description || "",
    type: item.type || "stream",
    livestream: Boolean(item.isLive || item.livestream)
  };
}

export function getRoute(search = "") {
  const params = new URLSearchParams(search);
  const video = params.get("v");
  const query = params.get("q");
  const channel = params.get("channel");
  const page = params.get("page");
  if (video) return { name: "watch", video };
  if (query) return { name: "search", query };
  if (channel) return { name: "channel", channel };
  if (["explore", "history", "saved"].includes(page)) return { name: page };
  return { name: "home" };
}

export function routeForVideo(item) {
  const id = typeof item === "string" ? item : normalizeVideo(item).id;
  return id ? `?v=${encodeURIComponent(id)}` : "./";
}

export function routeForChannel(path) {
  const id = channelIdFromPath(path);
  return id ? `?channel=${encodeURIComponent(id)}` : "";
}

export function uniqueVideos(items = []) {
  const seen = new Set();
  return items.map(normalizeVideo).filter((video) => video.id && !seen.has(video.id) && seen.add(video.id));
}

export function sortProgressiveStreams(streams = []) {
  return [...streams]
    .filter((stream) => stream?.url && !stream.videoOnly)
    .sort((a, b) => (Number(b.height) || 0) - (Number(a.height) || 0));
}

export function plainText(value = "") {
  const temp = document.createElement("textarea");
  temp.innerHTML = String(value);
  return temp.value;
}
