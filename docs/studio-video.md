# Studio on film

Studio pins can be clips. A pin's materials list can be cued to the
footage, so the room names what it is made of as it plays and every line
is priced from the same catalogue the shop is.

This file is the operational half — what to buy, how a clip gets onto the
site, and what is deliberately not built. The reasoning behind the shapes
lives next to the code: `src/lib/video/index.ts` for delivery,
`StudioVideo` for playback, `activeAt` in `src/lib/types/studio.ts` for
what "showing now" means.

## The honest state

**There is no footage.** Studio has no room photography either — see the
long note on `imageUrlFor` — and film is harder to get than a still,
because it needs an architect who will walk a room with a phone and name
what is in it.

Everything below works the day the first clip arrives. Until then:

- `/studio/watch` renders an empty state that says so in words.
- The "Watch the rooms" line on `/studio` is **absent**, not disabled. A
  navigation item that always leads to "nothing yet" is an announcement of
  something Quoin does not have — the rule commit `339e2e2` settled.
- Nothing anywhere plays stock footage of somebody else's kitchen with
  Quoin prices under it. That is the same lie the catalogue's department
  photography was, moving.

## Delivery: Cloudflare Stream

A sixty-second walkthrough is tens of megabytes at a quality worth
looking at, and the person it has to reach is on a phone on a cell
somewhere the fibre has not arrived. One progressive file makes that
person's decision for them. Stream transcodes a bitrate ladder and serves
HLS, so their browser picks, second by second.

Three environment variables, all optional (`.env.example` has the full
notes):

| Variable | Side | Secret? |
| --- | --- | --- |
| `CF_STREAM_CUSTOMER_CODE` | playback | no — it is in every manifest URL |
| `CF_ACCOUNT_ID` | upload | no |
| `CF_STREAM_API_TOKEN` | upload | **yes** — write access to the whole Stream account |

Unset, a Stream-backed pin renders as its poster with no player. A clip
shipped under `public/studio/` needs none of them and plays as a
progressive MP4 — which is how to try the player before anybody signs up
to anything.

Cost, at the time of writing: about $5 per 1,000 minutes stored per month
and $1 per 1,000 minutes delivered. Twenty one-minute clips is twenty
minutes of storage — roughly a tenth of a dollar a month — and the
delivery bill is a function of how much people actually watch. Check the
current pricing rather than this paragraph before committing to it.

## Getting a clip onto a pin

1. Upload the footage to Stream (dashboard, or `createDirectUpload` in
   `src/lib/video/index.ts` for a browser upload that does not pass
   through Vercel). Wait for it to finish transcoding.
2. Attach it, cueing nothing yet:

   ```bash
   npm run studio:clip -- warm-kitchen-dwarka --uid <stream-uid>
   ```

   The duration and frame size are read back from Cloudflare rather than
   typed — they are facts about the footage.

3. Open the pin, watch it with the materials list beside you, and cue the
   lines by their **displayed number**:

   ```bash
   npm run studio:clip -- warm-kitchen-dwarka --cues 1@4,2@11,3@23
   ```

   A cue owns the time from itself until the next one. Lines you never
   cue stay in the list, priced, and never appear on screen — which is
   right for the cement under the floor.

To undo the whole thing and make it a photograph again:

```bash
npm run studio:clip -- warm-kitchen-dwarka --clear
```

A locally shipped clip takes `--path /studio/name.mp4` instead of
`--uid`, with `--duration`, `--size WxH` and `--poster` typed by hand.

## What is deliberately not built

- **Customer video upload.** The MIME allow-list in
  `src/lib/storage/index.ts` takes no video type. A customer uploading a
  clip of their kitchen is a moderation problem and a transcoding bill
  before it is a feature, and neither has an answer yet.
- **A cueing UI.** `atSeconds` is written only by the script above, by
  somebody who has watched the clip. There is nothing an HTTP endpoint
  could add to that except a way to get it wrong from a browser.
- **Live streaming.** Deliberately, and this is the decision most worth
  writing down. The streaming half is a solved purchase — Stream does
  live ingest too. The other half is a published schedule, chat with
  moderation, and an architect who is reliably live at seven o'clock, and
  none of those is code. A "Live" tab that is dark ninety-nine percent of
  the time is worse than no tab; one showing a fake stream is worse
  still. Revisit when there are architects filming regularly enough that
  a schedule is a real thing to publish.
- **Captions.** There is no `<track>` on these clips because nobody has
  written a `.vtt`. `StudioVideo` says so where the element is. The pin's
  description and its priced list are what a viewer who cannot hear it
  has, which is more than most shoppable video offers, and it is still
  not captions.
