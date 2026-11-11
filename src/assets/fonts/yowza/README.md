# Yowza brand font

The UI is set in **Yowza** and **Yowza Soft** by [Blaze Type](https://blazetype.eu).
The font files are commercially licensed and may not be redistributed, so the
`.otf` files are git-ignored and are not part of the public repository.

Without them the app falls back to Noto Sans (bundled) and still looks correct.
`src/brandFonts.ts` only registers faces for files that exist at build time.
