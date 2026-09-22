import { permanentRedirect } from "next/navigation";

/**
 * "Boards" is the word; `/studio/spaces` is the URL.
 *
 * Renaming the route would break every link somebody has already saved or
 * shared, and buys nothing a redirect does not. This exists so the word
 * in the interface is also a URL that works — somebody who reads "Boards"
 * and types it should not get a 404.
 */
export default function BoardsRedirect() {
  permanentRedirect("/studio/spaces");
}
