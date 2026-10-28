"use client";
import React, {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  type Size,
  type View,
  type XY,
  clampView,
  fitScale,
  fitView,
  frameSize,
  frameToImage,
  imageToFrame,
  panBy,
  stepZoom,
  viewTransform,
  wheelZoomFactor,
  zoomAt,
} from "@/lib/zoom-pan";

/** Movement (CSS px) after which a press is a drag, not a click. */
const DRAG_THRESHOLD = { mouse: 4, touch: 8 };

function subscribeResize(onChange: () => void) {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}
const windowHeight = () => window.innerHeight;
const serverWindowHeight = () => 800;

/** Safari's trackpad pinch (WebKit sends these instead of ctrl + wheel). */
type GestureEvent = UIEvent & {
  scale: number;
  clientX: number;
  clientY: number;
};

type Gesture =
  | { kind: "press"; id: number; x: number; y: number; threshold: number }
  | { kind: "pan"; id: number; x: number; y: number }
  | { kind: "pinch"; dist: number; mid: XY; zoom: number };

export type ZoomPan = ReturnType<typeof useZoomPan>;

/**
 * Zoom and pan state for one image shown in a ZoomPanViewport. The view
 * lives here, per component: it is not saved, and a new `resetKey` (a new
 * floor plan, another heat map) goes back to fit.
 *
 * - ctrl/cmd + wheel and trackpad pinch zoom at the cursor; a plain wheel
 *   scrolls the page as usual.
 * - Dragging pans. A press that moves less than a few px is a click; after
 *   a drag the click is swallowed, so it doesn't measure or select.
 * - Two fingers pinch on touch screens.
 * - With the frame focused: + / - zoom, 0 fits, arrow keys pan.
 */
export function useZoomPan({
  image,
  resetKey,
  maxHeight,
}: {
  /** The image's natural size; null until it has loaded. */
  image: Size | null;
  resetKey: string;
  /** The tallest the frame may be, given the window's inner height. */
  maxHeight: (windowHeight: number) => number;
}) {
  // Elements through callback refs: the effects below re-run when they appear
  const [outerEl, setOuterEl] = useState<HTMLDivElement | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [availWidth, setAvailWidth] = useState(0);
  const winHeight = useSyncExternalStore(
    subscribeResize,
    windowHeight,
    serverWindowHeight,
  );

  useEffect(() => {
    const el = outerEl;
    if (!el) return;
    const ro = new ResizeObserver(() => setAvailWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, [outerEl]);

  const img: Size = image ?? { width: 1, height: 1 };
  const fit = fitScale(img, {
    width: availWidth,
    height: maxHeight(winHeight),
  });
  const frame = frameSize(img, fit);
  const ready = !!image && availWidth > 0;

  const [stored, setStored] = useState<{ key: string; view: View } | null>(
    null,
  );
  const current = (s: typeof stored) =>
    s && s.key === resetKey ? clampView(s.view, img) : fitView(img);
  const view = current(stored);
  const update = (fn: (v: View) => View) =>
    setStored((s) => ({ key: resetKey, view: clampView(fn(current(s)), img) }));

  const { scale, offsetX, offsetY } = viewTransform(view, frame, fit);
  const [dragging, setDragging] = useState(false);

  /** A point given in client coordinates, relative to the frame. */
  const inFrame = (clientX: number, clientY: number): XY => {
    const rect = frameEl?.getBoundingClientRect();
    return { x: clientX - (rect?.left ?? 0), y: clientY - (rect?.top ?? 0) };
  };

  const zoomTo = (zoom: number, anchor?: XY) =>
    update((v) => zoomAt(v, zoom, img, frame, fit, anchor));
  const zoomIn = () =>
    update((v) => zoomAt(v, stepZoom(v.zoom, 1), img, frame, fit));
  const zoomOut = () =>
    update((v) => zoomAt(v, stepZoom(v.zoom, -1), img, frame, fit));
  const reset = () => update(() => fitView(img));

  /* ---------- wheel and Safari pinch (need non-passive listeners) ---------- */

  const onWheel = useEffectEvent((e: WheelEvent) => {
    if (!ready || !(e.ctrlKey || e.metaKey)) return; // plain wheel scrolls
    e.preventDefault();
    const anchor = inFrame(e.clientX, e.clientY);
    const factor = wheelZoomFactor(e.deltaY, e.deltaMode);
    update((v) => zoomAt(v, v.zoom * factor, img, frame, fit, anchor));
  });
  const gestureStart = useRef(1);
  const onGesture = useEffectEvent((e: GestureEvent) => {
    e.preventDefault();
    if (!ready) return;
    if (e.type === "gesturestart") {
      gestureStart.current = view.zoom;
      return;
    }
    const anchor = inFrame(e.clientX, e.clientY);
    const zoom = gestureStart.current * e.scale;
    update((v) => zoomAt(v, zoom, img, frame, fit, anchor));
  });

  useEffect(() => {
    const el = frameEl;
    if (!el) return;
    const wheel = (e: WheelEvent) => onWheel(e);
    const gesture = (e: Event) => onGesture(e as GestureEvent);
    el.addEventListener("wheel", wheel, { passive: false });
    for (const type of ["gesturestart", "gesturechange"]) {
      el.addEventListener(type, gesture, { passive: false });
    }
    return () => {
      el.removeEventListener("wheel", wheel);
      for (const type of ["gesturestart", "gesturechange"]) {
        el.removeEventListener(type, gesture);
      }
    };
  }, [frameEl]);

  /* ---------- drag to pan, two-finger pinch ---------- */

  const pointers = useRef(new Map<number, XY>());
  const gesture = useRef<Gesture | null>(null);
  // a drag just ended: the click that follows it is not a click
  const swallowClick = useRef(false);

  const pinchOf = (): { dist: number; mid: XY } => {
    const [a, b] = [...pointers.current.values()];
    return {
      dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
      mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 },
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      swallowClick.current = false;
      gesture.current = {
        kind: "press",
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        threshold:
          e.pointerType === "mouse"
            ? DRAG_THRESHOLD.mouse
            : DRAG_THRESHOLD.touch,
      };
    } else if (pointers.current.size === 2) {
      for (const id of pointers.current.keys()) {
        e.currentTarget.setPointerCapture?.(id);
      }
      swallowClick.current = true;
      setDragging(true);
      gesture.current = { kind: "pinch", ...pinchOf(), zoom: view.zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      if (pointers.current.size < 2) return;
      const { dist, mid } = pinchOf();
      const anchor = inFrame(mid.x, mid.y);
      const dx = mid.x - g.mid.x;
      const dy = mid.y - g.mid.y;
      const zoom = (g.zoom * dist) / g.dist;
      gesture.current = { ...g, mid };
      update((v) =>
        zoomAt(panBy(v, dx, dy, img, fit), zoom, img, frame, fit, anchor),
      );
      return;
    }
    if (g.id !== e.pointerId) return;
    if (g.kind === "press") {
      if (Math.hypot(e.clientX - g.x, e.clientY - g.y) < g.threshold) return;
      e.currentTarget.setPointerCapture?.(e.pointerId);
      swallowClick.current = true;
      setDragging(true);
    }
    const dx = e.clientX - g.x;
    const dy = e.clientY - g.y;
    gesture.current = {
      kind: "pan",
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
    };
    update((v) => panBy(v, dx, dy, img, fit));
  };

  const onPointerEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const left = [...pointers.current.entries()];
    if (left.length === 1 && gesture.current?.kind === "pinch") {
      // one finger lifted: keep panning with the other
      const [id, p] = left[0];
      gesture.current = { kind: "pan", id, x: p.x, y: p.y };
      return;
    }
    if (left.length === 0) {
      gesture.current = null;
      setDragging(false);
    }
  };

  const onClickCapture = (e: React.MouseEvent) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
    e.preventDefault();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!ready || e.target !== e.currentTarget) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return; // browser zoom etc.
    const step = 0.1;
    const pans: Record<string, [number, number]> = {
      ArrowLeft: [frame.width * step, 0],
      ArrowRight: [-frame.width * step, 0],
      ArrowUp: [0, frame.height * step],
      ArrowDown: [0, -frame.height * step],
    };
    if (e.key === "+" || e.key === "=") zoomIn();
    else if (e.key === "-" || e.key === "_") zoomOut();
    else if (e.key === "0") reset();
    else if (e.key in pans && view.zoom > 1) {
      const [dx, dy] = pans[e.key];
      update((v) => panBy(v, dx, dy, img, fit));
    } else return;
    e.preventDefault();
  };

  return {
    ready,
    view,
    zoom: view.zoom,
    fit,
    frame,
    /** CSS px per image px at the current zoom */
    scale,
    offsetX,
    offsetY,
    dragging,
    toImage: (p: XY) => frameToImage(view, frame, fit, p),
    toFrame: (p: XY) => imageToFrame(view, frame, fit, p),
    zoomIn,
    zoomOut,
    zoomTo,
    reset,
    setOuter: setOuterEl,
    setFrame: setFrameEl,
    onPointerDown,
    onPointerMove,
    onPointerEnd,
    onClickCapture,
    onKeyDown,
  };
}
