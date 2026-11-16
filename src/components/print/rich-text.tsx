/** Texto simples com marcações leves: "## título", "- item", parágrafos. Sem HTML (seguro). */
export function RichText({ text }: { text: string }) {
  const blocks = text.replace(/\r/g, '').split(/\n{2,}/);
  return (
    <div className="space-y-2.5 text-[10.5pt]">
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) return <ul key={i} className="list-disc space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}>{l.replace(/^\s*[-*•]\s+/, '')}</li>)}</ul>;
        if (lines.every((l) => /^\s*\d+[.)]\s+/.test(l))) return <ol key={i} className="list-decimal space-y-0.5 pl-5">{lines.map((l, j) => <li key={j}>{l.replace(/^\s*\d+[.)]\s+/, '')}</li>)}</ol>;
        return (
          <div key={i}>
            {lines.map((l, j) => /^#{1,3}\s/.test(l)
              ? <h3 key={j} className="mt-1 text-[11.5pt] font-semibold text-[#2F6B5A]">{l.replace(/^#{1,3}\s/, '')}</h3>
              : /^\s*[-*•]\s+/.test(l) ? <p key={j} className="pl-4 -indent-3">• {l.replace(/^\s*[-*•]\s+/, '')}</p>
              : <p key={j} className="whitespace-pre-wrap">{l}</p>)}
          </div>
        );
      })}
    </div>
  );
}
