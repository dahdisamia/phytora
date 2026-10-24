import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useI18n } from "../i18n/provider";

interface Health {
  ok: boolean;
  contentVersion?: string;
  pests?: number;
  crops?: number;
}

export function Home() {
  const { t } = useI18n();
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    fetch("/api/health")
      .then((res) => res.json())
      .then(setHealth)
      .catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div className="page">
      <section className="hero">
        <div>
          <h1>{t("app_name")}</h1>
          <p>{t("tagline")}</p>
        </div>
        <div className="select-row">
          <span className="pill active">{t("eloued")}</span>
          <span className="pill">{t("crops")}: نخيل التمر، البطاطا، الطماطم</span>
        </div>
        <div className="hero-actions">
          <Link className="btn btn-primary" to="/diagnosis">{t("start_diagnosis")}</Link>
          <Link className="btn btn-ghost" to="/knowledge">{t("knowledge")}</Link>
          <Link className="btn btn-ghost" to="/experts">{t("experts")}</Link>
        </div>
      </section>
      <section className="grid">
        <article className="card">
          <header className="card-header">
            <h2>{t("diagnosis")}</h2>
          </header>
          <p>تشخيص موجّه بالأسئلة مع إبراز عدم اليقين، وبدون نسب مئوية مصطنعة.</p>
        </article>
        <article className="card">
          <header className="card-header">
            <h2>{t("recommendations")}</h2>
          </header>
          <p>إدارة متكاملة للآفات مع ملاحظات عن الأعداء الطبيعية، وبدون توصية بمنتج كيميائي أو جرعة في هذه النسخة.</p>
        </article>
        <article className="card">
          <header className="card-header">
            <h2>{t("offline")}</h2>
          </header>
          <p>يمكن حفظ الحالات محلياً والتنزيل لاستخدام دون اتصال مع مؤشر للمزامنة عند عودة الإنترنت.</p>
        </article>
      </section>
      <section className="notice">
        <strong>حالة الخادم</strong>
        <span>
          {health?.ok
            ? `متصل — إصدار المحتوى ${health.contentVersion ?? "-"} / آفات ${health.pests ?? "-"} / محاصيل ${health.crops ?? "-"}`
            : "غير متصل أو الخادم غير جاهز حالياً"}
        </span>
      </section>
    </div>
  );
}
