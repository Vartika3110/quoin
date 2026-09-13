"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Field, Input } from "@/components/ui/Input";
import { InlineError } from "@/components/ui/ErrorState";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/components/ui/cn";
import { Bolt, Box, Calculator, Grid, Roller } from "@/components/icons";
import { useProjects } from "@/lib/store/projects";

/**
 * A rough room material estimate, feeding real material lines.
 *
 * The coefficients below are the same per-sq.ft. heuristics the design
 * prototype's `ROOM_CALC` used — plausible ratios for an Indian
 * residential room, not a measurement of any actual site. Nothing here
 * claims otherwise: the result is labelled a rough estimate everywhere it
 * appears, and "Add to material list" writes real `ProjectMaterial` rows
 * through the same store every other material on the page goes through,
 * priced at nothing (`unitPricePaise` is left unset, which the API
 * defaults to 0) rather than inventing a rupee figure this calculator has
 * no way to know.
 */

type RoomType = "Bedroom" | "Kitchen" | "Bathroom" | "Living Room";

const ROOM_TYPES: RoomType[] = ["Bedroom", "Kitchen", "Bathroom", "Living Room"];

const ROOM_COEFFICIENTS: Record<
  RoomType,
  { tilesPerSqft: number; paintPerSqft: number; cementPer100Sqft: number; pointsPer30Sqft: number }
> = {
  Bedroom: { tilesPerSqft: 1.1, paintPerSqft: 0.15, cementPer100Sqft: 1, pointsPer30Sqft: 1 },
  Kitchen: { tilesPerSqft: 1.3, paintPerSqft: 0.12, cementPer100Sqft: 1.3, pointsPer30Sqft: 1.6 },
  Bathroom: { tilesPerSqft: 2.2, paintPerSqft: 0.02, cementPer100Sqft: 1.7, pointsPer30Sqft: 0.8 },
  "Living Room": { tilesPerSqft: 1.15, paintPerSqft: 0.18, cementPer100Sqft: 1, pointsPer30Sqft: 1.2 },
};

export interface RoomEstimate {
  tilesSqft: number;
  paintLitres: number;
  cementBags: number;
  electricalPoints: number;
}

/** Pure so the arithmetic is unit-testable without a project or a store. */
export function estimateRoomMaterials(room: RoomType, areaSqft: number): RoomEstimate {
  const f = ROOM_COEFFICIENTS[room];
  return {
    tilesSqft: Math.round(areaSqft * f.tilesPerSqft),
    paintLitres: Math.round(areaSqft * f.paintPerSqft * 10) / 10,
    cementBags: Math.max(1, Math.ceil((areaSqft / 100) * f.cementPer100Sqft)),
    electricalPoints: Math.max(2, Math.ceil((areaSqft / 30) * f.pointsPer30Sqft)),
  };
}

const RESULT_TILES: {
  key: keyof RoomEstimate;
  label: string;
  unit: string;
  Icon: typeof Grid;
}[] = [
  { key: "tilesSqft", label: "Tiles", unit: "sq.ft.", Icon: Grid },
  { key: "paintLitres", label: "Paint / waterproofing", unit: "L", Icon: Roller },
  { key: "cementBags", label: "Cement", unit: "bags", Icon: Box },
  { key: "electricalPoints", label: "Electrical points", unit: "pts", Icon: Bolt },
];

export function RoomCalculator({ projectId }: { projectId: string }) {
  const { addMaterial } = useProjects();
  const toast = useToast();

  const [room, setRoom] = useState<RoomType>("Bedroom");
  const [area, setArea] = useState("");
  const [result, setResult] = useState<RoomEstimate | null>(null);
  const [areaError, setAreaError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  function selectRoom(next: RoomType) {
    setRoom(next);
    setResult(null);
  }

  function handleCalculate() {
    const sqft = Number(area);
    if (!area || !Number.isFinite(sqft) || sqft <= 0) {
      setAreaError("Enter a valid area in sq.ft.");
      setResult(null);
      return;
    }
    setAreaError(null);
    setResult(estimateRoomMaterials(room, sqft));
  }

  async function handleAddToList() {
    if (!result) return;

    /* A value that rounds to zero — a very small bathroom's paint, say —
       is not a real line to add. Every other line still goes in. */
    const lines = RESULT_TILES.map(({ key, unit }) => ({
      title: `${room} ${LINE_NAME[key]} — rough estimate`,
      qty: result[key],
      unit,
    })).filter((l) => l.qty > 0);

    setAdding(true);
    setAddError(null);
    try {
      /* Sequential, not `Promise.all`: the same shape the store's own
         `create` uses to seed a new project's starting tasks, and for the
         same reason — four requests racing each other against one
         project buys nothing a person can see and complicates the one
         that fails. */
      for (const line of lines) {
        await addMaterial(projectId, {
          title: line.title,
          qty: line.qty,
          unit: line.unit,
          status: "planned",
        });
      }
      toast.toast(`${room} estimate added to the material list`);
      setResult(null);
      setArea("");
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setAdding(false);
    }
  }

  return (
    <div>
      <p className="text-body-sm font-medium text-ink">Room type</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {ROOM_TYPES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => selectRoom(r)}
            aria-pressed={room === r}
            className={cn(
              "tap-target relative flex h-9 items-center rounded-full border px-3.5 text-caption font-medium transition-colors",
              room === r
                ? "border-accent bg-accent text-on-accent"
                : "border-line-soft bg-surface text-muted hover:border-line-strong hover:text-ink",
            )}
          >
            {r}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <Field label="Area" htmlFor="room-calc-area" error={areaError}>
          <div className="flex gap-2">
            <Input
              id="room-calc-area"
              type="number"
              inputMode="decimal"
              min={0}
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setResult(null);
                setAreaError(null);
              }}
              placeholder="120"
              trailing={<span className="text-caption">sq.ft.</span>}
              className="nums"
              aria-invalid={areaError ? true : undefined}
            />
            <Button onClick={handleCalculate} className="shrink-0">
              <Calculator className="size-4" />
              Calculate
            </Button>
          </div>
        </Field>
      </div>

      {result && (
        <div className="mt-4 anim-fade">
          <p className="text-micro text-muted">
            A rough estimate from area alone — confirm quantities on a site visit
            before ordering.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2.5">
            {RESULT_TILES.map(({ key, label, unit, Icon }) => (
              <div key={key} className="rounded-card border border-line-soft bg-sunk p-3">
                <Icon className="size-4 text-accent" />
                <p className="nums mt-1.5 text-body-sm font-semibold text-ink">
                  {result[key]} {unit}
                </p>
                <p className="text-micro text-muted">{label}</p>
              </div>
            ))}
          </div>

          {addError && (
            <div className="mt-3">
              <InlineError>{addError}</InlineError>
            </div>
          )}

          <div className="mt-3 grid gap-2">
            <Button onClick={handleAddToList} loading={adding} variant="outline">
              Add to material list
            </Button>
            <Button href="/products" variant="ghost">
              Shop these materials
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const LINE_NAME: Record<keyof RoomEstimate, string> = {
  tilesSqft: "tiling",
  paintLitres: "paint / waterproofing",
  cementBags: "cement",
  electricalPoints: "electrical points",
};
