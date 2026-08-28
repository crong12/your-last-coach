import React from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/manrope/latin-400.css";
import "@fontsource/manrope/latin-600.css";
import "@fontsource/manrope/latin-700.css";
import "@fontsource/newsreader/latin-500.css";

import { BrowserWorkspaceRepository } from "./adapters/persistence/BrowserWorkspaceRepository";
import { createWorkspaceApplication } from "./application/createWorkspaceApplication";
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
  });
  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <WorkspaceApp
        application={application}
        initialNotice={initialized.notice}
        initialDurability={initialized.durability}
      />
    </React.StrictMode>,
  );
}

void bootstrap();
