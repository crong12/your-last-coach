import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/newsreader/latin-500.css";

import { BrowserWorkspaceRepository } from "./adapters/persistence/BrowserWorkspaceRepository";
import { registerWebMcpTools } from "./adapters/webmcp/registerReadTools";
import type { ModelContextHost } from "./adapters/webmcp/types";
import { createWorkspaceApplication } from "./application/createWorkspaceApplication";
import { createReviewCoordinator } from "./application/createReviewCoordinator";
import { initializeWorkspace } from "./application/initializeWorkspace";
import { createDemoCoachingContextSource } from "./demo/demoCoachingContextSource";
import { WorkspaceApp } from "./ui/WorkspaceApp";
import "./ui/styles.css";

async function bootstrap() {
  const fixtureSource = createDemoCoachingContextSource();
  const repository = new BrowserWorkspaceRepository(() => window.localStorage);
  const initialized = await initializeWorkspace({ fixtureSource, repository });
  const application = createWorkspaceApplication({
    initialState: initialized.state,
    fixtureSource,
    repository,
    initialUndeliveredFallbackResult: initialized.undeliveredFallbackResult,
  });
  const reviewCoordinator = createReviewCoordinator({ application });
  const modelContext = (
    document as Document & { readonly modelContext?: ModelContextHost }
  ).modelContext;
  const controlledHarnessMode = (
    window as Window & {
      __webMcpHarness?: { reviewMode?: "primary" | "fallback" };
    }
  ).__webMcpHarness?.reviewMode;
  const reviewMode =
    import.meta.env.DEV && controlledHarnessMode === "primary"
      ? "primary"
      : "fallback";
  const webMcpRegistration = await registerWebMcpTools(
    modelContext,
    application,
    { reviewMode, reviewCoordinator },
  );
  const cleanup = () => {
    window.removeEventListener("pagehide", cleanup);
    window.removeEventListener("beforeunload", cleanup);
    webMcpRegistration.cleanup();
  };
  window.addEventListener("pagehide", cleanup, { once: true });
  window.addEventListener("beforeunload", cleanup, { once: true });
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <WorkspaceApp
        application={application}
        reviewCoordinator={reviewCoordinator}
        initialNotice={initialized.notice}
        initialDurability={initialized.durability}
        coachAgentConnection={webMcpRegistration}
      />
    </React.StrictMode>,
  );
}

void bootstrap();
