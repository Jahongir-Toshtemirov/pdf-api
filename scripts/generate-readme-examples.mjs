import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "docs", "examples");
mkdirSync(outDir, { recursive: true });

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function getPath(data, path) {
  if (path === ".") return data["."] ?? data;
  let current = data;
  for (const part of path.split(".").filter(Boolean)) {
    if (current == null) return undefined;
    current = current[part];
  }
  return current;
}

function render(template, data) {
  let result = template;
  result = result.replace(
    /\{\{([#^])([\w.]+)\}\}([\s\S]*?)\{\{\/\2\}\}/g,
    (_m, type, key, content) => {
      const value = getPath(data, key);
      if (type === "#") {
        if (Array.isArray(value)) {
          return value
            .map((item) => {
              const scope =
                item !== null && typeof item === "object" && !Array.isArray(item)
                  ? { ...data, ...item, ".": item }
                  : { ...data, ".": item };
              return render(content, scope);
            })
            .join("");
        }
        if (value) {
          const scope =
            value !== null && typeof value === "object" && !Array.isArray(value)
              ? { ...data, ...value }
              : data;
          return render(content, scope);
        }
        return "";
      }
      return value ? "" : render(content, data);
    },
  );
  result = result.replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_m, key) => {
    const value = getPath(data, key);
    return value == null ? "" : String(value);
  });
  result = result.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, key) => {
    const value = getPath(data, key);
    return value == null ? "" : escapeHtml(value);
  });
  return result;
}

const examples = {
  invoice: {
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
  report: {
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
        body: "October closed at $248,400 in recognized revenue, up 12.4% month-over-month. Expansion revenue from existing accounts contributed $41,200.",
      },
      {
        heading: "Product",
        body: "Template-based PDF generation accounted for 71% of API calls. Median generation latency remained under 1.2s for A4 documents.",
      },
      {
        heading: "Outlook",
        body: "Pipeline coverage for Q4 sits at 2.8x. Focus areas: usage-based pricing rollout and regional CDN for artifact delivery.",
      },
    ],
    footerNote: "Confidential — for internal distribution only",
  },
  certificate: {
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
};

const browser = await chromium.launch();

for (const [id, data] of Object.entries(examples)) {
  const tpl = readFileSync(join(root, "src", "templates", `${id}.html`), "utf8");
  const html = render(tpl, data);
  const page = await browser.newPage({
    viewport: { width: 900, height: 1280 },
  });
  await page.setContent(html, { waitUntil: "networkidle", timeout: 60_000 });
  await page.screenshot({
    path: join(outDir, `${id}.png`),
    fullPage: true,
  });
  await page.close();
  console.log(`wrote docs/examples/${id}.png`);
}

await browser.close();
console.log("done");
