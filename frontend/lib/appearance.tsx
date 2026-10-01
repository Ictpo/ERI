"use client";

import * as React from "react";
import { api } from "@/lib/api";

/**
 * Plain mode — strips decorative brand styling from the app.
 *
 * Why this exists: ERI produces figures for academic work. Brand decoration
 * must never be load-bearing for reading an analysis, and a researcher must
 * be able to turn it off entirely. Plain mode:
 *   - replaces the animated brand loader with a plain progress indicator
 *   - drops the AFC variable-modality colour to black (maximum separation
 *     from the slate word markers: min dE 50 across all CVD simulations)
 * It never changes any number, position, or the categorical palette — those
 * are analysis output, not styling.
 */

type Appearance = { plain: boolean; setPlain: (v: boolean) => void };

const AppearanceContext = React.createContext<Appearance>({
  plain: false,
  setPlain: () => {},
});

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [plain, setPlainState] = React.useState(false);
  // Set once the user toggles, so a slow initial read can't undo the toggle.
  const touched = React.useRef(false);

  // Read after mount — the app is a static export, so there is no server
  // render to hydrate this from. Stored by the backend, not localStorage: the
  // desktop webview runs in private mode on a new port every launch, so
  // localStorage is empty again at every start.
  React.useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (!cancelled && !touched.current) setPlainState(s.plain_mode);
      })
      .catch(() => {
        /* server unreachable — default to decorated */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const setPlain = React.useCallback((v: boolean) => {
    touched.current = true;
    setPlainState(v);
    api.saveSettings({ plain_mode: v }).catch(() => {
      /* non-fatal: the toggle still applies for this session */
    });
  }, []);

  const value = React.useMemo(() => ({ plain, setPlain }), [plain, setPlain]);
  return (
    <AppearanceContext.Provider value={value}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function usePlainMode(): Appearance {
  return React.useContext(AppearanceContext);
}
