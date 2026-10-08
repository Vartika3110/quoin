"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Close, Download, Plus, Refresh, Sparkle, Upload } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import { useHydrated } from "@/lib/store/hydrated";
import {
  confidenceLabel,
  doorFitNote,
  fitSurface,
  padDoorQuad,
  rasterFrom,
  type FitKind,
} from "@/lib/visualise/autofit";
import {
  cutout,
  defaultQuad,
  drawBase,
  drawDoor,
  drawGuides,
  drawObject,
  drawObjectGuide,
  drawSurface,
  hitCorner,
  holesToCanvas,
  objectBox,
  type ObjectScene,
  type Pt,
  trimToContent,
  type SurfaceScene,
} from "@/lib/visualise/engine";
import type { VisualiserKind } from "@/lib/visualise/kind";

/**
 * See it in your space.
 *
 * The customer brings a photograph of their own room (taken now with the
 * camera, or uploaded), and the product is laid onto it: a tile or
 * laminate on the floor or a wall, a paint colour on a wall, or the
 * product itself — a light, a fitting, a piece of furniture — placed and
 * sized.
 *
 * The moment a photograph is loaded the page works out where the floor,
 * wall or door is (`autofit.ts`), puts a rough size on it, and lays the
 * product there; the customer corrects what it got wrong. All of that
 * runs in the browser and nothing is uploaded, which matters: it is a
 * picture of the inside of someone's home. It does not invent anything —
 * it draws the product's own photograph, or the colour the customer
 * picked.
 *
 * One optional step does leave the browser: "Make it photo-realistic"
 * sends the photograph to an AI image service and shows the redrawn
 * picture beside the original. It is a button, with the disclosure beside
 * it, never automatic; it only appears when the site has an AI key; and
 * its output is labelled as AI-generated.
 *
 * It is a mock-up, and the page says so. A tile photographed in a studio
 * under white light and the same tile in a room at six in the evening are
 * not the same colour, and this does not pretend otherwise.
 */

export interface VisualiserProduct {
  title: string;
  brand: string | null;
  /** A same-origin URL for the product photograph. */
  photoSrc: string;
  /** True when the photograph is a generated illustration, not the item. */
  photoIsIllustration: boolean;
  kind: VisualiserKind;
  /** Millimetres, from the title when it states one. */
  tileMm: [number, number];
  /** A door's own width and height in feet, when its title states them. */
  doorFt: [number, number] | null;
}

type Base = { el: HTMLCanvasElement; w: number; h: number };
type Swatch = { id: string; label: string; el: HTMLImageElement; own?: boolean };

const MAX_EDGE = 1400;
const TILE_SIZES: { label: string; mm: [number, number] }[] = [
  { label: "300 × 300", mm: [300, 300] },
  { label: "600 × 600", mm: [600, 600] },
  { label: "600 × 1200", mm: [600, 1200] },
  { label: "800 × 800", mm: [800, 800] },
  { label: "1200 × 1200", mm: [1200, 1200] },
];
/* Ordinary architectural whites and earths, named for what they look like.
   Not a manufacturer's shade card: a real shade is chosen against the real
   card, and the page says so. */
const COLOURS = [
  ["Ivory", "#EFE4CC"], ["Warm sand", "#D8BF98"], ["Terracotta", "#B9643F"], ["Sage", "#9AAA8A"],
  ["Deep teal", "#2F6A68"], ["Dusty rose", "#C99A92"], ["Sky", "#A9C6DA"], ["Indigo", "#34476E"],
  ["Mustard", "#D2A22E"], ["Charcoal", "#3B3B3E"], ["Pearl", "#F6F3EC"], ["Olive", "#7C7A45"],
] as const;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const el = new Image();
    el.decoding = "async";
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("image"));
    el.src = src;
  });
}

/** Any image source onto a canvas no bigger than `MAX_EDGE`. */
function toBase(source: CanvasImageSource, sw: number, sh: number): Base {
  const k = Math.min(1, MAX_EDGE / Math.max(sw, sh));
  const w = Math.max(2, Math.round(sw * k));
  const h = Math.max(2, Math.round(sh * k));
  const el = document.createElement("canvas");
  el.width = w;
  el.height = h;
  el.getContext("2d")!.drawImage(source, 0, 0, w, h);
  return { el, w, h };
}

async function baseFromFile(file: File): Promise<Base> {
  /* `from-image` applies the EXIF rotation, without which a portrait photo
     from a phone arrives on its side. */
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const base = toBase(bitmap, bitmap.width, bitmap.height);
    bitmap.close();
    return base;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const el = await loadImage(url);
      return toBase(el, el.naturalWidth, el.naturalHeight);
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}

/* One answer per page load: is the AI redraw switched on? */
let renderEnabledCache: boolean | null = null;
function probeRender(): Promise<boolean> {
  if (renderEnabledCache !== null) return Promise.resolve(renderEnabledCache);
  return fetch("/api/v1/visualise/render")
    .then((r) => (r.ok ? r.json() : null))
    .then((body) => Boolean(body?.data?.enabled))
    .catch(() => false)
    .then((value) => {
      renderEnabledCache = value;
      return value;
    });
}

/** The photograph as a JPEG small enough to send (the server caps it at 4 MB). */
function toJpeg(el: CanvasImageSource, w: number, h: number, maxEdge = 1280): Promise<Blob | null> {
  const k = Math.min(1, maxEdge / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(el, 0, 0, c.width, c.height);
  return new Promise((resolve) => c.toBlob(resolve, "image/jpeg", 0.88));
}

interface FitSummary {
  kind: FitKind;
  confidence: number;
  widthFt: number;
  lengthFt: number;
  /** Objects found standing in front of the surface. */
  found: number;
}

export function Visualiser({ product }: { product: VisualiserProduct }) {
  const hydrated = useHydrated();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tileFileRef = useRef<HTMLInputElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);

  const [base, setBase] = useState<Base | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  /* Camera */
  const [cameraOn, setCameraOn] = useState(false);
  const [facing, setFacing] = useState<"environment" | "user">("environment");
  const [cameraCount, setCameraCount] = useState(0);

  /* What is being laid */
  const [swatches, setSwatches] = useState<Swatch[]>([]);
  const [swatchId, setSwatchId] = useState<string>("product");
  const [colour, setColour] = useState<string>(COLOURS[0][1]);
  const [art, setArt] = useState<HTMLCanvasElement | null>(null);

  /* Surface */
  const [surface, setSurface] = useState<"floor" | "wall">(product.kind === "paint" ? "wall" : "floor");
  const [quad, setQuad] = useState<Pt[]>(() => defaultQuad(product.kind === "door" ? "door" : product.kind === "paint" ? "wall" : "floor"));
  const [areaW, setAreaW] = useState(12);
  const [areaD, setAreaD] = useState(14);
  const [tileMm, setTileMm] = useState<[number, number]>(product.tileMm);
  const [diagonal, setDiagonal] = useState(false);
  const [brush, setBrush] = useState<"off" | "erase" | "restore">("off");
  const [maskVersion, setMaskVersion] = useState(0);
  /* Whether anything has been rubbed out — state, not a read of the ref,
     because the "clear" link has to appear when the first stroke lands. */
  const [hasMask, setHasMask] = useState(false);

  /* Door: the opening, as measured from the photo and corrected by the customer. */
  const [opening, setOpening] = useState({ widthFt: 3, heightFt: 6.9 });

  /* What the automatic fit found, and whether it is running. */
  const [fit, setFit] = useState<FitSummary | null>(null);
  const [fitting, setFitting] = useState(false);
  const fitTimer = useRef<number | null>(null);

  /* The optional AI redraw. */
  const [aiEnabled, setAiEnabled] = useState(renderEnabledCache === true);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiImage, setAiImage] = useState<{ before: string; after: string } | null>(null);
  const [aiOpen, setAiOpen] = useState(false);

  /* Object */
  const [obj, setObj] = useState({ x: 0.5, y: 0.6, widthCm: 40, rotation: 0 });
  const [roomWidthM, setRoomWidthM] = useState(3);

  const dragging = useRef<{ kind: "corner"; i: number } | { kind: "object"; dx: number; dy: number } | { kind: "brush" } | null>(null);
  const [fast, setFast] = useState(false);

  const isSurface = product.kind === "tile" || product.kind === "paint";
  const isDoor = product.kind === "door";
  /* Floors, walls and doors are all fitted by four corners. */
  const isQuad = isSurface || isDoor;
  const fitKind: FitKind = isDoor ? "door" : surface;

  useEffect(() => {
    let live = true;
    void probeRender().then((v) => live && setAiEnabled(v));
    return () => {
      live = false;
    };
  }, []);

  /* ---- Load the product's own picture once ------------------------------ */
  useEffect(() => {
    let live = true;
    loadImage(product.photoSrc)
      .then((el) => {
        if (!live) return;
        setSwatches((s) => (s.some((x) => x.id === "product") ? s : [{ id: "product", label: product.brand ?? "This product", el }, ...s]));
        if (product.kind === "object") setArt(cutout(el));
        if (product.kind === "door") setArt(trimToContent(cutout(el)));
      })
      .catch(() => live && setNotice("We could not load this product's picture, so it cannot be placed. Try again in a moment."));
    return () => {
      live = false;
    };
  }, [product.photoSrc, product.kind, product.brand]);

  /* ---- Camera ----------------------------------------------------------- */
  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }, []);
  useEffect(() => stopCamera, [stopCamera]);

  const startCamera = useCallback(
    async (want: "environment" | "user") => {
      setNotice(null);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: want }, width: { ideal: 1920 } },
          audio: false,
        });
        streamRef.current = stream;
        setFacing(want);
        setCameraOn(true);
        /* Counted *after* permission is granted — before it, browsers
           return devices with blank labels and sometimes only one. */
        const devices = await navigator.mediaDevices.enumerateDevices();
        setCameraCount(devices.filter((d) => d.kind === "videoinput").length);
      } catch {
        setCameraOn(false);
        setNotice("The camera is blocked or unavailable. Allow camera access in your browser, or upload a photo instead.");
      }
    },
    [],
  );

  useEffect(() => {
    const video = videoRef.current;
    if (cameraOn && video && streamRef.current) {
      video.srcObject = streamRef.current;
      void video.play().catch(() => undefined);
    }
  }, [cameraOn, facing]);

  function capture() {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    const captured = toBase(video, video.videoWidth, video.videoHeight);
    setBase(captured);
    resetPlacement();
    stopCamera();
    runFit(captured, fitKind, true);
  }

  /* ---- Photo ------------------------------------------------------------ */
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      const loaded = await baseFromFile(file);
      setBase(loaded);
      resetPlacement();
      stopCamera();
      runFit(loaded, fitKind, true);
    } catch {
      setNotice("This browser cannot open that photo. Try a JPG or PNG.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onTileFiles(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    const added: Swatch[] = [];
    for (const file of Array.from(files).slice(0, 8)) {
      const url = URL.createObjectURL(file);
      try {
        const el = await loadImage(url);
        added.push({ id: `own-${Date.now()}-${added.length}`, label: file.name.replace(/\.[^.]+$/, "").slice(0, 18) || "My design", el, own: true });
      } catch {
        setNotice("One of those images could not be opened. Try a JPG or PNG.");
      }
    }
    if (added.length) {
      setSwatches((s) => [...s, ...added]);
      setSwatchId(added[0].id);
    }
    setBusy(false);
    if (tileFileRef.current) tileFileRef.current.value = "";
  }

  function resetPlacement() {
    maskRef.current = null;
    setHasMask(false);
    setMaskVersion((v) => v + 1);
    setQuad(defaultQuad(fitKind));
    setObj((o) => ({ ...o, x: 0.5, y: 0.6 }));
    setFit(null);
    setAiImage(null);
    setAiOpen(false);
  }

  /* ---- Automatic fit ----------------------------------------------------- */
  /**
   * Looks at the photograph, finds the surface and sizes it. A tile that
   * does not find a convincing floor tries the wall, so a customer who
   * photographs a bathroom wall is not left fitting a floor by hand.
   */
  function runFit(b: Base, want: FitKind, allowSwitch: boolean) {
    if (!isQuad) return;
    if (fitTimer.current !== null) window.clearTimeout(fitTimer.current);
    setFitting(true);
    /* One tick, so "Reading your photo" paints before the work starts. */
    fitTimer.current = window.setTimeout(() => {
      fitTimer.current = null;
      try {
        const raster = rasterFrom(b.el, b.w, b.h);
        let kind = want;
        let result = fitSurface(raster, kind, { holes: kind !== "door" });
        if (allowSwitch && product.kind === "tile" && result.confidence < 0.5) {
          const other: FitKind = kind === "floor" ? "wall" : "floor";
          const alt = fitSurface(raster, other, { holes: true });
          if (alt.confidence > result.confidence + 0.2) {
            kind = other;
            result = alt;
          }
        }
        if (kind === "door") {
          setQuad(padDoorQuad(result.quad));
          setOpening({ widthFt: Math.max(2, Math.min(6, result.widthFt)), heightFt: Math.max(5.5, Math.min(9, result.lengthFt)) });
        } else {
          setSurface(kind);
          setQuad(result.quad);
          setAreaW(Math.max(4, Math.min(40, result.widthFt)));
          setAreaD(Math.max(4, Math.min(40, result.lengthFt)));
        }
        maskRef.current = result.holes && result.holes.count > 0 ? holesToCanvas(result.holes, b.w, b.h) : null;
        setHasMask(maskRef.current !== null);
        setMaskVersion((v) => v + 1);
        setFit({ kind, confidence: result.confidence, widthFt: result.widthFt, lengthFt: result.lengthFt, found: result.holes?.count ?? 0 });
      } catch {
        setNotice("We could not find the surface automatically. Drag the corners onto it.");
      } finally {
        setFitting(false);
      }
    }, 30);
  }

  useEffect(
    () => () => {
      if (fitTimer.current !== null) window.clearTimeout(fitTimer.current);
    },
    [],
  );

  /* ---- Scenes ----------------------------------------------------------- */
  const surfaceScene: SurfaceScene = useMemo(
    () => ({ quad, areaWidthFt: areaW, areaDepthFt: areaD, tileMm, diagonal }),
    [quad, areaW, areaD, tileMm, diagonal],
  );
  const objectScene: ObjectScene = useMemo(
    () => ({ ...obj, roomWidthCm: roomWidthM * 100 }),
    [obj, roomWidthM],
  );
  const activeSwatch = swatches.find((s) => s.id === swatchId) ?? swatches[0] ?? null;

  const paint = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number, guides: boolean, quick: boolean) => {
      if (!base) return;
      drawBase(ctx, base.el, w, h);
      if (isSurface) {
        const fill = product.kind === "paint" ? { colour } : { swatch: activeSwatch?.el ?? null };
        if (product.kind === "paint" || activeSwatch) {
          drawSurface(ctx, w, h, base.el, surfaceScene, fill, { mask: maskRef.current, fast: quick });
        }
        if (guides) drawGuides(ctx, quad, w, h);
      } else if (isDoor) {
        if (art) drawDoor(ctx, w, h, base.el, quad, art, { fast: quick });
        if (guides) drawGuides(ctx, quad, w, h);
      } else if (art) {
        drawObject(ctx, w, h, objectScene, art);
        if (guides) drawObjectGuide(ctx, w, h, objectScene, art);
      }
    },
    [base, isSurface, isDoor, product.kind, colour, activeSwatch, surfaceScene, quad, art, objectScene],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base) return;
    canvas.width = base.w;
    canvas.height = base.h;
  }, [base]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !base) return;
    const frame = requestAnimationFrame(() => {
      const ctx = canvas.getContext("2d");
      if (ctx) paint(ctx, base.w, base.h, brush === "off", fast);
    });
    return () => cancelAnimationFrame(frame);
  }, [base, paint, brush, fast, maskVersion]);

  /* ---- Pointer ---------------------------------------------------------- */
  function pos(e: React.PointerEvent<HTMLCanvasElement>): Pt {
    const r = e.currentTarget.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  }

  function stroke(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!base) return;
    if (!maskRef.current) {
      const m = document.createElement("canvas");
      m.width = base.w;
      m.height = base.h;
      maskRef.current = m;
    }
    const [x, y] = pos(e);
    const cx = maskRef.current.getContext("2d")!;
    const r = base.w * 0.03;
    cx.globalCompositeOperation = brush === "erase" ? "source-over" : "destination-out";
    cx.fillStyle = "#fff";
    cx.beginPath();
    cx.arc(x * base.w, y * base.h, r, 0, Math.PI * 2);
    cx.fill();
    setHasMask(true);
    setMaskVersion((v) => v + 1);
  }

  function onDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!base) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = pos(e);

    if (isSurface && brush !== "off") {
      dragging.current = { kind: "brush" };
      stroke(e);
      return;
    }
    if (isQuad) {
      /* A thumb is wider than a mouse: the reach is 7% of the picture. */
      const i = hitCorner(quad, x, y, 0.07);
      if (i >= 0) {
        dragging.current = { kind: "corner", i };
        setFast(true);
      }
    } else if (art) {
      const b = objectBox(objectScene, art, base.w, base.h);
      if (Math.abs(x * base.w - b.cx) <= b.w / 2 + 20 && Math.abs(y * base.h - b.cy) <= b.h / 2 + 20) {
        dragging.current = { kind: "object", dx: obj.x - x, dy: obj.y - y };
        setFast(true);
      }
    }
  }

  function onMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const d = dragging.current;
    if (!d) return;
    if (d.kind === "brush") return stroke(e);
    const [x, y] = pos(e);
    if (d.kind === "corner") {
      setQuad((q) => q.map((p, i): Pt => (i === d.i ? [x, y] : p)));
    } else {
      setObj((o) => ({ ...o, x: Math.min(1, Math.max(0, x + d.dx)), y: Math.min(1, Math.max(0, y + d.dy)) }));
    }
  }

  function onUp() {
    dragging.current = null;
    setFast(false);
  }

  function onKey(e: React.KeyboardEvent<HTMLCanvasElement>) {
    if (isQuad) return;
    const step = 0.01;
    const move: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const m = move[e.key];
    if (!m) return;
    e.preventDefault();
    setObj((o) => ({ ...o, x: Math.min(1, Math.max(0, o.x + m[0])), y: Math.min(1, Math.max(0, o.y + m[1])) }));
  }

  function save() {
    if (!base) return;
    const out = document.createElement("canvas");
    out.width = base.w;
    out.height = base.h;
    paint(out.getContext("2d")!, base.w, base.h, false, false);
    out.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "quoin-in-my-space.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    }, "image/png");
  }

  function setSurfaceKind(next: "floor" | "wall") {
    setSurface(next);
    setQuad(defaultQuad(next));
    if (base) runFit(base, next, false);
  }

  /* ---- AI redraw (optional, always the customer's choice) ----------------- */
  async function aiRedraw() {
    if (!base || aiBusy) return;
    setAiBusy(true);
    setNotice(null);
    try {
      const room = await toJpeg(base.el, base.w, base.h);
      if (!room) throw new Error("encode");
      const form = new FormData();
      form.append("room", room, "room.jpg");
      if (product.kind !== "paint" && activeSwatch) {
        const tex = await toJpeg(activeSwatch.el, activeSwatch.el.naturalWidth, activeSwatch.el.naturalHeight, 640);
        if (tex) form.append("product", tex, "product.jpg");
      } else if (product.kind === "door" || product.kind === "object") {
        const own = await loadImage(product.photoSrc).catch(() => null);
        const tex = own ? await toJpeg(own, own.naturalWidth, own.naturalHeight, 640) : null;
        if (tex) form.append("product", tex, "product.jpg");
      }
      const colourName = COLOURS.find(([, hex]) => hex === colour)?.[0];
      form.append(
        "spec",
        JSON.stringify({
          kind: product.kind,
          surface: isDoor ? "door" : surface,
          title: product.title,
          tileMm: product.kind === "tile" ? tileMm : undefined,
          colourName: product.kind === "paint" ? colourName : undefined,
          colourHex: product.kind === "paint" ? colour : undefined,
          at: product.kind === "object" ? { x: obj.x, y: obj.y } : undefined,
          widthCm: product.kind === "object" ? obj.widthCm : undefined,
        }),
      );
      const response = await fetch("/api/v1/visualise/render", { method: "POST", body: form });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.data?.image) {
        setNotice(body?.error?.message ?? "We could not make the AI view just now. The preview on your photo still works.");
        return;
      }
      const before = document.createElement("canvas");
      before.width = base.w;
      before.height = base.h;
      before.getContext("2d")!.drawImage(base.el, 0, 0);
      setAiImage({ before: before.toDataURL("image/jpeg", 0.85), after: body.data.image as string });
      setAiOpen(true);
    } catch {
      setNotice("We could not make the AI view just now. The preview on your photo still works.");
    } finally {
      setAiBusy(false);
    }
  }

  const canCamera = hydrated && typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

  /* ---- Render ----------------------------------------------------------- */
  return (
    <div className="px-5 pb-10 lg:px-0">
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_21rem] lg:gap-8">
        <div>
          <div className="relative overflow-hidden rounded-card border border-line bg-surface">
            {cameraOn ? (
              <div className="relative">
                <video ref={videoRef} playsInline muted className="block w-full bg-black" />
                <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-2 bg-gradient-to-t from-black/60 to-transparent p-3">
                  <Button variant="outline" size="sm" onClick={stopCamera}><Close className="size-4" />
                    Cancel
                  </Button>
                  <Button size="sm" onClick={capture}><Camera className="size-4" />
                    Take photo
                  </Button>
                  {cameraCount > 1 ? (
                    <Button variant="outline" size="sm" onClick={() => startCamera(facing === "environment" ? "user" : "environment")}><Refresh className="size-4" />
                      Switch camera
                    </Button>
                  ) : (
                    <span className="w-[6.5rem]" />
                  )}
                </div>
              </div>
            ) : base ? (
              <canvas
                ref={canvasRef}
                role="img"
                tabIndex={isQuad ? -1 : 0}
                aria-label={`${product.title} placed on your photo. ${isDoor ? "Drag the corners to fit the opening." : isSurface ? "Drag the corners to fit the surface." : "Drag the product, or use the arrow keys, to place it."}`}
                onPointerDown={onDown}
                onPointerMove={onMove}
                onPointerUp={onUp}
                onPointerCancel={onUp}
                onKeyDown={onKey}
                className={cn("block h-auto w-full touch-none select-none", brush !== "off" ? "cursor-crosshair" : "cursor-grab")}
              />
            ) : (
              <div className="grid place-items-center gap-4 px-6 py-16 text-center">
                <p className="max-w-sm text-body text-muted">
                  {isDoor
                    ? "Take a photo of your door or doorway, or upload one. Quoin finds the opening, sizes it and fits this door in. Your photo stays on this device."
                    : "Take a photo of the room, or upload one. Quoin finds the surface for you to adjust. Your photo stays on this device."}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {canCamera && (
                    <Button onClick={() => startCamera(facing)}><Camera className="size-4" />
                      Use camera
                    </Button>
                  )}
                  <Button variant="outline" onClick={() => fileRef.current?.click()}>{busy ? <Spinner className="size-4" /> : <Upload className="size-4" />}
                    Upload a photo
                  </Button>
                </div>
              </div>
            )}
          </div>

          <input ref={fileRef} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onPhoto(e.target.files?.[0])} />
          <input ref={tileFileRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => void onTileFiles(e.target.files)} />

          {notice && (
            <p role="alert" className="mt-3 rounded-lg border border-line-soft bg-surface px-3 py-2 text-body-sm text-muted">
              {notice}
            </p>
          )}

          {base && !cameraOn && isQuad && (fitting || fit) && (
            <FitCard
              fitting={fitting}
              fit={fit}
              kind={fitKind}
              opening={opening}
              door={product.doorFt}
              tileCount={
                product.kind === "tile"
                  ? Math.ceil(((areaW * 304.8 * areaD * 304.8) / (tileMm[0] * tileMm[1])) * 1.1)
                  : null
              }
              onRefit={() => base && runFit(base, fitKind, false)}
            />
          )}

          {base && !cameraOn && (
            <div className="mt-3 flex flex-wrap gap-2">
              {canCamera && (
                <Button variant="outline" size="sm" onClick={() => startCamera(facing)}><Camera className="size-4" />
                  Retake
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}><Upload className="size-4" />
                Other photo
              </Button>
              <Button size="sm" onClick={save}><Download className="size-4" />
                Save image
              </Button>
            </div>
          )}

          {base && !cameraOn && aiEnabled && (
            <div className="mt-3 rounded-card border border-line-soft bg-surface p-4">
              <Button size="sm" variant="outline" onClick={() => (aiImage ? setAiOpen(true) : void aiRedraw())} disabled={aiBusy}>
                {aiBusy ? <Spinner className="size-4" /> : <Sparkle className="size-4" />}
                {aiBusy ? "Drawing your room…" : aiImage ? "View the AI picture again" : "Make it photo-realistic with AI"}
              </Button>
              <p className="mt-2 text-caption leading-snug text-muted">
                This sends your photo to an AI image service, which redraws it with the product in place. The picture is made up by the AI and the real product may look different. Nothing is kept.
              </p>
              {aiImage && !aiBusy && (
                <button type="button" onClick={() => void aiRedraw()} className="mt-2 text-caption text-accent">
                  Draw it again
                </button>
              )}
            </div>
          )}
        </div>

        <aside className="mt-5 space-y-5 lg:mt-0" aria-label="Placement controls">
          {/* ---- Surface: floor or wall --------------------------------- */}
          {isSurface && product.kind === "tile" && (
            <Panel title="Design">
              <div className="flex flex-wrap gap-2">
                {swatches.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSwatchId(s.id)}
                    aria-pressed={activeSwatch?.id === s.id}
                    className={cn("w-16 text-center", activeSwatch?.id === s.id ? "text-accent" : "text-muted")}
                  >
                    <span
                      className={cn("block aspect-square rounded-lg border-2 bg-cover bg-center", activeSwatch?.id === s.id ? "border-accent" : "border-line-soft")}
                      style={{ backgroundImage: `url("${s.el.src}")` }}
                    />
                    <span className="mt-1 block truncate text-micro">{s.label}</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => tileFileRef.current?.click()}
                  className="grid aspect-square w-16 place-items-center self-start rounded-lg border-2 border-dashed border-line text-muted transition-colors hover:border-line-strong hover:text-ink"
                  aria-label="Add your own tile designs to compare"
                >
                  <Plus className="size-5" />
                </button>
              </div>
              <p className="mt-2 text-caption leading-snug text-muted">
                {product.photoIsIllustration
                  ? "This product's picture is an illustration, so the pattern is indicative. "
                  : "The product photo is laid as one tile. "}
                Add close-up photos of other designs to compare them in your room.
              </p>
            </Panel>
          )}

          {isSurface && product.kind === "paint" && (
            <Panel title="Colour">
              <div className="grid grid-cols-6 gap-2">
                {COLOURS.map(([name, hex]) => (
                  <button
                    key={hex}
                    type="button"
                    title={name}
                    aria-label={name}
                    aria-pressed={colour === hex}
                    onClick={() => setColour(hex)}
                    className={cn("relative aspect-square rounded-full border-2", colour === hex ? "border-accent" : "border-line-soft")}
                    style={{ background: hex }}
                  >
                    {colour === hex && <Check className="absolute inset-0 m-auto size-4 text-ink mix-blend-difference" />}
                  </button>
                ))}
              </div>
              <label className="mt-3 flex items-center gap-2 text-body-sm text-muted">
                Or pick any colour
                <input type="color" value={colour} onChange={(e) => setColour(e.target.value)} className="h-8 w-12 cursor-pointer rounded border border-line bg-transparent" />
              </label>
              <p className="mt-2 text-caption leading-snug text-muted">
                A screen is not a shade card. Check the colour against the real shade card, in your own light, before you buy.
              </p>
            </Panel>
          )}

          {isDoor && (
            <Panel title="Fit the door">
              <p className="text-caption leading-snug text-muted">
                Drag the four round handles onto the corners of the door or opening in your photo. Then set the opening&apos;s real size.
              </p>
              <Range label="Opening width" unit="ft" value={opening.widthFt} min={2} max={6} step={0.1} onChange={(v) => setOpening((o) => ({ ...o, widthFt: v }))} />
              <Range label="Opening height" unit="ft" value={opening.heightFt} min={5.5} max={9} step={0.1} onChange={(v) => setOpening((o) => ({ ...o, heightFt: v }))} />
              <p className="mt-2 text-caption leading-snug text-muted">
                Height starts from an ordinary door&apos;s 6.9 ft when the photo has nothing else to measure against, so set it to your real opening. The leaf is stretched to fill the opening you outline; its listed size is compared with the opening above.
              </p>
              <button type="button" onClick={() => base && runFit(base, "door", false)} disabled={!base || fitting} className="mt-3 text-body-sm text-accent disabled:text-faint">
                Find the door again
              </button>
            </Panel>
          )}

          {isSurface && (
            <Panel title="Where it goes">
              <Segmented
                value={surface}
                onChange={(v) => setSurfaceKind(v as "floor" | "wall")}
                options={[["floor", "Floor"], ["wall", "Wall"]]}
                label="Surface"
              />
              <p className="mt-2 text-caption leading-snug text-muted">
                Drag the four round handles onto the corners of the {surface} in your photo.
              </p>

              {product.kind === "tile" && (
                <>
                  <Range label={`${surface === "floor" ? "Room" : "Wall"} width`} unit="ft" value={areaW} min={4} max={40} onChange={setAreaW} />
                  <Range label={surface === "floor" ? "Room depth" : "Wall height"} unit="ft" value={areaD} min={4} max={40} onChange={setAreaD} />
                  <label className="mt-3 block text-body-sm text-muted">
                    Tile size (mm)
                    <select
                      value={`${tileMm[0]}x${tileMm[1]}`}
                      onChange={(e) => {
                        const [a, b] = e.target.value.split("x").map(Number);
                        setTileMm([a, b]);
                      }}
                      className="mt-1 block h-10 w-full rounded-lg border border-line bg-surface px-2 text-ink"
                    >
                      {[...(TILE_SIZES.some((t) => t.mm[0] === product.tileMm[0] && t.mm[1] === product.tileMm[1]) ? [] : [{ label: `${product.tileMm[0]} × ${product.tileMm[1]}`, mm: product.tileMm }]), ...TILE_SIZES].map((t) => (
                        <option key={t.label} value={`${t.mm[0]}x${t.mm[1]}`}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mt-3 flex items-center gap-2 text-body-sm text-ink">
                    <input type="checkbox" checked={diagonal} onChange={(e) => setDiagonal(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
                    Lay diagonally
                  </label>
                </>
              )}

              <div className="mt-4">
                <p className="text-body-sm text-muted">Furniture in the way?</p>
                <div className="mt-1.5">
                  <Segmented
                    value={brush}
                    onChange={(v) => setBrush(v as typeof brush)}
                    options={[["off", "Move corners"], ["erase", "Rub out"], ["restore", "Bring back"]]}
                    label="Brush"
                  />
                </div>
                {hasMask && (
                  <button type="button" onClick={() => { maskRef.current = null; setHasMask(false); setMaskVersion((v) => v + 1); }} className="mt-2 text-caption text-accent">
                    Clear the cut-outs
                  </button>
                )}
              </div>
            </Panel>
          )}

          {/* ---- Object ------------------------------------------------- */}
          {!isQuad && (
            <Panel title="Place it">
              <p className="text-caption leading-snug text-muted">
                Drag the product to where it would go. Set its real width so it sits at the right size against your room.
              </p>
              <Range label="Product width" unit="cm" value={obj.widthCm} min={5} max={250} onChange={(v) => setObj((o) => ({ ...o, widthCm: v }))} />
              <Range label="This photo shows about" unit="m wide" value={roomWidthM} min={1} max={8} step={0.5} onChange={setRoomWidthM} />
              <Range label="Tilt" unit="°" value={obj.rotation} min={-30} max={30} onChange={(v) => setObj((o) => ({ ...o, rotation: v }))} />
              {product.photoIsIllustration && (
                <p className="mt-2 text-caption leading-snug text-muted">
                  This product&apos;s picture is an illustration. Actual product may vary.
                </p>
              )}
            </Panel>
          )}
        </aside>
      </div>

      <Modal open={aiOpen && aiImage !== null} onClose={() => setAiOpen(false)} title="Your room, redrawn by AI" description="Drag the handle to compare. The AI made this picture up from your photo, so the real product may look different." size="lg">
        {aiImage && <BeforeAfter before={aiImage.before} after={aiImage.after} ratio={base ? base.w / base.h : 4 / 3} />}
        {aiImage && (
          <a href={aiImage.after} download="quoin-ai-view.png" className="mt-3 inline-block text-body-sm text-accent">
            Save the AI picture
          </a>
        )}
      </Modal>

      <p className="mt-6 max-w-prose text-caption leading-snug text-faint">
        A mock-up on your own photograph, drawn in your browser. Sizes are estimated from the picture and colour, texture and scale will differ in the room — use it to compare ideas, not to specify an order.
      </p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-card border border-line-soft bg-surface p-4">
      <h2 className="mb-3 text-body-sm font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

function Segmented({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  options: readonly (readonly [string, string])[];
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-line bg-surface p-0.5">
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
          className={cn("h-9 flex-1 rounded-md px-2 text-body-sm transition-colors", value === v ? "bg-accent text-on-accent" : "text-muted hover:text-ink")}
        >
          {text}
        </button>
      ))}
    </div>
  );
}

function Range({
  label,
  unit,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="mt-3 block text-body-sm text-muted">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-ink">
          {value} {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--color-accent)]" />
    </label>
  );
}

function FitCard({
  fitting,
  fit,
  kind,
  opening,
  door,
  tileCount,
  onRefit,
}: {
  fitting: boolean;
  fit: FitSummary | null;
  kind: FitKind;
  opening: { widthFt: number; heightFt: number };
  door: [number, number] | null;
  tileCount: number | null;
  onRefit: () => void;
}) {
  const label = fit ? confidenceLabel(fit.confidence) : "low";
  const shownKind = fit?.kind ?? kind;
  return (
    <div className="mt-3 flex gap-3 rounded-card border border-line-soft bg-surface p-4" role="status" aria-live="polite">
      <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-on-accent">
        {fitting ? <Spinner className="size-4" /> : <Sparkle className="size-4" />}
      </span>
      <div className="min-w-0 flex-1">
        {fitting || !fit ? (
          <>
            <p className="text-body-sm font-semibold text-ink">Reading your photo…</p>
            <p className="text-caption leading-snug text-muted">Finding the {kind === "door" ? "door opening" : kind} and working out its size.</p>
          </>
        ) : (
          <>
            <p className="text-body-sm font-semibold text-ink">
              {shownKind === "door"
                ? `Door opening about ${opening.widthFt.toFixed(1)} × ${opening.heightFt.toFixed(1)} ft`
                : shownKind === "wall"
                  ? `Wall about ${fit.widthFt} ft wide × ${fit.lengthFt} ft high`
                  : `Visible floor about ${fit.widthFt} × ${fit.lengthFt} ft`}
            </p>
            <p className="mt-0.5 text-caption leading-snug text-muted">
              {shownKind === "door"
                ? door
                  ? doorFitNote({ widthFt: opening.widthFt, heightFt: opening.heightFt }, { widthFt: door[0], heightFt: door[1] }).text
                  : "This listing does not state a size, so Quoin cannot say whether it fits. Measure your opening and check with the seller."
                : tileCount
                  ? `About ${tileCount} tiles including 10% wastage, drawn at the real tile size.`
                  : "Drag the corners if the edges are off."}
              {fit.found > 0 && shownKind !== "door" ? ` ${fit.found === 1 ? "One object" : `${fit.found} objects`} in the way ${fit.found === 1 ? "was" : "were"} left in front.` : ""}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-micro font-semibold", label === "low" ? "bg-warning-wash text-warning" : "bg-success-wash text-success")}>
                {label === "good" ? "Good fit" : label === "check" ? "Check the corners" : "Low confidence — adjust the corners"}
              </span>
              <button type="button" onClick={onRefit} className="text-caption text-accent">
                Fit again
              </button>
            </div>
            <p className="mt-1.5 text-micro leading-snug text-faint">Sizes are estimated from the photo. Confirm with a tape measure before you order.</p>
          </>
        )}
      </div>
    </div>
  );
}

/** Two pictures with a draggable divider. The range input carries the pointer and the keyboard. */
function BeforeAfter({ before, after, ratio }: { before: string; after: string; ratio: number }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="relative w-full select-none overflow-hidden rounded-lg bg-black" style={{ aspectRatio: String(ratio) }}>
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${after}")` }} />
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url("${before}")`, clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <div className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow" style={{ left: `${pos}%` }} />
      <span className="pointer-events-none absolute top-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-white text-ink shadow" style={{ left: `${pos}%` }} aria-hidden>
        ↔
      </span>
      <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-micro font-semibold text-white">Your photo</span>
      <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/70 px-2.5 py-1 text-micro font-semibold text-white">AI picture</span>
      <input
        type="range"
        min={2}
        max={98}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Slide between your photo and the AI picture"
        className="absolute inset-0 size-full cursor-ew-resize opacity-0"
      />
    </div>
  );
}
