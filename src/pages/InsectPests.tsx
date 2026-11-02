import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";

interface Crop {
  id: string;
  nameAr: string;
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
}

export function InsectPests() {
  const [params] = useSearchParams();
  const cropId = params.get("crop") ?? "";
  const [crops, setCrops] = useState<Crop[]>([]);
  const [pests, setPests] = useState<Pest[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/content/crops").then((res) => res.json()),
      fetch("/api/content/pests?cropId=" + encodeURIComponent(cropId)).then((res) => res.json())
    ])
      .then(([cropsData, pestsData]) => {
        setCrops(cropsData.crops ?? []);
        const filtered = (pestsData.pests ?? []).filter(
          (pest: Pest) => pest.kind === "insect" && !pest.beneficial && pest.id !== "pest-red-palm-weevil"
        );
        setPests(filtered);
      })
      .catch(() => {
        setCrops([]);
        setPests([]);
      });
  }, [cropId]);

  const crop = crops.find((item) => item.id === cropId);

  function selectPest(pestId: string) {
    sessionStorage.setItem("fg_selected_crop", cropId);
    sessionStorage.setItem("fg_selected_pest", pestId);
    window.location.href = `/insect?crop=${encodeURIComponent(cropId)}&pest=${encodeURIComponent(pestId)}`;
  }

  return (
    <div className="page">
      <header>
        <h1>الآفات الحشرية التي تصيب هذا المحصول</h1>
        <p>{crop ? crop.nameAr : cropId}</p>
      </header>
      <div style={{ marginBottom: "1rem" }}>
        <Link className="btn btn-ghost" to="/crops">رجوع</Link>
      </div>
      <div className="grid">
        {pests.map((pest) => (
          <article
            key={pest.id}
            className="card"
            style={{ cursor: "pointer" }}
            onClick={() => selectPest(pest.id)}
          >
            <header className="card-header">
              <div>
                <h2>{pest.nameAr}</h2>
                <small>{pest.nameEn ?? pest.nameFr} — {pest.scientificName}</small>
              </div>
            </header>
            <div
              style={{
                minHeight: "90px",
                display: "grid",
                placeItems: "center",
                border: "1px dashed var(--border)",
                borderRadius: "0.6rem",
                color: "var(--text-muted)",
                padding: "0.6rem"
              }}
            >
              {pest.photoAvailable ? (
                <img src={`/images/pests/${pest.imageKey}.jpg`} alt={pest.nameAr} style={{ maxHeight: "120px" }} />
              ) : (
                <span>صورة غير متوفرة (Photo not available)</span>
              )}
            </div>
            <p style={{ fontSize: "0.9rem", color: "var(--text-muted)", marginTop: "0.6rem" }}>
              انقر لاختيار هذه الآفة
            </p>
          </article>
        ))}
      </div>
      {pests.length === 0 && <p>لا توجد آفات حشرية مسجلة لهذا المحصول في هذه النسخة.</p>}
    </div>
  );
}
