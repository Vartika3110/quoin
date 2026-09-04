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
 */

interface SearchApi {
  open: () => void;
  close: () => void;
  isOpen: boolean;
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

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

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

  const api = useMemo<SearchApi>(() => ({ open, close, isOpen }), [open, close, isOpen]);

  return (
    <SearchContext.Provider value={api}>
      {children}
      <SearchPalette open={isOpen} onClose={close} suggestedTerms={suggestedTerms} />
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchApi {
  const api = useContext(SearchContext);
  if (!api) throw new Error("useSearch must be used inside <SearchProvider>");
  return api;
}
