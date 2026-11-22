import type { ApiKey } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { unauthorized } from "../lib/errors.js";
import {
  downloadParamsSchema,
  downloadQuerySchema,
  templateParamsSchema,
} from "../schemas/common.schemas.js";
import {
  generateFromBuiltinSchema,
  generateFromHtmlSchema,
  generateFromTemplateSchema,
  type PdfOptions,
} from "../schemas/pdf.schemas.js";
import {
  generatePdfFromHtml,
  resolveSignedDownload,
  storePdfForDownload,
} from "../services/pdf.service.js";
import {
  loadBuiltinTemplate,
  renderHtmlTemplate,
} from "../services/template.service.js";
import { recordGeneration } from "../services/admin.service.js";
import {
  assertWithinQuota,
  incrementUsage,
} from "../services/usage.service.js";
import { successBody } from "../utils/response.js";

const invoiceExample = {
  template: `<!DOCTYPE html>
<html><head><style>
  body{font-family:Segoe UI,Arial,sans-serif;color:#0f172a;padding:24px}
  h1{margin:0 0 8px} .muted{color:#64748b}
  table{width:100%;border-collapse:collapse;margin-top:24px}
  th,td{padding:10px;border-bottom:1px solid #e2e8f0;text-align:left}
  .total{font-size:18px;font-weight:700;margin-top:16px;text-align:right}
</style></head><body>
  <h1>{{company.name}}</h1>
  <p class="muted">Invoice {{invoice.number}} · {{invoice.date}}</p>
  <p>Bill to: <strong>{{client.name}}</strong></p>
  <table><thead><tr><th>Item</th><th>Amount</th></tr></thead><tbody>
  {{#items}}<tr><td>{{description}}</td><td>{{amount}}</td></tr>{{/items}}
  </tbody></table>
  <div class="total">Total: {{total}}</div>
</body></html>`,
  data: {
    company: { name: "Acme Studio LLC" },
    invoice: { number: "INV-2026-0042", date: "Nov 22, 2026" },
    client: { name: "Northwind Traders" },
    items: [
      { description: "Brand identity system", amount: "$4,500.00" },
      { description: "Website redesign", amount: "$7,200.00" },
    ],
    total: "$11,700.00",
  },
  options: { format: "A4", printBackground: true },
  delivery: "binary",
  filename: "invoice.pdf",
};

const builtinBodySchema = generateFromBuiltinSchema.omit({ templateId: true });

async function deliverPdf(
  request: FastifyRequest,
  reply: FastifyReply,
  html: string,
  options: PdfOptions | undefined,
  filename: string | undefined,
  delivery: "binary" | "url",
  source: string,
) {
  const apiKey = request.apiKey as ApiKey | undefined;
  if (!apiKey) throw unauthorized();

  await assertWithinQuota(apiKey);

  const pdf = await generatePdfFromHtml(
    html,
    options,
    filename ?? "document.pdf",
  );
  const usage = await incrementUsage(apiKey.id);

  void recordGeneration({
    apiKeyId: apiKey.id,
    source,
    filename: pdf.filename,
    sizeBytes: pdf.sizeBytes,
    delivery,
    requestId: request.requestId,
  }).catch(() => undefined);

  void reply.header("x-pdf-usage-remaining", String(usage.remaining));
  void reply.header("x-pdf-usage-limit", String(usage.limit));

  if (delivery === "url") {
    const signed = await storePdfForDownload(pdf);
    return successBody(
      {
        url: signed.url,
        expiresAt: signed.expiresAt,
        filename: signed.filename,
        sizeBytes: signed.sizeBytes,
        usage,
      },
      request.requestId,
    );
  }

  void reply.header(
    "Content-Disposition",
    `attachment; filename="${pdf.filename}"`,
  );
  void reply.header("Content-Length", String(pdf.sizeBytes));
  void reply.type("application/pdf");
  return reply.send(pdf.buffer);
}

const pdfRoutes: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/v1/pdf",
    {
      schema: {
        tags: ["PDF"],
        summary: "Generate PDF from HTML",
        description:
          "Renders a complete HTML document to a high-fidelity PDF using Chromium. Ideal when you already have fully composed HTML.\n\nReturns `application/pdf` by default, or JSON with a signed URL when `delivery` is `\"url\"`.",
        security: [{ bearerAuth: [] }],
        body: generateFromHtmlSchema,
        // No response schema: endpoint returns either PDF bytes or JSON.
        // Zod response serializers cannot express dual binary/JSON content types.
      },
    },
    async (request, reply) => {
      const body = request.body;
      return deliverPdf(
        request,
        reply,
        body.html,
        body.options,
        body.filename,
        body.delivery ?? "binary",
        "html",
      );
    },
  );

  app.post(
    "/v1/pdf/template",
    {
      schema: {
        tags: ["PDF"],
        summary: "Generate PDF from template + data",
        description:
          "Most common endpoint for business documents. Injects `data` into an HTML template using mustache-style placeholders (`{{var}}`, `{{#items}}...{{/items}}`), then renders a PDF.\n\n**Tip:** Start from a built-in template via `POST /v1/pdf/templates/:templateId`, or copy example HTML from the docs.\n\nReturns `application/pdf` by default, or JSON with a signed URL when `delivery` is `\"url\"`.",
        security: [{ bearerAuth: [] }],
        body: generateFromTemplateSchema,
      },
    },
    async (request, reply) => {
      const body = request.body;
      const html = renderHtmlTemplate(
        body.template,
        body.data as Record<string, unknown>,
      );

      return deliverPdf(
        request,
        reply,
        html,
        body.options,
        body.filename ?? "document.pdf",
        body.delivery ?? "binary",
        "template",
      );
    },
  );

  app.post(
    "/v1/pdf/templates/:templateId",
    {
      schema: {
        tags: ["PDF"],
        summary: "Generate PDF from a built-in template",
        description:
          "Renders one of the curated business templates (`invoice`, `report`, `certificate`) with your data. Call `GET /v1/templates` for field reference and example payloads.\n\nReturns `application/pdf` by default, or JSON with a signed URL when `delivery` is `\"url\"`.",
        security: [{ bearerAuth: [] }],
        params: templateParamsSchema,
        body: builtinBodySchema,
      },
    },
    async (request, reply) => {
      const { templateId } = request.params;
      const body = request.body;

      const template = await loadBuiltinTemplate(templateId);
      const html = renderHtmlTemplate(
        template,
        body.data as Record<string, unknown>,
      );

      return deliverPdf(
        request,
        reply,
        html,
        body.options,
        body.filename ?? `${templateId}.pdf`,
        body.delivery ?? "binary",
        `builtin:${templateId}`,
      );
    },
  );

  app.get(
    "/v1/pdf/download/:id",
    {
      schema: {
        tags: ["PDF"],
        summary: "Download a temporarily signed PDF",
        description:
          "Fetches a PDF previously generated with `delivery: \"url\"`. Links expire automatically. Returns `application/pdf`.",
        security: [],
        params: downloadParamsSchema,
        querystring: downloadQuerySchema,
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { exp, sig } = request.query;
      const file = await resolveSignedDownload(id, exp, sig);

      void reply.header(
        "Content-Disposition",
        `attachment; filename="${file.filename}"`,
      );
      void reply.header("Content-Length", String(file.buffer.byteLength));
      void reply.type("application/pdf");
      return reply.send(file.buffer);
    },
  );

};

export { invoiceExample };
export default pdfRoutes;
