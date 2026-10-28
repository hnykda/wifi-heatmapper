// Two small jobs: the clickable floor plan in the hero, and pointing the
// Download button at the right installer for this visitor's system.

(() => {
  "use strict";

  // ---- Heat map demo -------------------------------------------------------
  // Plan units: 100 x 62, same as the SVG viewBox. Signal is simulated from a
  // router position, distance and the number of walls in the way, then drawn
  // with inverse-distance weighting and the app's default colour stops.

  const W = 100;
  const H = 62;
  const ROUTER = { x: 12, y: 52 };
  const STOPS = [
    [0, [255, 0, 0]],
    [0.45, [255, 255, 0]],
    [0.5, [0, 0, 255]],
    [0.6, [0, 255, 255]],
    [0.75, [0, 255, 0]],
    [1, [0, 255, 0]],
  ];
  // Wall segments [x1, y1, x2, y2]; gaps between segments are doors.
  const WALLS = [
    [2, 2, 98, 2], [98, 2, 98, 60], [98, 60, 2, 60], [2, 60, 2, 2],
    [30, 2, 30, 10], [30, 16, 30, 24],
    [2, 24, 34, 24], [42, 24, 50, 24],
    [50, 2, 50, 36], [50, 44, 50, 60],
    [50, 32, 70, 32], [78, 32, 98, 32],
    [74, 32, 74, 40], [74, 48, 74, 60],
  ];
  const ROOMS = [
    ["Kitchen", 4, 6], ["Bath", 32, 6], ["Living room", 4, 28],
    ["Bedroom", 52, 6], ["Office", 52, 36], ["Kids’ room", 76, 36],
  ];
  const SEED = [
    { x: 22, y: 46 }, { x: 16, y: 14 }, { x: 40, y: 38 },
    { x: 62, y: 50 }, { x: 80, y: 16 },
  ];

  const plan = document.getElementById("demo");
  const canvas = document.getElementById("demo-heat");
  const svg = document.getElementById("demo-svg");
  const reset = document.getElementById("demo-reset");
  if (!plan || !canvas || !svg) return;

  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let points = [];
  let busy = false;
  let timers = [];

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    for (const k in attrs) node.setAttribute(k, attrs[k]);
    (parent || svg).appendChild(node);
    return node;
  }

  function crosses(ax, ay, bx, by, [cx, cy, dx, dy]) {
    const d = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
    if (d === 0) return false;
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / d;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / d;
    return t > 0 && t < 1 && u > 0 && u < 1;
  }

  // Returns signal strength as 0..1 (0 = -100 dBm, 1 = -40 dBm, as in the app).
  function measure(x, y) {
    const dist = Math.hypot(x - ROUTER.x, y - ROUTER.y);
    const walls = WALLS.filter((w) => crosses(ROUTER.x, ROUTER.y, x, y, w)).length;
    const noise = (Math.random() - 0.5) * 3;
    const dbm = -36 - 26 * Math.log10(1 + dist / 5) - 9 * walls + noise;
    return Math.max(0, Math.min(1, (dbm + 100) / 60));
  }

  function colourAt(v) {
    for (let i = 1; i < STOPS.length; i++) {
      const [p1, c1] = STOPS[i];
      if (v <= p1) {
        const [p0, c0] = STOPS[i - 1];
        const t = (v - p0) / (p1 - p0 || 1);
        return c0.map((c, j) => Math.round(c + (c1[j] - c) * t));
      }
    }
    return STOPS[STOPS.length - 1][1];
  }

  // Low-resolution IDW render, scaled up smoothly by the browser.
  const RES = 2; // cells per plan unit
  canvas.width = W * RES;
  canvas.height = H * RES;
  const ctx = canvas.getContext("2d");

  function drawHeat() {
    const img = ctx.createImageData(canvas.width, canvas.height);
    if (points.length) {
      for (let py = 0; py < canvas.height; py++) {
        for (let px = 0; px < canvas.width; px++) {
          const x = (px + 0.5) / RES;
          const y = (py + 0.5) / RES;
          let num = 0;
          let den = 0;
          let nearest = Infinity;
          for (const p of points) {
            const d2 = (x - p.x) ** 2 + (y - p.y) ** 2;
            nearest = Math.min(nearest, d2);
            const w = 1 / Math.max(d2, 0.01);
            num += w * p.v;
            den += w;
          }
          // Fade out far from any measurement, like the app's radius.
          const reach = Math.max(0, 1 - Math.sqrt(nearest) / 34);
          const [r, g, b] = colourAt(num / den);
          const i = (py * canvas.width + px) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = Math.round(135 * Math.min(1, reach * 1.6));
        }
      }
    }
    ctx.putImageData(img, 0, 0);
  }

  function drawPlan() {
    svg.textContent = "";
    for (const [x1, y1, x2, y2] of WALLS) el("line", { class: "wall", x1, y1, x2, y2 });
    for (const [name, x, y] of ROOMS) el("text", { class: "room", x, y }).textContent = name;
    // Router: a small wave icon.
    const g = el("g", { class: "router-g", transform: `translate(${ROUTER.x} ${ROUTER.y})` });
    el("circle", { class: "router", r: 0.9 }, g);
    for (const r of [2, 3.4]) {
      el("path", { d: `M ${-r * 0.7} ${-r * 0.7} A ${r} ${r} 0 0 1 ${r * 0.7} ${-r * 0.7}`, fill: "none", stroke: "var(--brand)", "stroke-width": 0.45, "stroke-linecap": "round" }, g);
    }
    for (const p of points) drawDot(p, false);
  }

  function drawDot(p, fresh) {
    const [r, g, b] = colourAt(p.v);
    el("circle", { class: "dot" + (fresh ? " dot-new" : ""), cx: p.x, cy: p.y, r: 1.3, fill: `rgb(${r} ${g} ${b})` });
    el("text", { class: "dot-label", x: p.x, y: p.y - 2.2, "text-anchor": "middle" }).textContent = `${Math.round(p.v * 100)}%`;
  }

  function add(x, y, fresh) {
    const p = { x, y, v: measure(x, y) };
    points.push(p);
    drawHeat();
    drawDot(p, fresh);
  }

  function takeMeasurement(x, y) {
    if (busy || points.length >= 40) return;
    busy = true;
    const ring = el("circle", { class: "pulse", cx: x, cy: y, r: 2.4 });
    timers.push(setTimeout(() => {
      ring.remove();
      add(x, y, true);
      busy = false;
    }, reduceMotion ? 0 : 650));
  }

  function start() {
    timers.forEach(clearTimeout);
    timers = [];
    busy = false;
    points = [];
    drawPlan();
    drawHeat();
    // The one orchestrated moment: seed points land one after another.
    SEED.forEach((p, i) => {
      if (reduceMotion) add(p.x, p.y, false);
      else timers.push(setTimeout(() => add(p.x, p.y, true), 350 + i * 260));
    });
  }

  plan.addEventListener("click", (e) => {
    const box = plan.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * W;
    const y = ((e.clientY - box.top) / box.height) * H;
    if (x < 2.5 || x > 97.5 || y < 2.5 || y > 59.5) return;
    takeMeasurement(x, y);
  });
  reset && reset.addEventListener("click", start);
  start();
})();

(() => {
  "use strict";

  // ---- Download button -----------------------------------------------------
  const primary = document.getElementById("dl-primary");
  if (!primary) return;
  const ua = navigator.userAgent;
  const platform = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "";
  const mobile = /Android|iPhone|iPad|iPod/i.test(ua);
  let os = null;
  if (!mobile) {
    if (/Mac/i.test(platform) || /Mac OS X/.test(ua)) os = "mac";
    else if (/Win/i.test(platform)) os = "win";
    else if (/Linux|X11/i.test(platform + ua)) os = "linux";
  }
  const card = os && document.querySelector(`.platform[data-os="${os}"]`);
  if (!card) {
    primary.textContent = "Download";
    primary.setAttribute("href", "#download");
    return;
  }
  card.classList.add("is-yours");
  const label = { mac: "Download for Mac", win: "Download for Windows", linux: "Download for Linux" }[os];
  const first = card.querySelector("li a");
  primary.textContent = label;
  // Linux has four builds; let people pick. Macs: Apple silicon by default,
  // with Intel one line below in the download section.
  primary.setAttribute("href", os === "linux" ? "#download" : first.getAttribute("href"));
  const other = document.getElementById("dl-other");
  if (other && os === "mac") other.textContent = "Intel Mac or other systems";
})();

(() => {
  "use strict";
  for (const btn of document.querySelectorAll("button[data-copy]")) {
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        btn.textContent = "Copied";
      } catch {
        btn.textContent = "Select and copy";
      }
      setTimeout(() => (btn.textContent = "Copy"), 1600);
    });
  }
})();
