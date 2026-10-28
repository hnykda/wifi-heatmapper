# Website

The source of <https://wifi-heatmapper.danielalder.cz>. Plain HTML, CSS and a
little JavaScript; no framework. GitHub Pages serves it, built by
[`.github/workflows/site.yml`](../.github/workflows/site.yml) on every push to
`main` that touches `site/` or `docs/`, and on every published release.

## One copy of the docs

The user guide is the Markdown in [`docs/guide/`](../docs/guide). It reads fine
on GitHub, and `build.mjs` renders the same files to `/docs/<file name>` on the
site. Edit the Markdown, never generated HTML.

| On the site | Comes from |
|---|---|
| `/` | `index.html` (+ `partials/`); the Documentation list is generated from the guide |
| `/docs/<slug>` | `docs/guide/<slug>.md`, ordered by `order` in its front matter |
| `/docs/<slug>.md` | the same file with absolute links, for tools and AI assistants |
| `/docs/images/*` | `docs/images/*` |
| `/llms.txt` | `llms.txt`, with the guide's titles and descriptions filled in |
| `/llms-full.txt` | every guide page in one file |
| `/sitemap.xml`, `/404.html` | generated / `partials/404.html` |
| Version and download links | the latest published GitHub release |

Every guide page starts with front matter:

```markdown
---
title: Measuring speed with iperf3
description: One sentence; shown under the title, in the docs list and in llms.txt.
order: 4
---
```

Link between guide pages with relative links (`[FAQ](faq.md#where-is-my-data)`)
and to anything else in the repository with relative paths too: the build turns
them into site URLs or GitHub links, and fails on a link to a file that does not
exist. Heading anchors match GitHub's, so `#anchors` work in both places.

Developer documentation (`docs/dev/`, `CONTRIBUTING.md`) stays on GitHub and is
linked from `llms.txt`.

## Build and preview

```bash
npm --prefix site ci
npm --prefix site run serve      # builds into _site/, serves http://127.0.0.1:8080
```

`VERSION=0.7.0` skips asking GitHub for the latest release.

## Hosting

GitHub Pages with source "GitHub Actions". The custom domain
`wifi-heatmapper.danielalder.cz` is set in the repository's Settings → Pages:
with Actions deployments GitHub ignores a `CNAME` file. DNS: a `CNAME` record
`wifi-heatmapper` → `hnykda.github.io` in Cloudflare, DNS only (not proxied),
so GitHub can issue the certificate.
