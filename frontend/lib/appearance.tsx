"use client";

import * as React from "react";

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

const KEY = "eri.plainMode";

export function AppearanceProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [plain, setPlainState] = React.useState(false);

  // Read after mount — the app is a static export, so there is no server
  // render to hydrate this from.
  React.useEffect(() => {
    try {
      setPlainState(window.localStorage.getItem(KEY) === "1");
    } catch {
      /* storage blocked — default to decorated */
    }
  }, []);

  const setPlain = React.useCallback((v: boolean) => {
    setPlainState(v);
    try {
      window.localStorage.setItem(KEY, v ? "1" : "0");
    } catch {
      /* non-fatal */
    }
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
