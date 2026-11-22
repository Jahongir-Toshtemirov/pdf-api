import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { notFound } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { renderTemplate } from "../utils/mustache.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = join(__dirname, "..", "templates");

export type BuiltinTemplateId = "invoice" | "report" | "certificate";

export interface BuiltinTemplateMeta {
  id: BuiltinTemplateId;
  name: string;
  description: string;
  filename: string;
  exampleData: Record<string, unknown>;
}

export const BUILTIN_TEMPLATES: BuiltinTemplateMeta[] = [
  {
    id: "invoice",
    name: "Professional Invoice",
    description:
      "Clean invoice layout with line items, tax, totals, and payment details",
    filename: "invoice.html",
    exampleData: {
      company: {
        name: "Acme Studio LLC",
        address: "1200 Market Street, Suite 400",
        city: "San Francisco, CA 94103",
        email: "billing@acmestudio.com",
        phone: "+1 (415) 555-0142",
      },
      invoice: {
        number: "INV-2026-0042",
        date: "November 22, 2026",
        dueDate: "December 22, 2026",
        status: "Due",
      },
      client: {
        name: "Northwind Traders",
        address: "88 Harbor Avenue",
        city: "Seattle, WA 98101",
        email: "ap@northwind.com",
      },
      items: [
        {
          description: "Brand identity system",
          quantity: 1,
          unitPrice: "$4,500.00",
          amount: "$4,500.00",
        },
        {
          description: "Website redesign (landing + docs)",
          quantity: 1,
          unitPrice: "$7,200.00",
          amount: "$7,200.00",
        },
        {
          description: "API documentation theme",
          quantity: 8,
          unitPrice: "$185.00",
          amount: "$1,480.00",
        },
      ],
      subtotal: "$13,180.00",
      taxLabel: "Sales tax (8.5%)",
      tax: "$1,120.30",
      total: "$14,300.30",
      notes:
        "Payment due within 30 days. Wire transfers preferred. Thank you for your business.",
      payment: {
        method: "ACH / Wire",
        accountName: "Acme Studio LLC",
        accountNumber: "****4821",
        routing: "121000248",
      },
    },
  },
  {
    id: "report",
    name: "Monthly Business Report",
    description:
      "Executive summary report with KPIs, highlights, and section narrative",
    filename: "report.html",
    exampleData: {
      title: "October Performance Report",
      subtitle: "Product & Revenue Overview",
      period: "October 1 – 31, 2026",
      preparedFor: "Executive Leadership",
      preparedBy: "Analytics Team",
      company: "Lumen Analytics",
      kpis: [
        {
          label: "Monthly Revenue",
          value: "$248,400",
          change: "↑ 12.4%",
          context: "105% of target",
        },
        {
          label: "Active Customers",
          value: "1,842",
          change: "↑ 6.1%",
          context: "vs last month",
        },
        {
          label: "Churn Rate",
          value: "2.1%",
          change: "↓ 0.4 pts",
          context: "below 2.5% goal",
        },
        {
          label: "NPS",
          value: "64",
          change: "↑ 3 pts",
          context: "target ≥ 60",
        },
      ],
      highlights: [
        "Enterprise plan upgrades drove 38% of new MRR.",
        "Support response time improved to under 2 hours on average.",
        "API uptime held at 99.98% across all regions.",
      ],
      breakdown: [
        { label: "Subscriptions", share: "54%", width: "54" },
        { label: "Usage / overage", share: "28%", width: "28" },
        { label: "Professional services", share: "18%", width: "18" },
      ],
      sections: [
        {
          heading: "Revenue",
          body: "October closed at $248,400 in recognized revenue, up 12.4% month-over-month. Expansion revenue from existing accounts contributed $41,200, while new logos added $29,800.",
        },
        {
          heading: "Product",
          body: "Template-based PDF generation accounted for 71% of API calls. Median generation latency remained under 1.2s for A4 documents with standard CSS.",
        },
        {
          heading: "Outlook",
          body: "Pipeline coverage for Q4 sits at 2.8x. Focus areas: usage-based pricing rollout and regional CDN for artifact delivery.",
        },
      ],
      footerNote: "Confidential — for internal distribution only",
    },
  },
  {
    id: "certificate",
    name: "Certificate of Completion",
    description:
      "Elegant certificate suitable for courses, awards, and achievements",
    filename: "certificate.html",
    exampleData: {
      title: "Certificate of Completion",
      subtitle: "This certifies that",
      recipient: "Jordan Hale",
      course: "Advanced API Design & Documentation",
      issuedBy: "Lumen Academy",
      date: "November 22, 2026",
      credentialId: "CERT-2026-8891",
      signerName: "Dr. Elena Voss",
      signerTitle: "Director of Education",
      coSignerName: "Marcus Chen",
      coSignerTitle: "Head of Curriculum",
    },
  },
];

const cache = new Map<BuiltinTemplateId, string>();

export function invalidateTemplateCache(id?: BuiltinTemplateId): void {
  if (id) {
    cache.delete(id);
    return;
  }
  cache.clear();
}

export async function loadFileTemplate(id: BuiltinTemplateId): Promise<string> {
  const meta = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (!meta) {
    throw notFound(`Built-in template "${id}" not found`);
  }
  return readFile(join(TEMPLATES_DIR, meta.filename), "utf8");
}

export async function loadBuiltinTemplate(
  id: BuiltinTemplateId,
): Promise<string> {
  const cached = cache.get(id);
  if (cached) return cached;

  const stored = await prisma.storedTemplate.findUnique({ where: { id } });
  if (stored?.html) {
    cache.set(id, stored.html);
    return stored.html;
  }

  const html = await loadFileTemplate(id);
  cache.set(id, html);
  return html;
}

export function listBuiltinTemplates(): BuiltinTemplateMeta[] {
  return BUILTIN_TEMPLATES;
}

export function getBuiltinMeta(id: string): BuiltinTemplateMeta {
  const meta = BUILTIN_TEMPLATES.find((t) => t.id === id);
  if (!meta) {
    throw notFound(`Built-in template "${id}" not found`);
  }
  return meta;
}

export function renderHtmlTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  return renderTemplate(template, data as Record<string, never>);
}
