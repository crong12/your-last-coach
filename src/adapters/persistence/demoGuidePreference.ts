const DEMO_GUIDE_KEY = "your-last-coach.demo-guide.v1";

interface GuideStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface DemoGuidePreference {
  shouldOpen(): boolean;
  markSeen(): void;
  reset(): void;
}

export function createDemoGuidePreference(
  getStorage: () => GuideStorage,
): DemoGuidePreference {
  let seenInPage = false;

  return {
    shouldOpen() {
      if (seenInPage) return false;
      try {
        return getStorage().getItem(DEMO_GUIDE_KEY) !== "seen";
      } catch {
        return true;
      }
    },
    markSeen() {
      seenInPage = true;
      try {
        getStorage().setItem(DEMO_GUIDE_KEY, "seen");
      } catch {
        // The preference remains valid for this page without durable storage.
      }
    },
    reset() {
      seenInPage = false;
      try {
        getStorage().removeItem(DEMO_GUIDE_KEY);
      } catch {
        // A future page may reopen the guide when durable storage is unavailable.
      }
    },
  };
}
