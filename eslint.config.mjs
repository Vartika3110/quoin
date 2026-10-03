import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Worktrees created by tooling hold a full copy of the source. Linting
    // them reports every problem twice and buries the real ones: this
    // directory alone produced 7,632 of 7,632 problems.
    ".claude/worktrees/**",
  ]),
  {
    rules: {
      /**
       * A leading underscore means "deliberately discarded".
       *
       * The rule's default flags every one of them, which turns the one
       * idiom JavaScript has for dropping a key during a destructure —
       * `const { statusHistory: _omit, ...rest } = row` — into a standing
       * warning. That is backwards: the underscore is the author *saying*
       * the binding is unused, and a linter that cannot be told so trains
       * people to stop reading its output.
       *
       * Scoped to the underscore prefix, so a genuinely forgotten
       * variable is still reported. `caughtErrors: "all"` keeps unused
       * `catch` bindings in scope for the same reason, with `_` as the
       * same escape hatch.
       */
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "all",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
    },
  },
]);

export default eslintConfig;
