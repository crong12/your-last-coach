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
      <path
        className="brand-mark__outer-lane"
        d="M79 18H49C28 18 16 30 16 48s12 30 33 30h30"
      />
      <path
        className="brand-mark__inner-lane"
        d="M79 35H50c-11 0-17 5-17 13s6 13 17 13h29"
      />
      <circle className="brand-mark__endpoint" cx="79" cy="78" r="6" />
    </svg>
  );
}
