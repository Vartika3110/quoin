/**
 * The string arithmetic behind a segmented code field.
 *
 * Pulled out of `src/components/ui/OtpInput.tsx` and kept free of React
 * so it can be tested directly. The component is six inputs and a focus
 * rule; everything that can actually be wrong about it — a digit landing
 * in the wrong box, a pasted code overflowing the field, a hole in the
 * middle collapsing and shifting every digit after it left by one — is
 * here.
 *
 * The representation is one string whose index is the box. A blank box
 * inside the code is a space, so position survives; trailing blanks are
 * trimmed so `code.length` still answers "how many digits are entered"
 * and a caller can keep disabling its submit button on that.
 */

/** Space, so index still means box. See the note above. */
const BLANK = " ";

function assemble(boxes: string[], length: number): string {
  return Array.from({ length }, (_, i) => boxes[i] ?? BLANK)
    .join("")
    .replace(/\s+$/, "");
}

/** True once every box holds a digit — no holes, full width. */
export function isComplete(code: string, length: number): boolean {
  return code.length === length && !code.includes(BLANK);
}

export interface DigitWrite {
  /** The code after the write. */
  code: string;
  /**
   * Where focus belongs next — one past the last digit written, clamped
   * to the field. The caller does not need to recompute it from
   * `incoming.length`, which would be wrong whenever the paste was
   * longer than the space left.
   */
  focus: number;
}

/**
 * Writes `incoming` into `code` starting at box `index`.
 *
 * One function for typing, pasting and SMS autofill, because all three
 * reach the component as a change event and differ only in how many
 * characters came along. Non-digits are dropped rather than rejected, so
 * a code pasted as "123 456" or "123-456" works.
 *
 * Anything past the last box is discarded, not wrapped: a customer who
 * pastes a longer string has pasted the wrong thing, and silently
 * keeping its tail would fill the field with the end of it.
 */
export function writeDigits(
  code: string,
  index: number,
  incoming: string,
  length: number,
): DigitWrite {
  const clean = incoming.replace(/\D/g, "");
  if (!clean) return { code, focus: index };

  const boxes = code.slice(0, length).split("");
  let written = 0;
  for (let i = 0; i < clean.length && index + i < length; i += 1) {
    boxes[index + i] = clean[i];
    written += 1;
  }

  return {
    code: assemble(boxes, length),
    focus: Math.min(index + written, length - 1),
  };
}

/**
 * Backspace.
 *
 * Clears the box under the cursor if it holds a digit, otherwise steps
 * back and clears that one — which is what a single input would have
 * done, and the only reading that is not a surprise in a field where the
 * caret has nowhere to sit inside a one-character box.
 */
export function eraseDigit(
  code: string,
  index: number,
  length: number,
): DigitWrite {
  const boxes = code.slice(0, length).split("");
  const occupied = boxes[index] && boxes[index] !== BLANK;
  const target = occupied ? index : index - 1;

  if (target < 0) return { code, focus: 0 };

  boxes[target] = BLANK;
  return { code: assemble(boxes, length), focus: target };
}
