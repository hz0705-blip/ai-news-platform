/** @jsxImportSource react */
export function SourceTile({ name }: { name: string }) {
  const first =
    new Intl.Segmenter("ko", { granularity: "grapheme" })
      .segment(name.trim())
      [Symbol.iterator]()
      .next().value?.segment ?? "";
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <span
        aria-hidden="true"
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-muted-foreground"
      >
        {first}
      </span>
      <span>{name}</span>
    </span>
  );
}
