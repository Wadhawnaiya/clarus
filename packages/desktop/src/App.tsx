// Top-level gate: onboarding while no model is available (fresh install, or
// every provider removed), chat otherwise. `null` while the first check is in
// flight — render neither to avoid a flash of the wrong screen.
//
// ChatLayout is keyed by the active client workspace path so a folder switch
// remounts the pi client and session list (no cross-client thread bleed).

import { useEffect, useState } from "react";
import { ChatLayout } from "./components/clarus/chat-layout";
import { Onboarding } from "./components/clarus/onboarding";
import { useHasModels } from "./hooks/useProviderStatus";
import { workspaceApi } from "./rpc/api";

export default function App() {
  const hasModels = useHasModels();
  const [workspacePath, setWorkspacePath] = useState<string | null>(null);

  useEffect(() => {
    void workspaceApi
      .get()
      .then((w) => setWorkspacePath(w.path))
      .catch(() => undefined);
    return workspaceApi.onChange((w) => setWorkspacePath(w.path));
  }, []);

  if (hasModels === null) return null;
  return hasModels ? <ChatLayout key={workspacePath ?? "default"} /> : <Onboarding />;
}
