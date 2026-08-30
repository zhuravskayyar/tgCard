import { useEffect, useState } from "react";
import type { AuthConfigResponse } from "@cardastika/shared";
import { loadAuthConfig } from "./config";

export function useAuthConfig() {
  const [config, setConfig] = useState<AuthConfigResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void loadAuthConfig()
      .then((value) => { if (active) setConfig(value); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, []);

  return { config, failed, loading: !config && !failed };
}
