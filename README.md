# EspoCRM extensions — public site

Catalogue of Alexis Santin's EspoCRM extensions, in English (`/`) and French
(`/fr/`). Each card shows the latest version, its date, a direct download link
to the release ZIP and a link to the documentation.

Versions, dates, ZIP links and the "Recent releases" list are read from each
extension's latest GitHub release at build time. Publishing a release is enough:
an hourly check rebuilds the site and deploys it when a page changed. The
"What's new" and "Release notes" links always open the latest release.

## Layout

| Path | Content |
| --- | --- |
| `data/extensions.json` | The extensions: repository, category, minimum EspoCRM version, screenshot, and texts in English and French |
| `src/strings.mjs` | Interface texts, in English and French |
| `src/assets/` | Stylesheet, script (filter and card animations), favicon, self-hosted Lexend font, screenshots and videos |
| `scripts/build.mjs` | Generates `dist/` (no dependencies, Node 20+) |
| `.github/workflows/deploy.yml` | Deploys to GitHub Pages on push and on demand; every hour, deploys only if the pages changed; builds pull requests without deploying them |

## Add or change an extension

1. Add an entry to `data/extensions.json` (`repo` is the repository name under
   the owner, `category` one of the keys of `categories`, `espocrm` the
   minimum version shown on the card).
2. Put its screenshot in `src/assets/screenshots/` and fill `screenshot` with
   its file name, width and height. `video` can name an MP4 loop played on the
   card (still image first; play/pause button; no autoplay for visitors who ask
   for reduced motion). Without a screenshot (`null`), the card shows `icon`
   (`mail` or `pencil`).

   To turn a demo GIF into a light MP4 loop:

   ```sh
   ffmpeg -i demo.gif -an -vf "fps=15,scale=800:-2:flags=lanczos,format=yuv420p" \
     -c:v libx264 -preset slow -crf 27 -movflags +faststart name.mp4
   ```
3. The repository must be public and have at least one published release with
   a `.zip` asset. Otherwise the build skips the extension with a warning, and
   shows it as soon as it can read its latest release.

## Build locally

```sh
npm run build      # writes dist/
npm run preview    # serves dist/ on http://localhost:4173
```

`GITHUB_TOKEN` (optional) raises the GitHub API rate limit. `SITE_URL`
(optional, set by the workflow) adds the canonical and language links, the
Open Graph image, `sitemap.xml` and `robots.txt`.

## Deployment

In the repository settings, Pages → Build and deployment → Source: **GitHub
Actions**. The workflow does the rest. If a build fails (for example GitHub's
API is down), nothing is deployed and the previous version stays online.

GitHub disables scheduled workflows after 60 days without activity in the
repository: re-enable it from the Actions tab, or run it by hand after a
release.

## Licenses

- The code of this site is released under the MIT license (`LICENSE`), like
  EspoCRM's own build tools.
- The Lexend font is distributed under the SIL Open Font License
  (`src/assets/fonts/OFL-Lexend.txt`).
- Each extension keeps its own license, shown on its card as GitHub detects it
  in the extension's repository. Once every extension has the same license, the
  list says so in one sentence.
- EspoCRM® is a registered trademark of EspoCRM, Inc. The footer says so and
  that the extensions are not affiliated with EspoCRM, Inc.
