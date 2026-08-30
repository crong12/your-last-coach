import { createRoot } from "react-dom/client";

import "../src/ui/styles.css";
import { HrvChart } from "../src/ui/charts/HrvChart";

createRoot(document.getElementById("root")!).render(
  <HrvChart
    points={[
      { date: "2026-08-24", value: 0 },
      { date: "2026-08-25", value: 100 },
      { date: "2026-08-26", value: null },
    ]}
    annotations={[
      {
        kind: "phase",
        date: "2026-08-24",
        label: "Base phase",
      },
      {
        kind: "adaptation",
        date: "2026-08-25",
        label: "Reduce load",
        adaptationId: "adaptation:one",
      },
    ]}
    onViewAdaptation={(adaptationId) => {
      document.body.dataset.adaptationCallback = adaptationId;
    }}
  />,
);
