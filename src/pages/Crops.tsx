import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

interface Crop {
  id: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  scientificName: string;
  category: string;
  descriptionAr: string;
}

interface Category {
  id: string;
  nameAr: string;
  nameEn: string;
  nameFr: string;
}

const categories: Category[] = [
  { id: "all", nameAr: "الكل", nameEn: "All", nameFr: "Tous" },
  { id: "cereals", nameAr: "الحبوب", nameEn: "Cereals", nameFr: "Céréales" },
  { id: "vegetables", nameAr: "الخضروات", nameEn: "Vegetables", nameFr: "Légumes" },
  { id: "fruits", nameAr: "الفواكه", nameEn: "Fruits", nameFr: "Fruits" },
  { id: "legumes", nameAr: "البقوليات", nameEn: "Legumes", nameFr: "Légumineuses" }
];

export function Crops() {
  const [crops, setCrops] = useState<Crop[]>([]);
  const [selected, setSelected] = useState<string>("all");

  useEffect(() => {
    fetch("/api/content/crops")
      .then((res) => res.json())
      .then((data) => setCrops(data.crops ?? []))
      .catch(() => setCrops([]));
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<string, Crop[]>();
    for (const cat of categories) {
      if (cat.id !== "all") map.set(cat.id, []);
    }
    for (const crop of crops) {
      const list = map.get(crop.category);
      if (list) list.push(crop);
      else {
        if (!map.has(crop.category)) map.set(crop.category, []);
        map.get(crop.category)!.push(crop);
      }
    }
    return map;
  }, [crops]);

  const visibleCategories = selected === "all" ? categories.filter((c) => c.id !== "all") : categories.filter((c) => c.id === selected);

  return (
    <div className="page">
      <header>
        <h1>المحاصيل</h1>
        <p>محاصيل مختارة لولاية الوادي، مصنفة حسب الفئة</p>
      </header>
      <section className="card">
        <header className="card-header">
          <h2>الفئات</h2>
        </header>
        <div className="select-row">
          {categories.map((cat) => (
            <button
              key={cat.id}
              className={`pill ${selected === cat.id ? "active" : ""}`}
              onClick={() => setSelected(cat.id)}
            >
              {cat.nameAr}
            </button>
          ))}
        </div>
      </section>

      {visibleCategories.map((cat) => {
        const list = grouped.get(cat.id) ?? [];
        if (selected !== "all" && list.length === 0) return null;
        return (
          <section key={cat.id} className="page">
            <header>
              <h2>{cat.nameAr} <small style={{ color: "var(--text-muted)" }}>({cat.nameEn})</small></h2>
            </header>
            <div className="grid">
              {list.map((crop) => (
                <article key={crop.id} className="card">
                  <header className="card-header">
                    <div>
                      <h2>{crop.nameAr}</h2>
                      <small>{crop.nameFr} — {crop.nameEn} — {crop.scientificName}</small>
                    </div>
                    <Link className="btn btn-ghost" to={`/diagnosis?crop=${crop.id}`}>تشخيص</Link>
                  </header>
                  <p>{crop.descriptionAr}</p>
                </article>
              ))}
              {list.length === 0 && <p>لا توجد محاصيل في هذه الفئة بعد.</p>}
            </div>
          </section>
        );
      })}
    </div>
  );
}
