import { useEffect, useState } from "react";

export function Experts() {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    fetch("/api/experts")
      .then((res) => res.json())
      .then(setData)
      .catch(() => setData({ experts: [], noteAr: "غير متوفر" }));
  }, []);

  return (
    <div className="page">
      <header>
        <h1>دليل الخبراء</h1>
        <p>يُعرض فقط الملفات الموثقة والموافقة على النشر، ولا يتم اختراع أسماء.</p>
      </header>
      <section className="notice">
        <strong>ملاحظة</strong>
        <span>{data?.noteAr}</span>
      </section>
      {data?.experts?.length === 0 && (
        <section className="card">
          <p>الدليل العام فارغ حالياً. يمكن للمؤسسات إضافة خبراء موثوقين وموافقة على النشر.</p>
        </section>
      )}
    </div>
  );
}
