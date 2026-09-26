"use client";

import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type RefObject,
} from "react";
import { Pause, Play, SoundOff, SoundOn } from "@/components/icons";
import { cn } from "@/components/ui/cn";
import { formatClock, type PinVideo } from "@/lib/types/studio";

/**
 * A Studio clip, playing.
 *
 * `IdeaImage` is the sibling of this file and the rules are the same
 * three: the box is reserved before the bytes arrive, something is
 * painted in the meantime, and a failure is a sentence rather than a
 * broken glyph. What a clip adds is a decision a still never has to make
 * — *whether to fetch forty megabytes at all* — and most of this file is
 * that decision.
 *
 * **It autoplays muted, and it stops doing so on request.** Three
 * requests, all of which this honours:
 *
 *  - `prefers-reduced-motion`. A moving picture is the thing that setting
 *    is about. The poster stays, with a play control on it.
 *  - `navigator.connection.saveData`, which is Chrome's Data Saver and is
 *    switched on by a meaningful share of Indian Android users. Somebody
 *    who has told their browser not to spend their data has said the only
 *    thing this component needed to know.
 *  - `active={false}`. In the watch feed only the clip on screen plays;
 *    the ones above and below are paused and unbuffered. A vertical feed
 *    that keeps four videos running is a feed that empties a battery and
 *    a data pack to show one room.
 *
 * In all three the element still renders, still holds its box, and still
 * shows its poster — the pin is never *missing*, it is simply not moving
 * until somebody asks.
 *
 * **HLS.** `PinVideo.format` says which of two worlds this is. Safari and
 * every browser on iOS play an HLS manifest from `src` natively. Chrome
 * does not — including Chrome on Android, which is most of the people
 * this is for — so `hls.js` is fetched, and *only* then: a dynamic
 * `import()` inside the effect, so the library is a second chunk that a
 * Safari reader and every reader of a `mp4` clip never download. An
 * `mp4` needs none of this and gets none of it.
 *
 * **No captions, and that is a gap rather than a decision.** There is no
 * caption track on any of these clips because nobody has written one.
 * `<track>` goes here the day there is a `.vtt` to point it at, and until
 * then the description under the player is what a viewer who cannot hear
 * it has. Saying so here rather than leaving the omission to look
 * deliberate.
 */

export interface StudioVideoHandle {
  /** Jump to a second and keep playing if it already was. */
  seek(seconds: number): void;
  play(): void;
  pause(): void;
}

export function StudioVideo({
  video,
  poster,
  title,
  width,
  height,
  active = true,
  fill = false,
  className,
  onTime,
  handleRef,
}: {
  video: PinVideo;
  /** The still under it. Null draws the skeleton ground instead. */
  poster: string | null;
  /** Names the player for a screen reader. The pin's title. */
  title: string;
  width: number;
  height: number;
  /** False pauses and unloads — the off-screen clips in the watch feed. */
  active?: boolean;
  /** Fill the parent instead of holding its own aspect box. The watch
      feed gives every clip the whole screen; the detail page does not. */
  fill?: boolean;
  className?: string;
  /** Called on each whole second that passes, and once on seek. Whole
      seconds because the only consumer is `activeAt`, which is indexed in
      seconds — reporting every `timeupdate` would re-render the materials
      list four times a second to change nothing. */
  onTime?: (seconds: number) => void;
  handleRef?: RefObject<StudioVideoHandle | null>;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const lastSecond = useRef(-1);
  /* What is currently attached to the element. Assigning `src` reloads a
     media element and drops whatever was playing, so an effect that
     re-runs for an unrelated reason must not assign the same URL again —
     which it did, and which showed up as a clip that played for four
     frames on mount and then sat on a dark frame. React's own
     double-invocation in development is the re-run that found it; a
     `wantsMotion` change is the one that would have found it in
     production. */
  const attached = useRef<string | null>(null);

  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(true);
  const [failed, setFailed] = useState(false);
  /* Null until the browser has been asked. Not `false`: "we have not
     checked whether this person wants motion" and "they do" are different
     states, and starting playback during the first is the bug this
     avoids. */
  const [wantsMotion, setWantsMotion] = useState<boolean | null>(null);

  /* ---- Does this person want a moving picture at all? ---- */
  useEffect(() => {
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

    /* `connection` is not in every browser's lib.dom. Read defensively
       rather than cast the global — a missing API means "no opinion",
       which is the same answer as "data saver is off". */
    const connection = (
      navigator as Navigator & { connection?: { saveData?: boolean } }
    ).connection;

    const decide = () => setWantsMotion(!motion.matches && !connection?.saveData);
    decide();

    motion.addEventListener("change", decide);
    return () => motion.removeEventListener("change", decide);
  }, []);

  /* ---- Attach the source ---- */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    /* Nothing is fetched while the clip is off screen or motion is
       unwanted. `preload="none"` on the element covers the first frame of
       this; not setting `src` at all covers the rest, because a browser
       will happily start buffering a source it has been given even with
       preload hinted off. */
    if (!active || wantsMotion === null) return;

    let cancelled = false;
    let detach: (() => void) | undefined;

    if (attached.current === video.src) return;

    if (video.format === "mp4" || el.canPlayType("application/vnd.apple.mpegurl")) {
      el.src = video.src;
      attached.current = video.src;
    } else {
      void (async () => {
        try {
          const { default: Hls } = await import("hls.js");
          if (cancelled || !videoRef.current) return;
          if (!Hls.isSupported()) {
            setFailed(true);
            return;
          }

          /* `maxBufferLength` well under the default: this is a clip of a
             minute, and buffering thirty seconds ahead of somebody who is
             about to swipe past it spends their data on a room they have
             already decided against. */
          const hls = new Hls({ maxBufferLength: 10, capLevelToPlayerSize: true });
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setFailed(true);
          });
          hls.loadSource(video.src);
          hls.attachMedia(videoRef.current);
          attached.current = video.src;
          detach = () => {
            attached.current = null;
            hls.destroy();
          };
        } catch {
          /* The chunk did not load — an offline reader, a blocked CDN.
             The poster stays and says so. */
          if (!cancelled) setFailed(true);
        }
      })();
    }

    return () => {
      cancelled = true;
      detach?.();
    };
  }, [active, video.src, video.format, wantsMotion]);

  /* ---- Play, pause, and the off-screen case ---- */

  /* One expression for "this clip ought to be running", read by the
     effect below and by `onCanPlay`. Two surfaces asking the same
     question two ways is how a clip ends up playing off screen. */
  const shouldPlay = active && wantsMotion === true;

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;

    if (!active || wantsMotion === false) {
      el.pause();
      /* Rewound, so a clip swiped back to starts where the poster showed
         it rather than four seconds in from the last time it was on
         screen. */
      if (!active) el.currentTime = 0;
      return;
    }

    if (shouldPlay) {
      /* `play()` rejects when a browser declines the autoplay — which it
         will, correctly, if this is ever called unmuted — and it also
         rejects when the source is not loadable yet, which is the
         ordinary case on a first mount. Caught rather than left as an
         unhandled rejection; `onCanPlay` is what actually starts it in
         that second case. */
      void el.play().catch(() => setPlaying(false));
    }
  }, [active, shouldPlay, wantsMotion]);

  const report = useCallback(
    (seconds: number) => {
      const whole = Math.floor(seconds);
      if (whole === lastSecond.current) return;
      lastSecond.current = whole;
      onTime?.(whole);
    },
    [onTime],
  );

  useImperativeHandle(
    handleRef,
    () => ({
      seek(seconds: number) {
        const el = videoRef.current;
        if (!el) return;
        el.currentTime = seconds;
        /* Reported straight away rather than waiting for `timeupdate`:
           tapping row 7 has to light row 7 now, not a tick later. */
        lastSecond.current = -1;
        report(seconds);
      },
      play() {
        void videoRef.current?.play().catch(() => undefined);
      },
      pause() {
        videoRef.current?.pause();
      },
    }),
    [report],
  );

  function onTimeUpdate() {
    const el = videoRef.current;
    if (!el) return;

    report(el.currentTime);

    /* The bar is written straight to the DOM, not through state. At four
       `timeupdate`s a second, through React, this would re-render the
       player — and in the watch feed, its whole materials list — sixty
       times a minute to move a rectangle. */
    const bar = progressRef.current;
    if (bar && el.duration > 0) {
      bar.style.transform = `scaleX(${el.currentTime / el.duration})`;
    }
  }

  function toggle() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }

  function toggleMute() {
    const el = videoRef.current;
    if (!el) return;
    /* The element is the source of truth, not the state: a browser can
       mute a video on its own to keep autoplay alive, and a toggle that
       read React state would then be one press behind what the person
       can hear. */
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  if (failed) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-sunk px-3 text-center text-caption text-faint",
          fill ? "size-full" : undefined,
          className,
        )}
        style={fill ? undefined : { aspectRatio: `${width} / ${height}` }}
        role="img"
        aria-label={`${title} — video unavailable`}
      >
        <span>This clip would not play. The room is still below.</span>
      </div>
    );
  }

  const duration = video.durationSeconds;

  return (
    <div
      className={cn(
        "group/video relative overflow-hidden bg-deep",
        fill ? "size-full" : undefined,
        className,
      )}
      style={fill ? undefined : { aspectRatio: `${width} / ${height}` }}
    >
      <video
        ref={videoRef}
        poster={poster ?? undefined}
        aria-label={title}
        muted={muted}
        loop
        playsInline
        preload="none"
        onTimeUpdate={onTimeUpdate}
        /* The source can become playable well after the effect that
           attached it ran — on a first mount it always does. Without
           this, a clip's autoplay is whatever `play()` managed before the
           bytes arrived, which is nothing. */
        onCanPlay={() => {
          if (shouldPlay) void videoRef.current?.play().catch(() => undefined);
        }}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => setFailed(true)}
        className={cn("size-full", fill ? "object-cover" : "object-contain")}
      />

      {/* The controls, in two arrangements, because the two surfaces this
          plays on have different bottoms.

          On a pin's page the clip sits in a card with the page under it,
          so a bar along its foot is where a player's controls belong and
          nothing is competing for that edge.

          Full-bleed, the foot of the clip is the foot of the screen —
          and that is where the room's name, its architect and "shop this
          room" already are. So the controls go to the top: a hairline of
          progress along the very edge, and the two buttons opposite the
          way out. Which is also where every vertical feed has ended up
          putting them, for this reason rather than by imitation.

          No scrubber in either. A drag target on a clip inside a
          vertically swiped feed competes with the swipe, and every
          attempt to seek would be a coin toss between moving the clip and
          moving the feed. Seeking is what tapping a line in the materials
          list does, and on a sixty-second clip that is a better handle
          than a 4px track. */}
      {fill ? (
        <>
          <div className="pointer-events-none absolute inset-x-0 top-0 h-0.5 bg-on-photo-cta/20">
            <div
              ref={progressRef}
              className="h-full origin-left scale-x-0 bg-on-photo-cta"
            />
          </div>

          <div className="absolute right-3 top-3 z-10 flex flex-col gap-2">
            <ControlButton
              onClick={toggle}
              label={playing ? `Pause ${title}` : `Play ${title}`}
            >
              {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            </ControlButton>
            <ControlButton
              onClick={toggleMute}
              pressed={!muted}
              label={muted ? `Unmute ${title}` : `Mute ${title}`}
            >
              {muted ? <SoundOff className="size-4" /> : <SoundOn className="size-4" />}
            </ControlButton>
          </div>
        </>
      ) : (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-2 bg-gradient-to-t from-deep/70 to-transparent px-3 pb-3 pt-8">
          <ControlButton
            onClick={toggle}
            label={playing ? `Pause ${title}` : `Play ${title}`}
          >
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
          </ControlButton>

          <div className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-on-photo-cta/25">
            <div
              ref={progressRef}
              className="h-full origin-left scale-x-0 rounded-full bg-on-photo-cta"
            />
          </div>

          {duration !== null && (
            <span className="nums shrink-0 text-micro text-on-photo-cta/90">
              {formatClock(duration)}
            </span>
          )}

          <ControlButton
            onClick={toggleMute}
            pressed={!muted}
            label={muted ? `Unmute ${title}` : `Mute ${title}`}
          >
            {muted ? <SoundOff className="size-4" /> : <SoundOn className="size-4" />}
          </ControlButton>
        </div>
      )}

      {/* Nothing is playing and nothing was going to: the reader asked for
          no motion, or their browser is saving data. A play control over
          the poster is the whole of the accommodation — it does not
          explain itself, because somebody who turned that setting on
          knows why the video is not playing. */}
      {wantsMotion === false && !playing && (
        <button
          type="button"
          onClick={() => {
            setWantsMotion(true);
            void videoRef.current?.play().catch(() => undefined);
          }}
          aria-label={`Play ${title}`}
          className="absolute inset-0 grid place-items-center focus-visible:outline-none"
        >
          <span className="grid size-14 place-items-center rounded-full bg-photo-cta/90 text-on-photo-cta shadow-lg backdrop-blur-sm">
            <Play className="size-6" />
          </span>
        </button>
      )}
    </div>
  );
}

/**
 * One round control on a photograph.
 *
 * `pointer-events-auto` on every one of them, because the bar they sit in
 * is `pointer-events-none` — the gradient behind the controls must not
 * swallow a tap meant for the clip, and on the watch feed it must not
 * swallow a swipe either.
 */
function ControlButton({
  onClick,
  label,
  pressed,
  children,
}: {
  onClick: () => void;
  label: string;
  pressed?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      className="tap-target pointer-events-auto grid size-9 shrink-0 place-items-center rounded-full bg-photo-cta/90 text-on-photo-cta backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {children}
    </button>
  );
}
