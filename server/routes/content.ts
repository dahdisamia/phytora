import { Router } from "express";
import type { Db } from "../db";
import type { ContentStore } from "../content";
import {
  buildContentPackage,
  getPublicExperts,
  getSources
} from "../content";

export function contentRouter(db: Db, store: ContentStore): Router {
  const router = Router();

  router.get("/regions", (_req, res) => {
    res.json({
      countries: store.countries,
      regions: store.regions,
      municipalities: store.municipalities,
      contentVersion: store.contentVersion
    });
  });

  router.get("/package", (req, res) => {
    const regionId = String(req.query.regionId ?? store.regions[0]?.id ?? "dz-eloued");
    const region = store.regions.find((item) => item.id === regionId);
    if (!region) {
      res.status(404).json({
        error: {
          code: "region_not_found",
          messageAr: "المنطقة المطلوبة غير موجودة.",
          messageFr: "La région demandée est introuvable."
        }
      });
      return;
    }
    const experts = getPublicExperts(db, { regionId });
    const pkg = buildContentPackage(store, regionId, experts);
    res.setHeader("Cache-Control", "public, max-age=60");
    res.json(pkg);
  });

  router.get("/crops", (_req, res) => {
    res.json({ crops: store.crops });
  });

  router.get("/questions", (_req, res) => {
    res.json({ questions: store.questions });
  });

  router.get("/sources", (_req, res) => {
    res.json({ sources: store.sources });
  });

  router.get("/pests", (req, res) => {
    const cropId = req.query.cropId ? String(req.query.cropId) : null;
    const beneficial = req.query.beneficial;
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : null;
    let pests = store.pests.filter((pest) => pest.status === "published");
    if (cropId) pests = pests.filter((pest) => pest.cropIds.includes(cropId));
    if (beneficial === "true") pests = pests.filter((pest) => pest.beneficial);
    if (beneficial === "false") pests = pests.filter((pest) => !pest.beneficial);
    if (q) {
      pests = pests.filter((pest) =>
        [pest.nameAr, pest.nameFr, pest.scientificName, pest.slug]
          .join(" ")
          .toLowerCase()
          .includes(q)
      );
    }
    res.json({ pests });
  });

  router.get("/pests/:slug", (req, res) => {
    const slug = req.params.slug;
    const pest = store.pests.find(
      (item) => item.slug === slug || item.id === slug
    );
    if (!pest) {
      res.status(404).json({
        error: {
          code: "pest_not_found",
          messageAr: "لم يتم العثور على السجل المطلوب.",
          messageFr: "La fiche demandée est introuvable."
        }
      });
      return;
    }
    const related = pest.similarPestIds
      .map((id) => store.pests.find((item) => item.id === id))
      .filter((item) => Boolean(item));
    res.json({
      pest,
      sources: getSources(store, pest.sourceIds),
      related
    });
  });

  router.get("/health", (_req, res) => {
    res.json({
      ok: true,
      contentVersion: store.contentVersion,
      pests: store.pests.length,
      crops: store.crops.length,
      sources: store.sources.length
    });
  });

  return router;
}
