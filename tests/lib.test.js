import test from "node:test";
import assert from "node:assert/strict";
import {
  channelIdFromPath,
  cleanApiUrl,
  compactNumber,
  formatDuration,
  getRoute,
  normalizeVideo,
  parseInstanceMarkdown,
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

test("selects progressive streams from highest quality down", () => {
  const streams = sortProgressiveStreams([
    { url: "a", height: 360, videoOnly: false },
    { url: "b", height: 1080, videoOnly: true },
    { url: "c", height: 720, videoOnly: false }
  ]);
  assert.deepEqual(streams.map((stream) => stream.url), ["c", "a"]);
});
