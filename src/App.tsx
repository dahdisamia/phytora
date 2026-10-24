import { Suspense } from "react";
import { BrowserRouter } from "react-router-dom";
import { AppRoutes } from "./routes";
import { I18nProvider } from "./i18n/provider";
import { AppShell } from "./components/AppShell";

export function App() {
  return (
    <BrowserRouter>
      <I18nProvider>
        <AppShell>
          <Suspense fallback={<div className="page"><p>...</p></div>}>
            <AppRoutes />
          </Suspense>
        </AppShell>
      </I18nProvider>
    </BrowserRouter>
  );
}
