interface BrandMarkProps {
  readonly className?: string;
}

export function BrandMark({ className }: BrandMarkProps) {
  return (
    <svg
      className={className}
      data-brand-mark="final-turn"
      viewBox="0 0 96 96"
      aria-hidden="true"
      focusable="false"
    >
      <use href="/final-turn.svg#final-turn" />
    </svg>
  );
}
