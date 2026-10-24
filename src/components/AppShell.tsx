import { Link, NavLink } from "react-router-dom";
import { useI18n } from "../i18n/provider";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { t, locale, setLocale } = useI18n();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-brand">
          <div className="app-brand-mark">ح</div>
          <div className="app-brand-text">
            <strong>{t("app_name")}</strong>
            <small>{t("tagline")}</small>
          </div>
        </div>
        <div className="app-actions">
          <button className="btn btn-ghost" onClick={() => setLocale(locale === "ar" ? "fr" : "ar")}>
            {locale === "ar" ? "Français" : "العربية"}
          </button>
          <Link className="btn btn-ghost" to="/offline">{t("offline")}</Link>
        </div>
      </header>
      <nav className="app-main" style={{ flex: "0 0 auto", flexDirection: "row", flexWrap: "wrap", paddingBottom: 0 }}>
        <NavLink className="pill" to="/">{t("home")}</NavLink>
        <NavLink className="pill" to="/crops">{t("crops")}</NavLink>
        <NavLink className="pill" to="/diagnosis">{t("diagnosis")}</NavLink>
        <NavLink className="pill" to="/knowledge">{t("knowledge")}</NavLink>
        <NavLink className="pill" to="/experts">{t("experts")}</NavLink>
        <NavLink className="pill" to="/cases">{t("cases")}</NavLink>
      </nav>
      <main className="app-main">{children}</main>
      <footer className="app-footer">
        <div>{t("disclaimer")}</div>
        <div>{t("chemical_notice")}</div>
      </footer>
    </div>
  );
}
