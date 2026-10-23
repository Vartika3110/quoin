import OpenAI, { toFile } from "openai";
import { AiError, aiClient, asAiError, imageModel } from "@/lib/ai/client";

/**
 * Showing a customer the product in their own room.
 *
 * The question this answers is the one that stops a tile order dead:
 * *what will it actually look like on my floor*. A swatch on a product
 * page cannot answer it, a showroom sample answers it for one square foot,
 * and the customer's own photograph plus the product they are considering
 * answers it properly. Somebody choosing between three tiles renders all
 * three against the same photograph and decides.
 *
 * ## This produces an impression, and the app must say so
 *
 * What comes back is a model's rendering of a plausible installation. It
 * is **not** a photograph of the product in that room, and it is not a
 * colour-accurate proof: screens, lighting and dye lots all move, and the
 * model is interpolating what it cannot see. Every surface that shows one
 * of these labels it — see `VISUAL_DISCLAIMER`, which is rendered on the
 * image itself and not tucked into a tooltip.
 *
 * That discipline is the same one `src/lib/images/generator.ts` records
 * for the catalogue's illustrated products: "Removing that label is the
 * difference between an illustrated catalogue and a misleading one." A
 * render that a customer mistakes for a guarantee is a returned order and
 * a lost customer, and it is the single most damaging thing this feature
 * could do.
 *
 * ## The product's own photograph is used when there is one
 *
 * Passed as a second reference image, so the render shows *that* product
 * rather than the model's idea of the category. Most of this catalogue
 * has no photography — only bathware does — so when there is none the
 * product is described in words instead and the render is correspondingly
 * more of an approximation. Both cases are labelled identically, because
 * the customer cannot be expected to know which one they are looking at.
 */

/** The sentence that goes under every render. Exported so the product
    page, the comparison tray and the download all use the same words. */
export const VISUAL_DISCLAIMER =
  "An AI impression generated from your photo — not a photograph of the installed product. Treat colour, finish and pattern as indicative; order a sample before committing.";

/**
 * Where the product goes.
 *
 * A short closed list rather than free text from the customer. The prompt
 * has to say something specific about the surface being replaced — "lay
 * these across the floor, keeping the perspective of the room" is a
 * different instruction from "mount this on the wall at a sensible
 * height" — and a free-text placement is a prompt the customer writes,
 * which is a prompt nobody reviewed.
 */
export type Placement = "floor" | "wall" | "ceiling" | "worktop" | "in_place";

export const PLACEMENTS: Placement[] = ["floor", "wall", "ceiling", "worktop", "in_place"];

/** What each placement is called on screen, and what it means. */
export const PLACEMENT_LABEL: Record<Placement, { label: string; hint: string }> = {
  floor: { label: "On the floor", hint: "Tiles, stone, wood and vinyl flooring" },
  wall: { label: "On the wall", hint: "Wall tiles, cladding, panelling and paint" },
  ceiling: { label: "On the ceiling", hint: "False ceiling, panelling and ceiling lights" },
  worktop: { label: "On the counter", hint: "Worktops, sinks, hobs and counter fittings" },
  in_place: { label: "Place it in the room", hint: "Taps, lights, furniture and fittings" },
};

export function isPlacement(value: unknown): value is Placement {
  return typeof value === "string" && (PLACEMENTS as string[]).includes(value);
}

/** What the render is for, in the customer's words — kept short and
    optional, and never substituted for the placement instruction. */
export const MAX_NOTE_CHARS = 160;

/** Accepted room photographs. The browser re-encodes to JPEG before
    upload, so this is a guard rather than the common path. */
const IMAGE_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function isVisualisableContentType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.has(contentType.toLowerCase().split(";")[0].trim());
}

/**
 * The render's shape, chosen from the room photograph's own.
 *
 * Taken from the client, which already knows the dimensions because it
 * re-encoded the file — rather than decoded again on the server with
 * `sharp`, which is a native module this app does not otherwise load at
 * request time. Getting this wrong is not cosmetic: a landscape room
 * rendered square is a room with its sides cropped off, and the customer
 * cannot tell whether their wall is missing or the render is.
 */
export type Orientation = "landscape" | "portrait" | "square";

const SIZE: Record<Orientation, "1536x1024" | "1024x1536" | "1024x1024"> = {
  landscape: "1536x1024",
  portrait: "1024x1536",
  square: "1024x1024",
};

export function orientationOf(width: number, height: number): Orientation {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return "square";
  }
  const ratio = width / height;
  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

/** ---- The prompt -------------------------------------------------------- */

const PLACEMENT_INSTRUCTION: Record<Placement, string> = {
  floor:
    "Replace the flooring across the whole floor area visible in the photograph with the specified product. Follow the room's existing perspective exactly: the tile or plank grid must recede with the floor, grout lines must stay parallel to the walls, and the module size must look right for the room. Leave the walls, skirting, doors, furniture and every object standing on the floor exactly as they are, and keep their shadows and contact with the new floor correct.",
  wall:
    "Apply the specified product to the appropriate wall surfaces visible in the photograph. Keep the room's perspective, the position of every switch, socket, window, door frame and fitting, and the existing lighting. Do not change the floor, the ceiling or any furniture.",
  ceiling:
    "Apply the specified product to the ceiling visible in the photograph, following its perspective and keeping the existing light fittings, beams and edges where they are unless the product itself is the light fitting. Do not change the walls, the floor or any furniture.",
  worktop:
    "Apply the specified product to the counter or worktop surfaces visible in the photograph. Keep the cabinets, splashback, sink, taps and appliances exactly where they are, and keep the perspective and the edge profile of the counter correct.",
  in_place:
    "Place the specified product into the photograph where it would actually be installed or used, at the correct physical scale for the room, in the room's own perspective and lighting. If something of the same kind is already there, replace it. Change nothing else in the room.",
};

function prompt(input: {
  placement: Placement;
  product: ProductBrief;
  hasProductPhoto: boolean;
  note: string | null;
}): string {
  const { product } = input;

  const description = [
    product.title,
    product.brand ? `by ${product.brand}` : null,
    product.category ? `(${product.category})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const reference = input.hasProductPhoto
    ? "The SECOND image is the product itself, as Quoin sells it. Match its colour, pattern, texture, sheen and proportions as closely as you can — it is the subject, not a mood reference."
    : "There is no photograph of the product, so render it from the description alone, plainly and typically for its kind. Do not invent decorative detail, branding or patterning that the description does not state.";

  return `You are producing a realistic installation preview for an Indian construction and interiors retailer.

The FIRST image is a photograph of the customer's own room. ${reference}

Product: ${description}

Task: ${PLACEMENT_INSTRUCTION[input.placement]}
${input.note ? `\nThe customer adds: ${input.note}\n` : ""}
Hard requirements:
- Keep the customer's room. The camera position, the proportions of the room, the walls, the windows, the doors, the furniture, the objects and the people must all stay exactly as photographed. You are changing one thing.
- Photographic realism. Match the existing light direction, colour temperature, shadows and reflections. The result must look like the same photograph, not a visualisation.
- Correct physical scale. A 600mm tile and a 300mm tile look different in a room; get the module size right for the product named.
- No text anywhere in the image: no labels, no watermarks, no dimensions, no brand names, no price.
- No extra products, no restyling, no tidying, no new furniture, no change of season or time of day.
- Do not beautify the room. A render of a different, nicer room is useless to somebody deciding what to buy for this one.

Output the edited photograph only.`;
}

/** What the model is told the product is. */
export interface ProductBrief {
  title: string;
  brand: string | null;
  category: string | null;
}

export interface Render {
  /** PNG or WEBP bytes, whatever the model returned. */
  data: Buffer;
  /** Without the dot. */
  extension: string;
  contentType: string;
}

/** ---- Rendering --------------------------------------------------------- */

export async function renderInRoom(input: {
  room: { buffer: Buffer; contentType: string };
  /** Quoin's own photograph of the product, when there is a real one. */
  productPhoto?: { buffer: Buffer; contentType: string } | null;
  product: ProductBrief;
  placement: Placement;
  orientation: Orientation;
  note?: string | null;
}): Promise<Render> {
  const roomType = input.room.contentType.toLowerCase().split(";")[0].trim();
  if (!IMAGE_CONTENT_TYPES.has(roomType)) {
    throw new AiError("unsupported", `Cannot visualise from ${roomType}`);
  }

  /* `toFile` rather than a raw Buffer: the images endpoint is multipart,
     and the filename extension is what tells it how to read the bytes.
     Named by this module, never from anything the customer uploaded —
     `buildStorageKey` in `src/lib/storage/index.ts` records why an
     attacker-controlled filename never gets to name anything. */
  const images = [
    await toFile(input.room.buffer, `room.${extensionFor(roomType)}`, { type: roomType }),
  ];

  if (input.productPhoto) {
    const productType = input.productPhoto.contentType.toLowerCase().split(";")[0].trim();
    if (IMAGE_CONTENT_TYPES.has(productType)) {
      images.push(
        await toFile(input.productPhoto.buffer, `product.${extensionFor(productType)}`, {
          type: productType,
        }),
      );
    }
  }

  const note = input.note?.trim().slice(0, MAX_NOTE_CHARS) || null;

  let response: OpenAI.Images.ImagesResponse;
  try {
    response = await aiClient().images.edit({
      model: imageModel(),
      image: images,
      prompt: prompt({
        placement: input.placement,
        product: input.product,
        hasProductPhoto: images.length > 1,
        note,
      }),
      size: SIZE[input.orientation],
      /* The whole feature depends on the room surviving the edit, which
         is exactly what this setting is for: `low` redraws the scene and
         hands back a room the customer does not recognise. */
      input_fidelity: "high",
      /* `medium`, not `high`. A preview is looked at on a phone for a few
         seconds and `high` roughly triples both the latency and the bill
         for detail that does not change the decision being made. */
      quality: "medium",
      /* WEBP so the payload the browser receives is a third of a PNG's —
         this is a base64 round trip, so the bytes are the latency. */
      output_format: "webp",
      n: 1,
    });
  } catch (error) {
    throw asAiError(error);
  }

  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) {
    /* A refusal lands here — the model declining to edit a photograph,
       for instance one with an identifiable person prominent in it. It is
       not a malfunction, and the route maps it to a sentence saying so
       rather than to "something went wrong". */
    throw new AiError("empty", "Model returned no image");
  }

  return {
    data: Buffer.from(encoded, "base64"),
    extension: "webp",
    contentType: "image/webp",
  };
}

function extensionFor(contentType: string): string {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  return "jpg";
}
