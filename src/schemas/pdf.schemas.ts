import { z } from "zod";

export const pdfOptionsObjectSchema = z
  .object({
    format: z
      .enum(["A4", "Letter", "Legal", "Tabloid", "A3", "A5"])
      .default("A4")
      .describe("Page size for the generated PDF"),
    margin: z
      .object({
        top: z.string().default("0.5in"),
        right: z.string().default("0.5in"),
        bottom: z.string().default("0.5in"),
        left: z.string().default("0.5in"),
      })
      .optional()
      .describe("Page margins (CSS units, e.g. 0.5in, 12mm)"),
    printBackground: z
      .boolean()
      .default(true)
      .describe("Whether to print CSS backgrounds"),
    landscape: z.boolean().default(false).describe("Landscape orientation"),
    scale: z
      .number()
      .min(0.1)
      .max(2)
      .default(1)
      .describe("Scale of the webpage rendering"),
    displayHeaderFooter: z
      .boolean()
      .default(false)
      .describe("Show header and footer templates"),
    headerTemplate: z
      .string()
      .max(50_000)
      .optional()
      .describe("HTML template for the header (requires displayHeaderFooter)"),
    footerTemplate: z
      .string()
      .max(50_000)
      .optional()
      .describe("HTML template for the footer (requires displayHeaderFooter)"),
  })
  .strict();

export const pdfOptionsSchema = pdfOptionsObjectSchema.optional();

export const deliverySchema = z
  .enum(["binary", "url"])
  .default("binary")
  .describe(
    "Return the PDF as a binary download (binary) or a temporary signed URL (url)",
  );

export const generateFromHtmlSchema = z
  .object({
    html: z
      .string()
      .min(1)
      .max(2_000_000)
      .describe("Complete HTML document to render as PDF"),
    options: pdfOptionsSchema,
    delivery: deliverySchema,
    filename: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\w.\- ]+\.pdf$/i, "Filename must end with .pdf")
      .optional()
      .describe("Optional download filename (must end with .pdf)"),
  })
  .strict();

export const generateFromTemplateSchema = z
  .object({
    template: z
      .string()
      .min(1)
      .max(2_000_000)
      .describe(
        "HTML template with {{placeholders}}. Supports {{var}}, {{{raw}}}, {{#section}}...{{/section}}, {{^inverted}}...{{/inverted}}",
      ),
    data: z
      .record(z.unknown())
      .default({})
      .describe("Key-value data injected into the template"),
    options: pdfOptionsSchema,
    delivery: deliverySchema,
    filename: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\w.\- ]+\.pdf$/i, "Filename must end with .pdf")
      .optional()
      .describe("Optional download filename (must end with .pdf)"),
  })
  .strict();

export const generateFromBuiltinSchema = z
  .object({
    templateId: z
      .enum(["invoice", "report", "certificate"])
      .describe("Built-in template identifier"),
    data: z
      .record(z.unknown())
      .default({})
      .describe("Template data — see /v1/templates for expected fields"),
    options: pdfOptionsSchema,
    delivery: deliverySchema,
    filename: z
      .string()
      .min(1)
      .max(200)
      .regex(/^[\w.\- ]+\.pdf$/i, "Filename must end with .pdf")
      .optional(),
  })
  .strict();

export type GenerateFromHtmlInput = z.infer<typeof generateFromHtmlSchema>;
export type GenerateFromTemplateInput = z.infer<
  typeof generateFromTemplateSchema
>;
export type GenerateFromBuiltinInput = z.infer<typeof generateFromBuiltinSchema>;
export type PdfOptions = z.infer<typeof pdfOptionsObjectSchema>;
