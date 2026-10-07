"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Camera, Check, Close, Download, Plus, Refresh, Upload } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { cn } from "@/components/ui/cn";
import { useHydrated } from "@/lib/store/hydrated";
import {
  cutout,
  defaultQuad,
  drawBase,
  drawGuides,
  drawObject,
  drawObjectGuide,
  drawSurface,
  hitCorner,
  objectBox,
  type ObjectScene,
  type Pt,
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
 * It runs entirely in the browser. The photograph is never uploaded,
 * which matters: it is a picture of the inside of someone's home. There
 * is no model involved, so it works the same whether or not the site has
 * an AI key, and it cannot invent anything — it draws the product's own
 * photograph, or the colour the customer picked.
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
  const [quad, setQuad] = useState<Pt[]>(() => defaultQuad(product.kind === "paint" ? "wall" : "floor"));
  const [areaW, setAreaW] = useState(12);
  const [areaD, setAreaD] = useState(14);
  const [tileMm, setTileMm] = useState<[number, number]>(product.tileMm);
  const [diagonal, setDiagonal] = useState(false);
  const [brush, setBrush] = useState<"off" | "erase" | "restore">("off");
  const [maskVersion, setMaskVersion] = useState(0);
  /* Whether anything has been rubbed out — state, not a read of the ref,
     because the "clear" link has to appear when the first stroke lands. */
  const [hasMask, setHasMask] = useState(false);

  /* Object */
  const [obj, setObj] = useState({ x: 0.5, y: 0.6, widthCm: 40, rotation: 0 });
  const [roomWidthM, setRoomWidthM] = useState(3);

  const dragging = useRef<{ kind: "corner"; i: number } | { kind: "object"; dx: number; dy: number } | { kind: "brush" } | null>(null);
  const [fast, setFast] = useState(false);

  const isSurface = product.kind === "tile" || product.kind === "paint";

  /* ---- Load the product's own picture once ------------------------------ */
  useEffect(() => {
    let live = true;
    loadImage(product.photoSrc)
      .then((el) => {
        if (!live) return;
        setSwatches((s) => (s.some((x) => x.id === "product") ? s : [{ id: "product", label: product.brand ?? "This product", el }, ...s]));
        if (product.kind === "object") setArt(cutout(el));
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
    setBase(toBase(video, video.videoWidth, video.videoHeight));
    resetPlacement();
    stopCamera();
  }

  /* ---- Photo ------------------------------------------------------------ */
  async function onPhoto(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setNotice(null);
    try {
      setBase(await baseFromFile(file));
      resetPlacement();
      stopCamera();
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
    setQuad(defaultQuad(surface));
    setObj((o) => ({ ...o, x: 0.5, y: 0.6 }));
  }

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
      } else if (art) {
        drawObject(ctx, w, h, objectScene, art);
        if (guides) drawObjectGuide(ctx, w, h, objectScene, art);
      }
    },
    [base, isSurface, product.kind, colour, activeSwatch, surfaceScene, quad, art, objectScene],
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
    if (isSurface) {
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
    if (isSurface) return;
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
                tabIndex={isSurface ? -1 : 0}
                aria-label={`${product.title} placed on your photo. ${isSurface ? "Drag the corners to fit the surface." : "Drag the product, or use the arrow keys, to place it."}`}
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
                  Take a photo of the room, or upload one. Your photo stays on this device — it is never uploaded.
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
                    Clear all rubbing out
                  </button>
                )}
              </div>
            </Panel>
          )}

          {/* ---- Object ------------------------------------------------- */}
          {!isSurface && (
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

      <p className="mt-6 max-w-prose text-caption leading-snug text-faint">
        A mock-up on your own photograph, drawn in your browser. Colour, texture and scale will differ in the room — use it to compare ideas, not to specify an order.
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
