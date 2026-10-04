/**
 * One `application/ld+json` block.
 *
 * A server component with no client cost — it renders a `<script>` tag
 * that nothing ever hydrates, which is the whole point: structured data
 * is for crawlers and must be in the HTML the server sends, not written
 * in by an effect a crawler may never run.
 *
 * The escaping is the only thing here worth reading twice. Product names
 * in this catalogue come out of manufacturer PDFs and a retailer scrape,
 * and several hundred of them are already known to carry stray brackets
 * and punctuation from bad extraction. A `</script>` sequence inside any
 * one of them would close this tag early and turn the rest of the JSON
 * into markup the browser executes. `JSON.stringify` does not escape `<`,
 * because JSON has no reason to — so it is escaped here, as a unicode
 * sequence that is still valid JSON and parses back to the same string.
 *
 * `dangerouslySetInnerHTML` rather than a child, deliberately: React
 * would HTML-escape a string child, and `&quot;` inside a JSON-LD block
 * makes it unparseable.
 */
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
