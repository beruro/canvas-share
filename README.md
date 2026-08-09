# ORGII Canvas Share Viewer

Static viewer for self-contained Canvas links created by ORGII. The selected
Canvas snapshot is gzip-compressed into the URL fragment, so opening a link does
not send the snapshot, conversation, session, or repository data to the viewer
host.

## Share protocol

```text
#/share/g1/<base64url(gzip(JSON envelope))>
```

Version 1 envelopes contain only the selected Canvas:

```json
{
  "version": 1,
  "canvas": {
    "mode": "html | react | a2ui | url",
    "title": "Optional title",
    "content": "HTML, React source, or A2UI JSONL",
    "url": "https://example.com (URL mode only)"
  }
}
```

- React and HTML source runs inside an iframe without `allow-same-origin`.
- React, ReactDOM, and the compiled Canvas source are inlined into the sandbox;
  the runtime does not depend on a CDN.
- Invalid versions, malformed payloads, local URLs, and session-shaped data are
  rejected at the decode boundary.
- Anyone with a complete link can read the snapshot. The fragment is transport,
  not encryption.

The ORGII generator lives in `src/features/CanvasShare` in the ORGII repository.
Set `REACT_APP_CANVAS_SHARE_VIEWER_URL` at build time to point ORGII at another
deployment of this viewer.

## Gallery routes

The original interactive examples remain available:

- `#/flow` — Flow Field
- `#/sketch` — Sketch Board
- `#/physics` — Physics Toy

The heavier share runtime is route-split and is not loaded by gallery visits.

## Development

```bash
npm install
npm run dev
npm run build
```

Run the focused protocol regression test with the workspace Vitest binary:

```bash
../node_modules/.bin/vitest run src/shareProtocol.test.ts
```

## Deployment

```bash
npm run deploy
```

The deploy script publishes `dist/` to the `gh-pages` branch.
