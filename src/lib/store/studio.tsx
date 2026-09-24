"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRenderLoopGuard } from "@/lib/dev/render-loop-guard";
import type { IdeaView, SpaceView, StudioRoom } from "@/lib/types/studio";

/**
 * Saves and Spaces, client-side.
 *
 * Only *types* are imported from `@/lib/data/studio`, never its runtime
 * exports: that module pulls in `@/lib/db` (Prisma) and `@/lib/http`, and
 * a value import here would drag both into the browser bundle. `import
 * type` is erased at compile time — `isolatedModules` in `tsconfig.json`
 * enforces it — so it costs nothing and cannot leak a server dependency.
 * The same discipline `src/lib/store/projects.tsx` follows, for the same
 * reason.
 *
 * Nothing here is in `localStorage`. Section 31 of the brief is right
 * that it should not be, and the project store's own migration off it —
 * still visible as `localImport` in that file — is the reason: a
 * collection someone spends a month building must not live in one
 * browser. Saves are a `fetch` against `/api/v1/studio/save` and the
 * server owns the truth.
 *
 * ## Why saved ids and not saved ideas
 *
 * This holds a `Set` of idea ids, not the ideas themselves. A feed page
 * already carries `idea.saved` from the server; what the client needs on
 * top of that is *what has changed since the page rendered*, so that
 * saving something in a modal fills the heart on the tile behind it and
 * on the same tile in a different tab of the feed. A second copy of the
 * ideas would be a cache to invalidate; a set of ids is an overlay.
 */

interface StudioApi {
  /** True once the initial spaces fetch has settled — successfully, as
      "signed out", or as a failure. */
  ready: boolean;
  signedIn: boolean;

  /** Rooms this customer has, for the save sheet and the Spaces page. */
  spaces: SpaceView[];
  spacesError: string | null;
  refreshSpaces: () => void;

  /**
   * Whether an idea is saved, as far as this session knows.
   *
   * `undefined` means "no opinion — use what the server sent with the
   * idea". That third state matters: `false` would tell a tile whose
   * server-rendered state is "saved" to draw a hollow heart the moment
   * this store mounts.
   */
  savedOverride: (ideaId: string) => boolean | undefined;

  /** Saves, optionally filing into Spaces at the same time. Resolves to
      the number of Spaces it actually landed in. */
  save: (ideaId: string, spaceIds?: string[]) => Promise<number>;
  unsave: (ideaId: string) => Promise<void>;

  createSpace: (input: {
    name: string;
    room?: StudioRoom;
    budgetPaise?: number;
  }) => Promise<SpaceView>;
}

const StudioContext = createContext<StudioApi | null>(null);

export function useStudio(): StudioApi {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used inside <StudioProvider>");
  return context;
}

/** Reads the `{ data }` / `{ error }` envelope every `/api/v1` route
    answers with, and turns a failure into a thrown `Error` carrying the
    message the server wrote for a customer to read. */
async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });

  const body = (await response.json().catch(() => null)) as
    | { data?: T; error?: { message?: string } }
    | null;

  if (!response.ok) {
    throw new Error(body?.error?.message ?? "Something went wrong. Please try again.");
  }
  return body?.data as T;
}

export function StudioProvider({
  children,
  signedIn,
}: {
  children: ReactNode;
  /* Read from the session cookie in a server component and handed down,
     rather than discovered with a request. The cookie is httpOnly, so the
     browser cannot see it — the root layout already does exactly this for
     the projects store. */
  signedIn: boolean;
}) {
  /* Phase 0's first report was the boards tab freezing the browser.
     Every Studio page is inside this provider, so a loop in any of
     them re-renders through here. */
  useRenderLoopGuard("StudioProvider");

  const [spaces, setSpaces] = useState<SpaceView[]>([]);
  const [spacesError, setSpacesError] = useState<string | null>(null);
  const [ready, setReady] = useState(!signedIn);
  const [nonce, setNonce] = useState(0);

  /** ideaId → saved. Absent means "no opinion"; see `savedOverride`. */
  const [overrides, setOverrides] = useState<Map<string, boolean>>(() => new Map());

  useEffect(() => {
    /* Nothing to fetch, and nothing to set: `spaces` already starts empty
       and `ready` already starts `true` when signed out. Writing those
       values again here would be a cascading render for no change, which
       is what `react-hooks/set-state-in-effect` exists to catch.

       `signedIn` comes from the server layout and cannot flip without a
       navigation, so there is no "signed out mid-session" case to clean
       up after. */
    if (!signedIn) return;

    /* Cancelled on unmount and on a refresh that supersedes this one, so
       a slow first response cannot overwrite a fast second. */
    const controller = new AbortController();

    request<{ spaces: SpaceView[] }>("/api/v1/studio/spaces", {
      signal: controller.signal,
    })
      .then((data) => {
        setSpaces(data.spaces);
        setSpacesError(null);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setSpacesError(error instanceof Error ? error.message : "Could not load spaces");
      })
      .finally(() => {
        if (!controller.signal.aborted) setReady(true);
      });

    return () => controller.abort();
  }, [signedIn, nonce]);

  const refreshSpaces = useCallback(() => setNonce((n) => n + 1), []);

  const savedOverride = useCallback(
    (ideaId: string) => overrides.get(ideaId),
    [overrides],
  );

  const save = useCallback(
    async (ideaId: string, spaceIds: string[] = []) => {
      /* Optimistic, and reverted on failure. A heart that waits for a
         round trip before filling feels broken on a phone, and this is the
         single most-tapped control in Studio. */
      setOverrides((current) => new Map(current).set(ideaId, true));

      try {
        const data = await request<{ spaces: number }>("/api/v1/studio/save", {
          method: "POST",
          body: JSON.stringify({ ideaId, spaceIds }),
        });

        /* A space that gained an idea has a new count and possibly a new
           cover, and both are on screen on the Spaces page. */
        if (spaceIds.length) refreshSpaces();
        return data.spaces;
      } catch (error) {
        setOverrides((current) => {
          const next = new Map(current);
          next.delete(ideaId);
          return next;
        });
        throw error;
      }
    },
    [refreshSpaces],
  );

  const unsave = useCallback(async (ideaId: string) => {
    setOverrides((current) => new Map(current).set(ideaId, false));

    try {
      await request(`/api/v1/studio/save/${encodeURIComponent(ideaId)}`, {
        method: "DELETE",
      });
    } catch (error) {
      setOverrides((current) => {
        const next = new Map(current);
        next.delete(ideaId);
        return next;
      });
      throw error;
    }
  }, []);

  const createSpace = useCallback(
    async (input: { name: string; room?: StudioRoom; budgetPaise?: number }) => {
      const data = await request<{ space: SpaceView }>("/api/v1/studio/spaces", {
        method: "POST",
        body: JSON.stringify(input),
      });

      /* Prepended rather than refetched: the list is ordered by "recently
         worked on" and a space created a moment ago is the newest thing
         there, so the server would return this same order anyway. */
      setSpaces((current) => [data.space, ...current]);
      return data.space;
    },
    [],
  );

  const value = useMemo<StudioApi>(
    () => ({
      ready,
      signedIn,
      spaces,
      spacesError,
      refreshSpaces,
      savedOverride,
      save,
      unsave,
      createSpace,
    }),
    [
      ready,
      signedIn,
      spaces,
      spacesError,
      refreshSpaces,
      savedOverride,
      save,
      unsave,
      createSpace,
    ],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

/** Whether to draw a filled heart: this session's opinion if it has one,
    otherwise what the server sent with the idea. */
export function isSaved(idea: IdeaView, override: boolean | undefined): boolean {
  return override ?? idea.saved ?? false;
}
