import test from "node:test";
import assert from "node:assert/strict";
import {
  channelIdFromPath,
  cleanApiUrl,
  compactNumber,
  formatDuration,
  getRoute,
  normalizeVideo,
  normalizeInvidiousVideo,
  normalizeYoutubeVideo,
  parseApiKeys,
  parseInstanceMarkdown,
  rankRecommendedVideos,
  routeForVideo,
  sortProgressiveStreams,
  uniqueVideos,
  videoIdFromUrl
} from "../lib.js";

test("parses valid HTTPS Piped instances and removes duplicates", () => {
  const markdown = `Name | API | Region\n--- | --- | ---\nOfficial | https://api.example.com | US\nAgain | https://api.example.com/ | US\nUnsafe | http://bad.example.com | US`;
  assert.deepEqual(parseInstanceMarkdown(markdown), [{ name: "Official", api: "https://api.example.com" }]);
});

test("cleans API URLs conservatively", () => {
  assert.equal(cleanApiUrl("https://api.example.com/"), "https://api.example.com");
  assert.equal(cleanApiUrl("http://api.example.com"), "");
  assert.equal(cleanApiUrl("javascript:alert(1)"), "");
});

test("parses, filters, and deduplicates browser-stored API keys", () => {
  const a = "AIzaExampleKeyOne1234567890";
  const b = "AIzaExampleKeyTwo1234567890";
  assert.deepEqual(parseApiKeys(`${a}, ${b}\n${a} short`), [a, b]);
});

test("normalizes YouTube Data API videos", () => {
  const video = normalizeYoutubeVideo({ id: "abc123", snippet: { title: "Demo", channelTitle: "Creator", channelId: "UC1", thumbnails: { high: { url: "https://img.example/demo.jpg" } } }, contentDetails: { duration: "PT1M5S" }, statistics: { viewCount: "1200" } });
  assert.equal(video.id, "abc123");
  assert.equal(video.duration, 65);
  assert.equal(video.views, 1200);
  assert.equal(video.uploaderUrl, "/channel/UC1");
});

test("normalizes Invidious search results", () => {
  const video = normalizeInvidiousVideo({ videoId: "xyz789", title: "Backup", author: "Creator", authorId: "UC2", lengthSeconds: 42, viewCount: 900, videoThumbnails: [{ quality: "medium", url: "https://img.example/backup.jpg" }] });
  assert.equal(video.id, "xyz789");
  assert.equal(video.duration, 42);
  assert.equal(video.uploader, "Creator");
  assert.equal(video.uploaderUrl, "/channel/UC2");
});

test("extracts video and channel IDs", () => {
  assert.equal(videoIdFromUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(videoIdFromUrl("https://youtu.be/dQw4w9WgXcQ"), "dQw4w9WgXcQ");
  assert.equal(channelIdFromPath("/channel/UC123abc"), "UC123abc");
});

test("routes without changing the document path", () => {
  assert.deepEqual(getRoute("?v=abc123"), { name: "watch", video: "abc123" });
  assert.deepEqual(getRoute("?q=retro+games"), { name: "search", query: "retro games" });
  assert.equal(routeForVideo({ url: "/watch?v=abc123", title: "Test" }), "?v=abc123");
});

test("formats durations and numbers", () => {
  assert.equal(formatDuration(65), "1:05");
  assert.equal(formatDuration(3661), "1:01:01");
  assert.match(compactNumber(1200), /1\.2K|1.2K|1K/);
});

test("normalizes and deduplicates video results", () => {
  const videos = uniqueVideos([
    { url: "/watch?v=abc123", title: "One" },
    { url: "/watch?v=abc123", title: "Duplicate" },
    { url: "/watch?v=def456", title: "Two" }
  ]);
  assert.equal(videos.length, 2);
  assert.equal(normalizeVideo(videos[0]).id, "abc123");
});

test("ranks recommendations from watch, save, and search signals", () => {
  const ranked = rankRecommendedVideos([
    { id: "1", title: "Beginner gardening", uploader: "Garden Lab" },
    { id: "2", title: "Advanced Mario combos", uploader: "Smash School" },
    { id: "3", title: "Pasta tonight", uploader: "Kitchen" }
  ], {
    history: [{ id: "h", title: "Mario movement guide", uploader: "Smash School" }],
    saved: [{ id: "s", title: "Kazuya combo routes", uploader: "Smash School" }],
    searches: ["Mario combos"]
  });
  assert.equal(ranked[0].id, "2");
});

test("selects progressive streams from highest quality down", () => {
  const streams = sortProgressiveStreams([
    { url: "a", height: 360, videoOnly: false },
    { url: "b", height: 1080, videoOnly: true },
    { url: "c", height: 720, videoOnly: false }
  ]);
  assert.deepEqual(streams.map((stream) => stream.url), ["c", "a"]);
});
