// Serves a built site the way GitHub Pages does (/docs/faq -> docs/faq.html,
// 404.html for misses), for local previews: node site/serve.mjs [dir] [port]
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const dir = path.resolve(process.argv[2] || "_site");
const port = Number(process.argv[3] || 8080);
const types = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript", ".txt": "text/plain", ".md": "text/markdown", ".xml": "application/xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".ico": "image/x-icon" };

async function find(p) {
  for (const c of [p, `${p}.html`, path.join(p, "index.html")]) {
    try { if ((await stat(c)).isFile()) return c; } catch {}
  }
  return null;
}

createServer(async (req, res) => {
  const url = decodeURIComponent(new URL(req.url, "http://x").pathname);
  const file = await find(path.join(dir, path.normalize(url)));
  const status = file ? 200 : 404;
  const body = await readFile(file || path.join(dir, "404.html"));
  res.writeHead(status, { "content-type": `${types[file ? path.extname(file) : ".html"] || "application/octet-stream"}; charset=utf-8` });
  res.end(body);
}).listen(port, "127.0.0.1", () => console.log(`http://127.0.0.1:${port}`));
