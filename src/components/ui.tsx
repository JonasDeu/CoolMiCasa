import type { ReactNode } from "react";

export function Card({
  title,
  children,
  right,
  className = "",
}: {
  title?: string;
  children: ReactNode;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`card ${className}`}>
      {title && (
        <div className="card__head">
          <h2 className="card__title">{title}</h2>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export function Pill({ kind, children }: { kind: "open" | "closed" | "shade"; children: ReactNode }) {
  return <span className={`pill pill--${kind}`}>{children}</span>;
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="hint">{children}</p>;
}
