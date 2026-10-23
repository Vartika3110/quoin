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
import { SearchPalette } from "@/components/storefront/nav/SearchPalette";
import {
  AiSearchSheet,
  type AiSearchMode,
} from "@/components/storefront/ai/AiSearchSheet";

/**
 * One palette, many triggers.
 *
 * The desktop search bar, the mobile search field and the empty-state
 * "search instead" links all open the same thing. Mounting a palette
 * inside each of them would mean three copies of the fetch logic, three
 * keyboard listeners fighting over ⌘K, and a stale one left open behind a
 * closed drawer. So the palette is mounted once here and opened through
 * context.
 *
 * The global shortcut lives here too, for the same reason: exactly one
 * listener owns ⌘K.
 *
 * **The AI sheet is mounted here as well**, and for the identical
 * argument. The camera and the microphone appear in the phone search
 * field, inside the palette, and on the home screen's own search row;
 * three mounts would mean three sheets, and closing the palette with the
 * camera open would leave an orphan behind it. `openAi("photo" | "voice")`
 * is how any trigger reaches it.
 */

interface SearchApi {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  /**
   * Opens the camera or the voice assistant.
   *
   * Closes the palette on the way, because both of them are a *different*
   * way of asking the same question — leaving a text palette open behind
   * a camera sheet means two search surfaces stacked, and dismissing the
   * top one reveals a stale list underneath.
   */
  openAi: (mode: AiSearchMode) => void;
}

const SearchContext = createContext<SearchApi | null>(null);

export function SearchProvider({
  children,
  suggestedTerms,
}: {
  children: ReactNode;
  /** Real category names from the catalogue, not invented search terms. */
  suggestedTerms: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [aiMode, setAiMode] = useState<AiSearchMode | null>(null);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  const openAi = useCallback((mode: AiSearchMode) => {
    setIsOpen(false);
    setAiMode(mode);
  }, []);
  const closeAi = useCallback(() => setAiMode(null), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmdK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";

      /* `/` is the other conventional shortcut, but only when the caret
         is not already somewhere that accepts a slash. Without this
         check, typing a URL fragment or a note opens the palette and eats
         the character. */
      const target = e.target as HTMLElement | null;
      const typing =
        target?.isContentEditable ||
        ["INPUT", "TEXTAREA", "SELECT"].includes(target?.tagName ?? "");
      const slash = e.key === "/" && !typing;

      if (cmdK || slash) {
        e.preventDefault();
        setIsOpen(true);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const api = useMemo<SearchApi>(
    () => ({ open, close, isOpen, openAi }),
    [open, close, isOpen, openAi],
  );

  return (
    <SearchContext.Provider value={api}>
      {children}
      <SearchPalette open={isOpen} onClose={close} suggestedTerms={suggestedTerms} />
      {/* `mode` is only read while open, and `aiMode` is what holds both
          facts — which sheet, and whether there is one. */}
      <AiSearchSheet open={aiMode !== null} mode={aiMode ?? "photo"} onClose={closeAi} />
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchApi {
  const api = useContext(SearchContext);
  if (!api) throw new Error("useSearch must be used inside <SearchProvider>");
  return api;
}
