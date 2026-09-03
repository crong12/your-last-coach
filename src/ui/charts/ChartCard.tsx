import type { ReactNode } from "react";

export interface ChartCardProps {
  id: string;
  metric: string;
  currentValue: string;
  unit: string;
  averageLabel?: string;
  averageBasis?: string;
  trendLabel?: string;
  trendGlyph?: string;
  trendTone?: "neutral" | "warn";
  /** Muted metric · unit · polarity caption above the plot, e.g. "HRV · ms · higher ↑". */
  directionHint?: string;
  readout: ReactNode;
  plot: ReactNode;
  coverage: string;
  source?: string;
  children?: ReactNode;
}

export function ChartCard({
  id,
  metric,
  currentValue,
  unit,
  averageLabel,
  averageBasis,
  trendLabel,
  trendGlyph,
  trendTone = "neutral",
  directionHint,
  readout,
  plot,
  coverage,
  source,
  children,
}: ChartCardProps) {
  const titleId = `chart-card-${id}-title`;
  return (
    <section
      className="chart-card"
      data-chart-card={id}
      aria-labelledby={titleId}
    >
      <header className="chart-card__header">
        <div className="chart-card__metric-block">
          <h3 id={titleId} className="chart-card__metric">
            {metric}
          </h3>
        </div>
        <div className="chart-card__current">
          <span className="chart-card__label">Current</span>
          <strong
            className="chart-card__current-value"
            data-chart-current-value
            aria-label={
              currentValue === "—" || unit === ""
                ? currentValue
                : `${currentValue} ${unit}`
            }
          >
            <span>{currentValue}</span>
            {currentValue !== "—" && unit !== "" && (
              <span className="chart-card__unit">{unit}</span>
            )}
          </strong>
        </div>
        {averageLabel && (
          <div className="chart-card__average">
            <span>{averageLabel}</span>
            {averageBasis && <small>{averageBasis}</small>}
          </div>
        )}
        {trendLabel && (
          <div className="chart-card__trend" data-trend-tone={trendTone}>
            {trendGlyph && (
              <span className="chart-card__trend-glyph" aria-hidden="true">
                {trendGlyph}
              </span>
            )}
            <span>{trendLabel}</span>
          </div>
        )}
      </header>
      <div
        className="chart-card__readout"
        data-chart-readout={id}
        role="status"
        aria-live="polite"
      >
        {readout}
      </div>
      {directionHint && (
        <div className="chart-card__direction-hint" data-chart-direction-hint>
          {directionHint}
        </div>
      )}
      {plot}
      {children}
      <footer className="chart-card__footer">
        <span className="chart-card__coverage">{coverage}</span>
        {source && <span className="chart-card__source">{source}</span>}
      </footer>
    </section>
  );
}
