# Editorial headline font

- Typeface: Nanum Myeongjo Bold, including Hangul and Latin.
- Source: https://github.com/google/fonts/tree/main/ofl/nanummyeongjo
- Original file: https://raw.githubusercontent.com/google/fonts/main/ofl/nanummyeongjo/NanumMyeongjo-Bold.ttf
- Retrieved: 2026-10-01.
- Copyright: NHN Corporation (2010). License: SIL Open Font License 1.1.
- License copy: `../../public/fonts/NanumMyeongjo-OFL.txt`.

`NanumMyeongjo-Bold.ttf` is the unchanged upstream file used by the text-only share card.
`../../public/fonts/NanumMyeongjo-Bold.woff2` is a WOFF2 compression of that file, without subsetting, glyph edits, or metric changes. It is 609,188 bytes.

The browser font is self-hosted and preloaded once by the root layout. `font-display: optional` avoids a late font swap. The fallback defines 80% ascent, 20% descent, and 25% line gap from the original font's 1024-unit metrics (819, -205, 256). Body and controls retain Pretendard. Remove the layout preload, the two font-face rules in `app/globals.css`, the `--font-editorial` usage, the OG font entry, and these assets together if replacing the typeface.
