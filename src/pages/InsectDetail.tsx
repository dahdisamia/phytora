import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

interface Crop {
  id: string;
  nameAr: string;
  nameEn: string;
}

interface Occurrence {
  id: string;
  scope: "national" | "regional";
  regionId?: string | null;
  status: string;
  noteAr: string;
  noteFr: string;
  sourceIds: string[];
  lastVerifiedAt: string;
}

interface Pest {
  id: string;
  slug: string;
  nameAr: string;
  nameEn?: string;
  nameFr: string;
  scientificName: string;
  kind: string;
  beneficial: boolean;
  photoAvailable?: boolean;
  imageKey: string;
  cropIds: string[];
  morphologyAr: string;
  morphologyFr: string;
  lifecycleAr: string;
  lifecycleFr: string;
  damageAr: string;
  damageFr: string;
  monitoringAr: string;
  monitoringFr: string;
  featuresAr: string;
  featuresFr: string;
  occurrence: Occurrence[];
}

export function InsectDetail() {
  const [params] = useSearchParams();
  const cropId = params.get("crop") ?? "";
  const pestId = params.get("pest") ?? "";
  const [pest, setPest] = useState<Pest | null>(null);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [sources, setSources] = useState<any[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/content/crops").then((res) => res.json()),
      fetch("/api/content/pests/" + encodeURIComponent(pestId)).then((res) => res.json())
    ])
      .then(([cropsData, pestData]) => {
        setCrops(cropsData.crops ?? []);
        setPest(pestData.pest ?? null);
        setSources(pestData.sources ?? []);
      })
      .catch(() => {
        setCrops([]);
        setPest(null);
        setSources([]);
      });
  }, [pestId]);

  const crop = crops.find((item) => item.id === cropId);
  const cropName = crop ? crop.nameAr : cropId;

  function unavailable(value: string | undefined | null) {
    return value && value.trim().length > 0 ? value : "غير متوفر في هذه النسخة (Information not available).";
  }

  const attackedCrops = (pest?.cropIds ?? [])
    .map((id) => {
      const found = crops.find((item) => item.id === id);
      return found ? found.nameAr : id;
    })
    .join("، ");

  return (
    <div className="page">
      <header>
        <h1>معلومات الآفة الحشرية</h1>
        <p>
          {pest ? pest.nameAr : pestId}
          {cropId ? ` — محصول: ${cropName}` : ""}
        </p>
      </header>
      <div style={{ marginBottom: "1rem" }}>
        <Link className="btn btn-ghost" to={`/pests?crop=${encodeURIComponent(cropId)}`}>رجوع</Link>
      </div>

      {pest && (
        <div className="card-list">
          <section className="card">
            <h2>الأسماء</h2>
            <p><strong>الاسم العربي:</strong> {pest.nameAr}</p>
            <p><strong>English name:</strong> {pest.nameEn ?? pest.nameFr}</p>
            <p><strong>الاسم العلمي (Latin):</strong> {pest.scientificName}</p>
          </section>

          <section className="card">
            <h2>الصورة</h2>
            {pest.photoAvailable ? (
              <img src={`/images/pests/${pest.imageKey}.jpg`} alt={pest.nameAr} style={{ maxHeight: "200px" }} />
            ) : (
              <p>صورة غير متوفرة (Photo not available)</p>
            )}
          </section>

          <section className="card">
            <h2>الخصائص المظهرية (التعرف)</h2>
            <p>{unavailable(pest.morphologyAr)}</p>
          </section>

          <section className="card">
            <h2>دورة الحياة ومراحل النمو</h2>
            <p>{unavailable(pest.lifecycleAr)}</p>
          </section>

          <section className="card">
            <h2>المحاصيل المهاجمة</h2>
            <p>{attackedCrops || "غير متوفر (Not available)."}</p>
          </section>

          <section className="card">
            <h2>نوع الضرر</h2>
            <p>{unavailable(pest.damageAr)}</p>
          </section>

          <section className="card">
            <h2>مؤشرات الحضور على المحصول</h2>
            <p>{unavailable(pest.monitoringAr)}</p>
          </section>

          <section className="card">
            <h2>التوزيع الجغرافي</h2>
            {pest.occurrence && pest.occurrence.length > 0 ? (
              <ul>
                {pest.occurrence.map((occ) => (
                  <li key={occ.id}>
                    <strong>
                      {occ.scope === "national"
                        ? "مسجلة في الجزائر (Algeria)"
                        : occ.regionId === "dz-eloued"
                        ? "مسجلة في ولاية الوادي / وادي سوف (El Oued / Wadi Souf)"
                        : "مسجلة إقليمياً (Regional)"}
                    </strong>
                    {" — "}
                    الحالة: {occ.status} — {occ.noteAr}
                  </li>
                ))}
              </ul>
            ) : (
              <p>غير متوفر (Not available).</p>
            )}
          </section>

          <section className="card">
            <h2>المصادر</h2>
            {sources.length > 0 ? (
              <ul>
                {sources.map((src) => (
                  <li key={src.id}>
                    <strong>{src.title}</strong> — {src.publisher} ({src.kind})
                    {src.url && (
                      <>
                        {" "}
                        <a href={src.url} target="_blank" rel="noreferrer">
                          {src.url}
                        </a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p>غير متوفر (Not available).</p>
            )}
          </section>


        </div>
      )}

      {!pest && <p>لم يتم العثور على الآفة.</p>}
    </div>
  );
}
