import { useEffect, useState } from "react";
import { Link } from "react-router-dom";

interface Crop {
  id: string;
  nameAr: string;
  nameFr: string;
  scientificName: string;
  descriptionAr: string;
  descriptionFr: string;
}

export function Crops() {
  const [crops, setCrops] = useState<Crop[]>([]);

  useEffect(() => {
    fetch("/api/content/crops")
      .then((res) => res.json())
      .then((data) => setCrops(data.crops ?? []))
      .catch(() => setCrops([]));
  }, []);

  return (
    <div className="page">
      <header>
        <h1>المحاصيل</h1>
        <p>محاصيل مختارة لولاية الوادي مع آفاتها المرتبطة</p>
      </header>
      <div className="grid">
        {crops.map((crop) => (
          <article key={crop.id} className="card">
            <header className="card-header">
              <div>
                <h2>{crop.nameAr}</h2>
                <small>{crop.nameFr} — {crop.scientificName}</small>
              </div>
              <Link className="btn btn-ghost" to={`/diagnosis?crop=${crop.id}`}>تشخيص</Link>
            </header>
            <p>{crop.descriptionAr}</p>
          </article>
        ))}
      </div>
    </div>
  );
}
