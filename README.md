# FrameHarbor

FrameHarbor is a dependency-free, single-page video browser powered by public [Piped](https://github.com/TeamPiped/Piped) instances. It provides search, trending feeds, in-page playback, related videos, channel pages, comments, local history, saved videos, themes, regions, and automatic instance failover.

## What it does

- Keeps search, channel, library, and watch navigation inside one browser tab.
- Uses Piped's unauthenticated public endpoints; no API key is stored or required.
- Discovers current instances from TeamPiped's public documentation and retains a bundled fallback list.
- Stores settings, watch history, and saved videos only in the current browser.
- Runs as static HTML, CSS, and JavaScript on GitHub Pages.

## Local preview

Serve the directory with any static server. For example:

```bash
python -m http.server 4173
```

Then open `http://localhost:4173`.

## Checks

```bash
npm test
npm run check
```

## Deployment

The included Pages workflow uploads this directory as a static Pages artifact whenever `main` is pushed. In the repository's **Settings → Pages**, select **GitHub Actions** as the source once.

## Important limitations

FrameHarbor does not bypass geographic, age, copyright, or account restrictions. Playback depends on the availability and configuration of independent public Piped instances, and some videos expose only separate audio/video streams that a dependency-free browser player cannot combine. FrameHarbor is not affiliated with or endorsed by YouTube, Google, or TeamPiped.

## License

MIT
