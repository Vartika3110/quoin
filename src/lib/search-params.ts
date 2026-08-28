/**
 * A repeated query parameter (`?sort=a&sort=b`) arrives as an array. It
 * only ever comes from a malformed link, so the first value wins rather
 * than the request being rejected.
 */
export function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
