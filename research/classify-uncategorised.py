"""Assign a Quoin category to every uncategorised product.

Two signals, in order of trust:

1. The merchant's own collections. A product listed under
   `tile-adhesive` is a tile adhesive; that is a merchandiser's judgement,
   not a guess. Collections are weighted by specificity so a precise one
   outranks a catch-all, and brand-only collections carry no category
   signal at all and are ignored.
2. Keywords in the product name, used only where no collection applies.

Anything neither signal resolves stays uncategorised and is reported
rather than forced into a bucket, because a wrong category is worse for
a buyer than an honest "unfiled".
"""
import csv, json, re, sys
from collections import Counter, defaultdict

BATH   = "Bathware & plumbing"
ELEC   = "Electricals & lighting"
TILE   = "Tiling & adhesives"
HARD   = "Hardware & locks"
PAINT  = "Paints & finishes"
CEMENT = "Cement & steel"
PLY    = "Plywood & laminates"
WATER  = "Waterproofing"
KITFIT = "Kitchen & wardrobe fittings"
SINKS  = "Kitchen sinks & faucets"
TOOLS  = "Tools & safety"
APPL   = "Home appliances & security"
GYPSUM = "Gypsum & false ceiling"
SERVICE = "Services"

# collection slug -> (category, specificity 1..3)
COLLECTION_MAP = {
    # tiling & adhesives
    "tile-adhesive": (TILE, 3), "white-tile-adhesive": (TILE, 3),
    "grey-tile-adhesive": (TILE, 3), "roff-tile-adhesive": (TILE, 3),
    "epoxy-grout": (TILE, 3), "tile-accessories": (TILE, 3),
    "tiling-materials": (TILE, 2), "tiling": (TILE, 2), "adhesives": (TILE, 2),
    "sealants-tapes": (TILE, 2), "silicon-sealant": (TILE, 3),
    "block-jointing": (TILE, 3), "sbr-latex": (TILE, 3),
    "fevicol-supplies": (TILE, 2),
    # bathware & plumbing
    "sanitary-bath-fittings": (BATH, 3), "jaquar-bathroom": (BATH, 3),
    "bathroom-renovation-materials": (BATH, 2),
    "pipes-plumbing": (BATH, 2), "plumbing": (BATH, 2),
    "pvc-pipe": (BATH, 3), "pipe-fittings": (BATH, 3),
    "overhead-tanks": (BATH, 3),
    # electricals & lighting
    "switches-sockets": (ELEC, 3), "led-lights": (ELEC, 3),
    "lighting": (ELEC, 2), "philips-led": (ELEC, 3),
    "legrand-switches": (ELEC, 3), "wires": (ELEC, 3),
    "electrical-wires": (ELEC, 3), "frls-wire": (ELEC, 3),
    "fr-wire-price": (ELEC, 3), "finolex-silver-fr-wires": (ELEC, 3),
    "anchor-advance-fr-wires": (ELEC, 3), "polycab-wires": (ELEC, 3),
    "finolex-wire": (ELEC, 3), "speaker-cable": (ELEC, 3),
    "cable-accessories": (ELEC, 3), "conduit-pipe": (ELEC, 3),
    "electrical-conduit-pipes": (ELEC, 3), "electrical-piping": (ELEC, 3),
    "mcb": (ELEC, 3), "rccb": (ELEC, 3), "distribution-board": (ELEC, 3),
    "ceilingfans-exhaust": (ELEC, 3),
    # paints & finishes
    "painting": (PAINT, 2), "emulsion-paint": (PAINT, 3),
    "enamel-paint": (PAINT, 3), "putty-primer": (PAINT, 3),
    "wall-putty": (PAINT, 3), "wall-primer": (PAINT, 3),
    "wood-primer": (PAINT, 3), "wood-polish-finishes": (PAINT, 3),
    "all-paints": (PAINT, 2), "asian-paints-apex": (PAINT, 3),
    "asian-paints-ace": (PAINT, 3), "birla-white-putty": (PAINT, 3),
    # waterproofing
    "waterproofing": (WATER, 3), "waterproofing-supplies": (WATER, 3),
    "terrace-waterproofing": (WATER, 3), "waterproofing-coating": (WATER, 3),
    "waterproofing-primer": (WATER, 3), "damp-proof-paint": (WATER, 3),
    "asian-paints-waterproofing": (WATER, 3), "crack-repair": (WATER, 3),
    "dr-fixit-supplies": (WATER, 2),
    # cement & steel
    "cement": (CEMENT, 3), "cement-1": (CEMENT, 3), "grey-cement": (CEMENT, 3),
    "white-cement": (CEMENT, 3), "ppc-cement": (CEMENT, 3),
    "opc-53-grade-cement": (CEMENT, 3), "ultratech-cement": (CEMENT, 3),
    "birla-white-cement": (CEMENT, 3), "birla-super-cement": (CEMENT, 3),
    "acc-cement": (CEMENT, 3), "jsw-cement": (CEMENT, 3),
    "ramco-cement": (CEMENT, 3), "priya-cement": (CEMENT, 3),
    "maha-cement": (CEMENT, 3),
    # plywood & laminates
    "plywood": (PLY, 3), "plywood-mdf-hdhmr": (PLY, 3),
    "marine-plywood": (PLY, 3), "mr-plywood": (PLY, 3),
    "mr-grade-plywood": (PLY, 3), "greenply-plywood": (PLY, 3),
    "century-plywood": (PLY, 3), "archidply-plywood": (PLY, 3),
    "action-tesa-board": (PLY, 3), "archid-action-tesa": (PLY, 3),
    "hdhmr-board": (PLY, 3), "mdf-board": (PLY, 3),
    "boilo-board": (PLY, 3), "laminates": (PLY, 3),
    # gypsum & false ceiling
    "gyproc": (GYPSUM, 3), "gypsum-plaster": (GYPSUM, 3),
    "gypsum-drywall-false-ceiling": (GYPSUM, 3), "gypsum-powder": (GYPSUM, 3),
    "pop-powder": (GYPSUM, 3), "plastering-prunning": (GYPSUM, 2),
    # kitchen & wardrobe fittings
    "kitchen-systems-hardware": (KITFIT, 3), "kitchen-systems-accessories": (KITFIT, 3),
    "modular-kitchen-accessories": (KITFIT, 3), "modular": (KITFIT, 2),
    "wardrobe-fittings": (KITFIT, 3), "wardrobe-bed-fittings": (KITFIT, 3),
    "cabinet-hardware": (KITFIT, 3), "cabinet-hinges": (KITFIT, 3),
    "cabinet-handle": (KITFIT, 3), "hinges-channels-handles": (KITFIT, 3),
    "telescopic-channel": (KITFIT, 3), "tandem-box": (KITFIT, 3),
    "hettich-hardware": (KITFIT, 2), "hettich-hinge": (KITFIT, 3),
    "ebco-hardware": (KITFIT, 2), "ebco-hinges": (KITFIT, 3),
    "glass-hardware": (KITFIT, 2),
    # kitchen sinks & faucets
    "kitchen-sinks-faucets": (SINKS, 3),
    # hardware & locks
    "door-lock": (HARD, 3), "door-locks-hardware": (HARD, 3),
    "door-hardware": (HARD, 3), "europa-lock": (HARD, 3),
    "godrej-lock": (HARD, 3), "hardware": (HARD, 1),
    # tools & safety
    "power-tools-accessories": (TOOLS, 3), "general-hardware-tools": (TOOLS, 2),
    "safety-tools-workwear": (TOOLS, 3), "painting-tools": (TOOLS, 3),
    # appliances & security
    "home-appliances-power-backup": (APPL, 3), "cctv-surveillance": (APPL, 3),
    # broad catch-alls: real signal, but the weakest
    "construction-materials": (CEMENT, 1), "building-materials": (CEMENT, 1),
}

# Name keywords, used only when no collection resolves. First match wins.
KEYWORDS = [
    # Services first: these are bookable, not stock, and must never be
    # filed as goods.
    (r"\b(service|installation charge|unloading|labour)\b", SERVICE),
    # Networking before tools, because a Wi-Fi router and a plunge router
    # share a word and mean entirely different things.
    (r"\b(wi-?fi|router\s|rj45|ethernet|network|power adapter)\b", APPL),
    (r"\b(cctv|nvr|dvr|camera|surveillance)\b", APPL),
    (r"\b(inverter|battery|ups|chimney|hood|geyser|water heater)\b", APPL),
    (r"\b(sink|faucet)\b", SINKS),
    (r"\b(drill|hacksaw|blade|grinder|screwdriver|plier|spanner|wrench|tool|helmet|glove|safety)\b", TOOLS),
    (r"\b(plunge router|nailer|demolition hammer|rotary hammer|heat gun|"
     r"blower|trimmer|laser (distance|line)|distance meter|line laser|"
     r"vacuum|protection sheet|lubricant|wd\s?40)\b", TOOLS),
    (r"\b(gypsum|pop |plaster of paris|false ceiling|drywall)\b", GYPSUM),
    (r"\b(tandem|pullout|pull out|magic corner|basket|carousel|wardrobe|cabinet|hinge|channel|larder|pantry)\b", KITFIT),
    (r"\b(tile adhesive|grout|epoxy|adhesive|sealant|silicone|mastic|glue|"
     r"tile cleaner|metal paste|hardener)\b", TILE),
    # Site consumables and hand tools a trade buyer picks up with the job.
    (r"\b(trowel|gurmala|masking tape|sanding paper|sandpaper|"
     r"paint brush|roller|float|chisel|measuring tape)\b", TOOLS),
    # Plumbing fittings, named by fitting rather than by material.
    (r"\b(flowguard|grating|reducing|male adapter|female adapter|coupler|"
     r"elbow|\btee\b|union|nipple|bend|saddle clamp)\b", BATH),
    (r"\b(cement|tmt|steel bar|aggregate|sand)\b", CEMENT),
    (r"\b(plywood|mdf|hdhmr|laminate|board|veneer)\b", PLY),
    (r"\b(waterproof|damp|latex|bitumen)\b", WATER),
    (r"\b(paint|primer|putty|emulsion|enamel|polish|distemper|thinner)\b", PAINT),
    (r"\b(wire|cable|switch|socket|mcb|rccb|led|light|lamp|fan|conduit|holder|regulator)\b", ELEC),
    (r"\b(cpvc|upvc|pvc|pipe|tap|shower|basin|closet|wc|cistern|flush|bib|valve|trap|waste|tank)\b", BATH),
    (r"\b(spout|diverter|towel rail|towel ring|floor drain|drain|"
     r"wall flange|bath ?tub|health faucet|jaquar)\b", BATH),
    (r"\b(lock|latch|bolt|handle|door|screw|anchor fastener|saddle)\b", HARD),
]

sp = sys.argv[1]
cmap = json.load(open(f"{sp}/collections-map.json"))
rows = list(csv.DictReader(open("/Users/gg/Desktop/Quion/research/data/all-products.csv", encoding="utf-8")))

pslug = lambda u: re.sub(r".*/products/", "", u).strip("/")
member = defaultdict(list)
for coll, prods in cmap.items():
    for p in prods:
        member[p].append(coll)

out, how = {}, Counter()
unresolved = []
for r in rows:
    if (r["category"] or "").strip():
        continue
    s = pslug(r["url"])
    votes = Counter()
    for coll in member.get(s, []):
        if coll in COLLECTION_MAP:
            cat, weight = COLLECTION_MAP[coll]
            votes[cat] += weight
    if votes:
        out[s] = votes.most_common(1)[0][0]
        how["collection"] += 1
        continue
    name = (r["name"] or "").lower()
    for pattern, cat in KEYWORDS:
        if re.search(pattern, name):
            out[s] = cat
            how["keyword"] += 1
            break
    else:
        unresolved.append(r)
        how["unresolved"] += 1

# ---- corrections -------------------------------------------------------
# A handful of names are unambiguous enough to overrule the collection
# vote. "Pullout" puts a pullout faucet in with the drawer pullouts, and
# a sink tap is a sink tap whichever aisle the merchant filed it under.
CORRECTIONS = [
    (r"\b(faucet|sink cock|kitchen sink)\b", SINKS, {KITFIT, HARD}),
]

corrected = 0
name_by_slug = {pslug(r["url"]): (r["name"] or "").lower() for r in rows}
for slug_, cat in list(out.items()):
    for pattern, target, only_from in CORRECTIONS:
        if cat in only_from and re.search(pattern, name_by_slug.get(slug_, "")):
            out[slug_] = target
            corrected += 1
            break
if corrected:
    print(f"corrections applied: {corrected}")

json.dump(out, open(f"{sp}/category-map.json", "w"), indent=1, sort_keys=True)
total = sum(how.values())
print(f"classified {len(out)} of {total} uncategorised products "
      f"({len(out) * 100 // total}%)")
print("  by signal:", dict(how))
print("\ndistribution:")
for cat, n in Counter(out.values()).most_common():
    print(f"   {n:>4}  {cat}")
print(f"\nstill unresolved ({len(unresolved)}):")
for r in unresolved[:25]:
    print(f"   {r['name'][:62]}")
