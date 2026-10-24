import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { diagnose, getNextQuestion, rankCandidates } from "@shared/diagnostic";
import type { DiagnosticAnswer, DiagnosticInput } from "@shared/types";

interface EngineData {
  pests: any[];
  questions: any[];
  crops?: any[];
}

export function Diagnosis() {
  const [params] = useSearchParams();
  const [data, setData] = useState<EngineData | null>(null);
  const [cropId, setCropId] = useState(params.get("crop") ?? "crop-tomato");
  const [regionId] = useState("dz-eloued");
  const [answers, setAnswers] = useState<DiagnosticAnswer[]>([]);
  const [suspected, setSuspected] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/content/pests?cropId=" + cropId).then((res) => res.json()),
      fetch("/api/content/questions").then((res) => res.json())
    ])
      .then(([pests, questions]) =>
        setData({ pests: pests.pests ?? [], questions: questions.questions ?? [] })
      )
      .catch(() => setData({ pests: [], questions: [] }));
  }, [cropId]);

  const nextQuestion = useMemo(() => {
    if (!data) return null;
    return getNextQuestion(data as any, cropId, regionId, answers, suspected);
  }, [data, cropId, regionId, answers, suspected]);

  const result = useMemo(() => {
    if (!data) return null;
    return diagnose(data as any, cropId, regionId, null, suspected, answers);
  }, [data, cropId, regionId, suspected, answers]);

  const ranked = useMemo(() => {
    if (!data) return [];
    return rankCandidates(data as any, cropId, regionId, answers, suspected);
  }, [data, cropId, regionId, answers, suspected]);

  if (!data) return <div className="page"><p>...</p></div>;

  return (
    <div className="page">
      <header>
        <h1>تشخيص موجّه</h1>
        <p>أسئلة متكيفة حسب المرشحين، مع عرض عدم اليقين وعدم اختراع نسب مئوية.</p>
      </header>
      <section className="card">
        <header className="card-header">
          <h2>المحصول</h2>
        </header>
        <div className="select-row">
          {["crop-date-palm", "crop-potato", "crop-tomato"].map((id) => (
            <button
              key={id}
              className={`pill ${cropId === id ? "active" : ""}`}
              onClick={() => {
                setCropId(id);
                setAnswers([]);
                setSuspected(null);
              }}
            >
              {id === "crop-date-palm" ? "نخيل التمر" : id === "crop-potato" ? "البطاطا" : "الطماطم"}
            </button>
          ))}
        </div>
      </section>
      {nextQuestion && (
        <section className="card">
          <header className="card-header">
            <h2>{nextQuestion.textAr}</h2>
          </header>
          <p>{nextQuestion.helpAr}</p>
          <div className="grid">
            {nextQuestion.options.map((option: any) => (
              <button
                key={option.id}
                className="list-item"
                onClick={() => setAnswers((prev) => [...prev, { questionId: nextQuestion.id, optionId: option.id }])}
              >
                <div>
                  <strong>{option.labelAr}</strong>
                  <div>{option.descriptionAr}</div>
                </div>
              </button>
            ))}
          </div>
          <button className="btn btn-ghost" onClick={() => setAnswers((prev) => prev.slice(0, -1))}>العودة</button>
        </section>
      )}
      {result && (
        <section className="card">
          <header className="card-header">
            <h2>النتائج</h2>
          </header>
          <p>عدد الأسئلة المجابة: {result.answeredCount} / الحد الأقصى 6</p>
          {result.warnings.length > 0 && (
            <div className="notice">
              <strong>تنبيهات</strong>
              <ul>
                {result.warnings.map((warning) => (
                  <li key={warning}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="card-list">
            {ranked.slice(0, 4).map((candidate: any) => (
              <article key={candidate.pest.id} className="list-item">
                <div>
                  <strong>{candidate.pest.nameAr}</strong> — {candidate.pest.nameFr}
                  <div>الثقة: {candidate.confidence} | النطاق: {candidate.occurrenceScope}</div>
                  <div>{candidate.pest.descriptionAr.slice(0, 120)}...</div>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
