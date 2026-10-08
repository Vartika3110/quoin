"use client";

import { useRef, type ClipboardEvent, type KeyboardEvent } from "react";
import { cn } from "@/components/ui/cn";
import {
  eraseDigit,
  isComplete,
  writeDigits,
} from "@/lib/auth/otp-digits";

/**
 * A segmented one-time-code field.
 *
 * Six boxes rather than one input, because a code arrives from an SMS as
 * six characters a person reads in pairs, and a single box with letter
 * spacing gives no feedback about how many are left. The boxes are the
 * progress indicator.
 *
 * The design problem with segmented inputs is that every convenience a
 * single input gets for free has to be rebuilt: paste, iOS SMS autofill,
 * backspace, arrow keys, and a screen reader being told this is one value
 * and not six unlabelled text fields. All of that is below, and the
 * reasoning for each is worth keeping because the obvious implementation
 * breaks every one of them.
 *
 * Controlled on a single string, never on six pieces of state. The value
 * is the code; the boxes are a rendering of it. Six independent states
 * would mean six places for the code to disagree with itself, and the
 * caller would have to reassemble it to submit.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  id,
  describedBy,
  autoFocus,
  className,
}: {
  /** Digits entered so far — shorter than `length` until complete. */
  value: string;
  onChange: (next: string) => void;
  /**
   * Fired the moment the last digit lands, from the same handler that
   * produced it. Deliberately not an effect watching `value.length`: an
   * effect also fires when the caller clears the field after a failed
   * verify and the customer retypes the same code, and it fires on
   * remount, so a single code could be submitted twice.
   */
  onComplete?: (code: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  /** Applied to the first box, so a `<Field label>` points at something. */
  id?: string;
  /** `aria-describedby` for the hint or error `<Field>` renders. */
  describedBy?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const digits = value.slice(0, length).split("");

  function focusBox(index: number) {
    const target = refs.current[Math.max(0, Math.min(length - 1, index))];
    target?.focus();
    /* Selects whatever is already in the box, so the next keystroke
       overwrites rather than being rejected by `maxLength`. Without this,
       moving back to a filled box and typing does nothing at all. */
    target?.select();
  }

  /**
   * Writes `incoming` into the code starting at `index`.
   *
   * One path for typing, pasting and SMS autofill, because all three
   * arrive as a change event on a box — the only difference is how many
   * characters came with it. Handling a single digit specially and then
   * discovering autofill delivers six into box one is the usual way these
   * components end up with a second, subtly different code path.
   *
   * The string arithmetic lives in `@/lib/auth/otp-digits`, where it is
   * tested without a DOM. What is left here is focus.
   */
  function write(index: number, incoming: string) {
    const { code, focus } = writeDigits(value, index, incoming, length);
    if (code === value) return;

    onChange(code);

    if (isComplete(code, length)) {
      /* Blur so a phone's keyboard drops away before the success state
         appears, rather than covering it. */
      refs.current[length - 1]?.blur();
      onComplete?.(code);
      return;
    }
    focusBox(focus);
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      const { code, focus } = eraseDigit(value, index, length);
      onChange(code);
      focusBox(focus);
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusBox(index - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      focusBox(index + 1);
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      focusBox(0);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      focusBox(length - 1);
    }
  }

  /**
   * Paste is intercepted rather than left to the change event.
   *
   * A paste into a box that already holds a digit is a replacement, and
   * the browser reports that as a change containing only the pasted text
   * — which `write` would then place at this index, silently dropping
   * whatever the customer actually copied beyond the first character. The
   * clipboard is read directly so the whole code lands wherever it was
   * dropped.
   */
  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text");
    /* Pasting the full code into any box fills from the start, because
       someone copying six digits means the code, not an edit at box four. */
    const digitsOnly = pasted.replace(/\D/g, "");
    write(digitsOnly.length >= length ? 0 : index, digitsOnly);
  }

  return (
    <div
      /* One group with one accessible name, so a screen reader announces
         "Enter the code, 6 digits" once instead of reading six anonymous
         text fields. The boxes keep their own position labels for when
         focus moves between them. */
      role="group"
      aria-label={`Enter the ${length}-digit code`}
      aria-describedby={describedBy}
      className={cn("flex items-center gap-2 sm:gap-2.5", className)}
    >
      {Array.from({ length }, (_, index) => {
        const digit = digits[index] && digits[index] !== " " ? digits[index] : "";
        return (
          <input
            key={index}
            ref={(node) => {
              refs.current[index] = node;
            }}
            id={index === 0 ? id : undefined}
            /* `text` with a numeric `inputMode`, not `type="number"`:
               a number input brings spinners, accepts `e` and `-`, and
               on some Android keyboards offers a decimal point. */
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            /* Only the first box advertises itself as the code field.
               Repeating it on all six makes iOS offer the suggestion
               six times over, and Chrome's autofill fill box one with
               the code and boxes two to six with nothing. The multi-
               character value that autofill drops into box one is
               distributed by `write`. */
            autoComplete={index === 0 ? "one-time-code" : "off"}
            name={index === 0 ? "one-time-code" : undefined}
            /* No `maxLength`, deliberately, and this is a reversal worth
               recording. It was 2 — one digit, plus room for a second so
               that a multi-character insertion was not silently cut. That
               is not enough: Android autofill and iOS's SMS suggestion
               insert the whole code into the focused box as a single
               `insertText`, and the browser applies `maxLength` *before*
               the `input` event, so "123456" reached the handler as "12"
               and four digits were gone with nothing to recover them
               from. Verified in the browser — one `beforeinput` carrying
               all six characters, one `input` carrying two.
               The boxes cannot accumulate text without it, because the
               value is controlled and `write` clamps to the field. */
            value={digit}
            disabled={disabled}
            autoFocus={autoFocus && index === 0}
            aria-label={`Digit ${index + 1} of ${length}`}
            aria-invalid={invalid ? true : undefined}
            onChange={(event) => {
              const incoming = event.currentTarget.value;
              /* Put the box back to what the model says before `write`
                 runs. With no `maxLength` the DOM will happily hold
                 "1a" or six digits, and when the write changes nothing
                 — a letter, a repeat of the same code — React sees an
                 unchanged `value` and skips the render that would have
                 corrected it. Without this the stray characters stay on
                 screen. A write that *does* change something re-renders
                 over this immediately. */
              event.currentTarget.value = digit;
              write(index, incoming);
            }}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onPaste={(event) => handlePaste(index, event)}
            onFocus={(event) => event.currentTarget.select()}
            className={cn(
              /* `min-w-0` with `flex-1`: six fixed-width boxes overflow a
                 320px viewport, and an OTP field that scrolls sideways is
                 unusable with one thumb. They shrink instead. */
              "nums h-13 min-w-0 flex-1 rounded-lg border bg-surface text-center",
              /* 17px, so iOS Safari does not zoom the viewport in on
                 focus — the same reason every field in `Input` is 16px. */
              "text-title-sm font-medium text-ink",
              "transition-[border-color,box-shadow,background-color] duration-150",
              "focus:outline-none focus-visible:outline-none",
              "focus:border-accent focus:shadow-[0_0_0_3px_var(--quoin-ring)]",
              "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-faint",
              invalid
                ? "border-danger focus:shadow-[0_0_0_3px_var(--quoin-danger-wash)]"
                : digit
                  ? /* A filled box reads as done without needing colour
                       to carry it, for anyone who cannot see the accent. */
                    "border-accent-edge"
                  : "border-line",
            )}
          />
        );
      })}
    </div>
  );
}
