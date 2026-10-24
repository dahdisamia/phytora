import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Pest {
  id: string;
  slug: string;
  nameAr: string;
  nameFr: string;
  scientificName: string;
  kind: string;
  beneficial: boolean;
  descriptionAr: string;
}

export function KnowledgeList() {
  const [pests, setPests] = useState<Pest[]>([]);

  useEffect(() => {
    fetch("/api/content/pests")
      .then((res) => res.json())
      .then((data) => setPests(data.pests ?? []))
      .catch(() => setPests([]));
  }, []);

  return (
    <div className="page">
      <header>
        <h1>قاعدة المعرفة</h1>
        <p>آفات وأعداء طبيعية مع مصادر موثقة</p>
      </header>
      <div className="card-list">
        {pests.map((pest) => (
          <article key={pest.id} className="list-item">
            <div>
              <strong>{pest.nameAr}</strong> {pest.beneficial ? "(مفيد)" : "(آفة)"} — {pest.scientificName}
              <div>{pest.descriptionAr.slice(0, 140)}...</div>
            </div>
            <Link className="btn btn-ghost" to={`/knowledge/${pest.slug}`}>التفاصيل</Link>
          </article>
        ))}
      </div>
    </div>
  );
}

export function PestDetail() {
  const [slug, setSlug] = useState<string>("");
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    const path = window.location.pathname;
    const s = path.split("/").pop() ?? "";
    setSlug(s);
    fetch("/api/content/pests/" + s)
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData(null));
  }, []);

  if (!data?.pest) return <div className="page"><p>غير موجود</p></div>;
  const pest = data.pest;

  return (
    <div className="page">
      <header>
        <h1>{pest.nameAr}</h1>
        <p>{pest.nameFr} — {pest.scientificName}</p>
      </header>
      <section className="card">
        <h2>الوصف</h2>
        <p>{pest.descriptionAr}</p>
        <h2>الأضرار</h2>
        <p>{pest.damageAr}</p>
        <h2>المراقبة</h2>
        <p>{pest.monitoringAr}</p>
      </section>
      <section className="card">
        <h2>التوصيات</h2>
        <div className="card-list">
          {(pest.recommendations ?? []).map((rec: any) => (
            <article key={rec.id} className="list-item">
              <div>
                <strong>{rec.titleAr}</strong> — {rec.category}
                <div>{rec.purposeAr}</div>
                {rec.chemical && <div style={{ color: "var(--warning)" }}>ملاحظة: {rec.titleAr}</div>}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="card">
        <h2>المصادر</h2>
        <div className="card-list">
          {(data.sources ?? []).map((src: any) => (
            <article key={src.id} className="list-item">
              <div>
                <strong>{src.title}</strong>
                <div>{src.publisher} — {src.kind}</div>
                {src.url && <a href={src.url} target="_blank" rel="noreferrer">{src.url}</a>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
