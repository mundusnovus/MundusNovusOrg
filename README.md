# ChristianSystemsOrg

The home of **Christian Systems**: christiansystems.org, Christian Systems Social, the brand, the Chancel typeface,
the soundtrack *Freely Given*, and the tools that package ChristianSprite and ChristianBox for download.

## What is here

| Path | What it is |
| --- | --- |
| `site/` | The website, exactly as it is served. `sprite/`, `box/`, `brand/`, `downloads/files/` and `media/music/roll/` are written by `tools/build.py`. |
| `server.mjs` | Serves the site and Social. Node 24, no packages. |
| `social/` | Social's server: `app.mjs` (the API) and `pds.mjs` (the link to the account server). |
| `site/social/` | Social's app in the browser. |
| `brand/` | Tokens, the host every app stands on (`host/cs-host.js`), logos (`build_brand.py`) and the Chancel font (`font/`). |
| `tools/studio/` | The soundtrack: `album.js` (the tracks), `engine.js` and `covers.js`, made with ChristianBox. |
| `tools/package/` | Builds the desktop downloads (`package.py`) and the macOS shell (`macos/Shell.swift`). |
| `test/` | End-to-end tests for the server and Social. |

## Run it

```bash
node server.mjs
```

Then open http://localhost:8080. Without `PDS_URL`, Social runs in preview: accounts live in memory and disappear when
the server stops.

## Build what the site serves

Check out ChristianSprite and ChristianBox beside this folder, then:

```bash
python3 tools/package/package.py
python3 tools/build.py
```

The first needs a Mac with Swift. Commit what they write under `site/`.

## Remake the soundtrack

```bash
python3 tools/studio/server.py 8790
```

Open http://localhost:8790/ChristianSystemsOrg/tools/studio/soundtrack.html and run `await FG.covers()` then
`await FG.make('all')` in the console. Files go to `site/media/music/`.

## Deploy (Railway)

One service from this repository (it has a `Dockerfile` and `railway.json`), with a volume at `/data`. Set:

| Variable | Value |
| --- | --- |
| `PDS_URL` | The account server, e.g. `https://pds.christiansystems.org` (see ChristianSystemsPDS) |
| `PDS_ADMIN_PASSWORD` | The same admin password the PDS uses |
| `PDS_HANDLE_DOMAIN` | `pds.christiansystems.org` |
| `SESSION_SECRET` | 64 random hex characters. Keep it: it protects stored sessions. |
| `ADMIN_NAMES` | Comma-separated Social names of the moderators |

## Tests

```bash
node --test test/*.test.mjs
```

## License

Free and open source under the **Christian Systems License 1.0** (GPL-3.0-only). See [LICENSING.md](LICENSING.md).
