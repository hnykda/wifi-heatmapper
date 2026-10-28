// Builds the website into an output folder (default: _site).
//
//   npm --prefix site ci && node site/build.mjs [out-dir]
//
// The landing page is site/index.html. Everything under /docs is rendered
// from docs/guide/*.md, the same files people read on GitHub, so there is
// one copy of the documentation. llms.txt, llms-full.txt and sitemap.xml are
// generated from those files too. See site/README.md.
//
// Env: VERSION (default: latest published GitHub release).

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Marked } from "marked";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const OUT = path.resolve(process.argv[2] || path.join(ROOT, "_site"));
const REPO = "hnykda/wifi-heatmapper";
const GITHUB = `https://github.com/${REPO}`;
const ORIGIN = "https://wifi-heatmapper.danielalder.cz";
const GUIDE_DIR = "docs/guide";
const IMAGES_DIR = "docs/images";
const DATE = new Date().toISOString().slice(0, 10);

// ---- version ---------------------------------------------------------------

async function latestVersion() {
  if (process.env.VERSION) return process.env.VERSION;
  try {
    return execFileSync("gh", ["release", "view", "--repo", REPO, "--json", "tagName", "-q", ".tagName"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`);
    if (!res.ok) throw new Error(`GitHub API: ${res.status}`);
    return (await res.json()).tag_name;
  }
}
const VERSION = (await latestVersion()).replace(/^v/, "");
if (!/^\d+\.\d+\.\d+$/.test(VERSION)) throw new Error(`bad VERSION "${VERSION}"`);

// ---- reading the guide -----------------------------------------------------

function parseFrontMatter(src, file) {
  const m = src.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) throw new Error(`${file}: missing front matter (title, description, order)`);
  const data = {};
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  for (const key of ["title", "description", "order"]) {
    if (!data[key]) throw new Error(`${file}: front matter needs "${key}"`);
  }
  return { data, body: src.slice(m[0].length) };
}

const pages = readdirSync(path.join(ROOT, GUIDE_DIR))
  .filter((f) => f.endsWith(".md"))
  .map((f) => {
    const file = `${GUIDE_DIR}/${f}`;
    const { data, body } = parseFrontMatter(readFileSync(path.join(ROOT, file), "utf8"), file);
    // The page template prints the title, so drop the Markdown's own H1.
    const content = body.replace(/^\s*# .*\n+/, "");
    return { slug: f.slice(0, -3), file, title: data.title, description: data.description, order: Number(data.order), content };
  })
  .sort((a, b) => a.order - b.order);
if (!pages.length) throw new Error(`${GUIDE_DIR} is empty`);
const slugs = new Set(pages.map((p) => p.slug));

// ---- links -----------------------------------------------------------------

// Rewrites a link written for GitHub (relative to the Markdown file) into the
// URL it should have on the site. `absolute` gives full URLs (for .md twins
// and llms-full.txt, which are read out of context).
function rewriteHref(href, fromFile, absolute) {
  if (!href || /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith("//")) return href;
  const site = absolute ? ORIGIN : "";
  if (href.startsWith("#")) return absolute ? `${ORIGIN}/docs/${path.basename(fromFile, ".md")}${href}` : href;
  if (href.startsWith("/")) return `${site}${href}`;
  const [rel, hash = ""] = href.split("#");
  const target = path.posix.normalize(path.posix.join(path.posix.dirname(fromFile), rel));
  const anchor = hash ? `#${hash}` : "";
  const guide = target.match(/^docs\/guide\/([\w-]+)\.md$/);
  if (guide && slugs.has(guide[1])) return `${site}/docs/${guide[1]}${anchor}`;
  if (target.startsWith(`${IMAGES_DIR}/`)) return `${site}/docs/images/${target.slice(IMAGES_DIR.length + 1)}`;
  if (target.startsWith("..")) throw new Error(`${fromFile}: link outside the repository: ${href}`);
  if (!existsSync(path.join(ROOT, target))) throw new Error(`${fromFile}: broken link ${href} (${target})`);
  const kind = path.extname(target) ? "blob" : "tree";
  return `${GITHUB}/${kind}/main/${target}${anchor}`;
}

// Same anchors as GitHub, so #links work in both places.
function slugger() {
  const seen = new Map();
  return (text) => {
    let slug = text.toLowerCase().trim().replace(/[^\p{L}\p{N}\s_-]/gu, "").replace(/\s/g, "-");
    const n = seen.get(slug) || 0;
    seen.set(slug, n + 1);
    return n ? `${slug}-${n}` : slug;
  };
}

const decode = (s) => s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
const escapeHtml = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function renderPage(page) {
  const slug = slugger();
  const toc = [];
  const md = new Marked({ gfm: true });
  md.use({
    walkTokens(token) {
      if (token.type === "link" || token.type === "image") token.href = rewriteHref(token.href, page.file, false);
    },
    renderer: {
      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const id = slug(decode(html.replace(/<[^>]+>/g, "")));
        if (depth === 2) toc.push({ id, html });
        return `<h${depth} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true" tabindex="-1">#</a>${html}</h${depth}>\n`;
      },
    },
  });
  const html = md.parse(page.content).replace(/<table>/g, '<div class="table-wrap"><table>').replace(/<\/table>/g, "</table></div>");
  return { html, toc };
}

// Markdown with absolute links, for /docs/<slug>.md and llms-full.txt.
function markdownTwin(page) {
  return `# ${page.title}\n\n${page.content}`
    .replace(/(!?\[[^\]]*\])\(([^)\s]+)\)/g, (_, label, href) => `${label}(${rewriteHref(href, page.file, true)})`)
    .replace(/^(\[[^\]]+\]:\s*)(\S+)/gm, (_, label, href) => `${label}${rewriteHref(href, page.file, true)}`);
}

// ---- templates -------------------------------------------------------------

const read = (f) => readFileSync(path.join(SITE, f), "utf8");
const HEADER = read("partials/header.html");
const FOOTER = read("partials/footer.html");

function fill(template, vars) {
  const out = template.replace(/\{\{([A-Z_]+)\}\}/g, (m, key) => {
    if (!(key in vars)) throw new Error(`no value for ${m}`);
    return vars[key];
  });
  return out;
}

const common = { VERSION, HEADER, DATE };

function docPage(page, i) {
  const { html, toc } = renderPage(page);
  const prev = pages[i - 1];
  const next = pages[i + 1];
  const nav = pages
    .map((p) => `<li><a href="/docs/${p.slug}"${p === page ? ' aria-current="page"' : ""}>${escapeHtml(p.title)}</a></li>`)
    .join("\n");
  const onPage = toc.length > 1
    ? `<nav class="toc" aria-label="On this page"><p>On this page</p><ul>${toc.map((t) => `<li><a href="#${t.id}">${t.html}</a></li>`).join("")}</ul></nav>`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(page.title)} · Wi-Fi Heatmapper</title>
<meta name="description" content="${escapeHtml(page.description)}">
<link rel="canonical" href="${ORIGIN}/docs/${page.slug}">
<link rel="alternate" type="text/markdown" href="/docs/${page.slug}.md" title="This page as Markdown">
<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" href="/img/favicon-32.png" type="image/png">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<meta property="og:title" content="${escapeHtml(page.title)} · Wi-Fi Heatmapper">
<meta property="og:description" content="${escapeHtml(page.description)}">
<meta property="og:image" content="${ORIGIN}/img/og.jpg">
<link rel="stylesheet" href="/style.css">
</head>
<body>
<a class="skip" href="#main">Skip to content</a>
${HEADER}
<div class="wrap docs">
  <nav class="docs-nav" aria-label="Guide">
    <p class="docs-nav__title">Guide</p>
    <ol>
${nav}
    </ol>
  </nav>
  <main id="main" class="doc">
    <h1>${escapeHtml(page.title)}</h1>
    <p class="doc__lede">${escapeHtml(page.description)}</p>
    ${onPage}
    <article class="prose">
${html}
    </article>
    <nav class="pager" aria-label="Previous and next page">
      ${prev ? `<a class="pager__prev" href="/docs/${prev.slug}"><span>Previous</span>${escapeHtml(prev.title)}</a>` : "<span></span>"}
      ${next ? `<a class="pager__next" href="/docs/${next.slug}"><span>Next</span>${escapeHtml(next.title)}</a>` : "<span></span>"}
    </nav>
  </main>
</div>
${fill(FOOTER, { EDIT_URL: `${GITHUB}/edit/main/${page.file}` })}
</body>
</html>
`;
}

// ---- write -----------------------------------------------------------------

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "docs"), { recursive: true });
for (const f of readdirSync(SITE)) {
  if (["partials", "node_modules", "build.mjs", "serve.mjs", "package.json", "package-lock.json", "README.md", "index.html", "llms.txt"].includes(f)) continue;
  cpSync(path.join(SITE, f), path.join(OUT, f), { recursive: true });
}
cpSync(path.join(ROOT, IMAGES_DIR), path.join(OUT, "docs/images"), { recursive: true });

const docsList = pages
  .map((p) => `    <li><a href="/docs/${p.slug}">${escapeHtml(p.title)}</a><span>${escapeHtml(p.description)}</span></li>`)
  .join("\n");
writeFileSync(
  path.join(OUT, "index.html"),
  fill(read("index.html"), { ...common, DOCS_LIST: docsList, FOOTER: fill(FOOTER, { EDIT_URL: `${GITHUB}/blob/main/site/index.html` }) }),
);

const twins = [];
pages.forEach((page, i) => {
  writeFileSync(path.join(OUT, "docs", `${page.slug}.html`), docPage(page, i));
  const twin = markdownTwin(page);
  writeFileSync(path.join(OUT, "docs", `${page.slug}.md`), twin);
  twins.push({ page, twin });
});
// /docs and /docs/ go to the first page.
writeFileSync(
  path.join(OUT, "docs", "index.html"),
  `<!doctype html><meta charset="utf-8"><title>Wi-Fi Heatmapper docs</title><meta http-equiv="refresh" content="0; url=/docs/${pages[0].slug}"><link rel="canonical" href="${ORIGIN}/docs/${pages[0].slug}"><a href="/docs/${pages[0].slug}">${escapeHtml(pages[0].title)}</a>\n`,
);

const guideLinks = pages.map((p) => `- [${p.title}](${ORIGIN}/docs/${p.slug}.md): ${p.description}`).join("\n");
writeFileSync(path.join(OUT, "llms.txt"), fill(read("llms.txt"), { ...common, GUIDE_LINKS: guideLinks }));
writeFileSync(
  path.join(OUT, "llms-full.txt"),
  [
    `# Wi-Fi Heatmapper: the full guide (version ${VERSION})`,
    `Generated on ${DATE} from ${GITHUB}/tree/main/${GUIDE_DIR}. Index: ${ORIGIN}/llms.txt`,
    ...twins.map(({ page, twin }) => `---\nSource: ${ORIGIN}/docs/${page.slug}\n\n${twin.trim()}`),
  ].join("\n\n") + "\n",
);

const urls = ["/", ...pages.map((p) => `/docs/${p.slug}`), "/llms.txt", "/llms-full.txt"];
writeFileSync(
  path.join(OUT, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${ORIGIN}${u}</loc><lastmod>${DATE}</lastmod></url>`)
    .join("\n")}\n</urlset>\n`,
);

writeFileSync(
  path.join(OUT, "404.html"),
  fill(read("partials/404.html"), { ...common, FOOTER: fill(FOOTER, { EDIT_URL: `${GITHUB}/tree/main/site` }) }),
);

console.log(`Built ${path.relative(process.cwd(), OUT) || OUT}: v${VERSION}, ${pages.length} guide pages`);
