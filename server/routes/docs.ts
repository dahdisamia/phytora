import type { Request, Response } from "express";

export function openApiDocument(baseUrl: string) {
  return {
    openapi: "3.0.3",
    info: {
      title: "FieldGuard API",
      version: "0.1.0",
      description:
        "API for the FieldGuard offline-first agricultural advisory application. Content is curated and sourced; the diagnostic engine is rule-based and does not return numerical confidence percentages."
    },
    servers: [{ url: baseUrl }],
    tags: [
      { name: "auth" },
      { name: "content" },
      { name: "cases" },
      { name: "referrals" },
      { name: "experts" },
      { name: "dashboard" },
      { name: "admin" }
    ],
    paths: {
      "/api/auth/register": {
        post: {
          tags: ["auth"],
          summary: "Register a farmer account",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password", "displayName"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string", minLength: 10 },
                    displayName: { type: "string" },
                    locale: { type: "string", enum: ["ar", "fr"] }
                  }
                }
              }
            }
          },
          responses: { "201": { description: "Created" }, "400": { description: "Validation error" } }
        }
      },
      "/api/auth/login": {
        post: {
          tags: ["auth"],
          summary: "Start a cookie session",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["email", "password"],
                  properties: {
                    email: { type: "string", format: "email" },
                    password: { type: "string" }
                  }
                }
              }
            }
          },
          responses: { "200": { description: "OK" }, "401": { description: "Invalid credentials" } }
        }
      },
      "/api/auth/me": {
        get: { tags: ["auth"], summary: "Current user", responses: { "200": { description: "OK" } } }
      },
      "/api/auth/logout": {
        post: { tags: ["auth"], summary: "Destroy session", responses: { "200": { description: "OK" } } }
      },
      "/api/content/package": {
        get: {
          tags: ["content"],
          summary: "Downloadable offline content package for a region",
          parameters: [
            {
              name: "regionId",
              in: "query",
              schema: { type: "string", example: "dz-eloued" }
            }
          ],
          responses: { "200": { description: "Content package" }, "404": { description: "Unknown region" } }
        }
      },
      "/api/content/pests": {
        get: {
          tags: ["content"],
          summary: "List published pest records",
          parameters: [
            { name: "cropId", in: "query", schema: { type: "string" } },
            { name: "beneficial", in: "query", schema: { type: "boolean" } },
            { name: "q", in: "query", schema: { type: "string" } }
          ],
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/content/pests/{slug}": {
        get: {
          tags: ["content"],
          summary: "Pest detail with sources",
          parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "404": { description: "Not found" } }
        }
      },
      "/api/content/sources": {
        get: { tags: ["content"], summary: "Bibliography", responses: { "200": { description: "OK" } } }
      },
      "/api/cases": {
        get: {
          tags: ["cases"],
          summary: "List cases visible to the current user",
          security: [{ cookieAuth: [] }],
          responses: { "200": { description: "OK" }, "401": { description: "Unauthorized" } }
        },
        post: {
          tags: ["cases"],
          summary: "Idempotent upsert of a case by clientId",
          security: [{ cookieAuth: [] }],
          responses: {
            "201": { description: "Saved" },
            "409": { description: "Sync conflict" }
          }
        }
      },
      "/api/cases/{id}/submit": {
        post: {
          tags: ["cases"],
          summary: "Submit a saved case",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/cases/{id}/referral": {
        post: {
          tags: ["cases"],
          summary: "Request an expert referral",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "201": { description: "Created" }, "409": { description: "Referral already open" } }
        }
      },
      "/api/referrals": {
        get: {
          tags: ["referrals"],
          summary: "List referrals visible to the current user",
          security: [{ cookieAuth: [] }],
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/referrals/{id}/respond": {
        post: {
          tags: ["referrals"],
          summary: "Expert response",
          security: [{ cookieAuth: [] }],
          parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          responses: { "200": { description: "OK" }, "403": { description: "Forbidden" } }
        }
      },
      "/api/experts": {
        get: {
          tags: ["experts"],
          summary: "Public verified expert directory",
          responses: { "200": { description: "OK" } }
        }
      },
      "/api/dashboard/stats": {
        get: {
          tags: ["dashboard"],
          summary: "Institution dashboard aggregates with small-count suppression",
          security: [{ cookieAuth: [] }],
          responses: { "200": { description: "OK" }, "403": { description: "Forbidden" } }
        }
      },
      "/api/admin/organizations": {
        get: {
          tags: ["admin"],
          summary: "Organization and licence overview (super admin)",
          security: [{ cookieAuth: [] }],
          responses: { "200": { description: "OK" }, "403": { description: "Forbidden" } }
        }
      }
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "fg_session" }
      }
    }
  };
}

export function docsPage(_req: Request, res: Response): void {
  res.type("html").send(`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>FieldGuard API</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
body{font-family:system-ui,sans-serif;margin:2rem;line-height:1.5;background:#f7f5ee;color:#17312a}
a{color:#175b45}code{background:#e6e2d4;padding:.15rem .35rem;border-radius:.25rem}
main{max-width:900px;margin:auto}
</style></head>
<body><main>
<h1>FieldGuard API</h1>
<p>This is a documented JSON API intended for the FieldGuard web client and future integrations.
The OpenAPI 3.0 document is available at <a href="/api/openapi.json"><code>/api/openapi.json</code></a>.</p>
<h2>Authentication</h2>
<p>Session cookie <code>fg_session</code>, HttpOnly and SameSite=Lax. Register or log in before calling protected endpoints.</p>
<h2>Offline sync</h2>
<p>Cases are upserted idempotently by <code>clientId</code>. A conflicted save returns HTTP 409 with the current
<code>serverCase</code>; the client never deletes a local case automatically.</p>
<h2>Data honesty</h2>
<p>Chemical product names and doses are intentionally absent because no verified Algerian registration
dataset is bundled. Diagnostic confidence is qualitative and rule-based.</p>
</main></body></html>`);
}
