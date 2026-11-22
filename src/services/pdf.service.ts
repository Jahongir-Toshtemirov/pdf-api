import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { Page } from "playwright";
import { env } from "../config/env.js";
import { getBrowser } from "../lib/playwright.js";
import { prisma } from "../lib/prisma.js";
import { pdfGenerationFailed, notFound } from "../lib/errors.js";
import { signPayload, verifySignature } from "../utils/hash.js";
import type { PdfOptions } from "../schemas/pdf.schemas.js";
import { getSettings } from "./settings.service.js";

const STORAGE_DIR = join(process.cwd(), "storage");

type PlaywrightPdfOptions = NonNullable<Parameters<Page["pdf"]>[0]>;

const DEFAULT_PDF_OPTIONS: Required<
  Pick<
    PdfOptions,
    | "format"
    | "printBackground"
    | "landscape"
    | "scale"
    | "displayHeaderFooter"
  >
> & {
  margin: NonNullable<PdfOptions["margin"]>;
  headerTemplate: string;
  footerTemplate: string;
} = {
  format: "A4",
  printBackground: true,
  landscape: false,
  scale: 1,
  displayHeaderFooter: false,
  headerTemplate: "<span></span>",
  footerTemplate: "<span></span>",
  margin: {
    top: "0.5in",
    right: "0.5in",
    bottom: "0.5in",
    left: "0.5in",
  },
};

export interface PdfResult {
  buffer: Buffer;
  sizeBytes: number;
  filename: string;
}

export interface SignedPdfResult {
  url: string;
  expiresAt: string;
  filename: string;
  sizeBytes: number;
}

function toPlaywrightOptions(options?: PdfOptions): PlaywrightPdfOptions {
  return {
    format: options?.format ?? DEFAULT_PDF_OPTIONS.format,
    printBackground:
      options?.printBackground ?? DEFAULT_PDF_OPTIONS.printBackground,
    landscape: options?.landscape ?? DEFAULT_PDF_OPTIONS.landscape,
    scale: options?.scale ?? DEFAULT_PDF_OPTIONS.scale,
    displayHeaderFooter:
      options?.displayHeaderFooter ?? DEFAULT_PDF_OPTIONS.displayHeaderFooter,
    headerTemplate:
      options?.headerTemplate ?? DEFAULT_PDF_OPTIONS.headerTemplate,
    footerTemplate:
      options?.footerTemplate ?? DEFAULT_PDF_OPTIONS.footerTemplate,
    margin: options?.margin ?? DEFAULT_PDF_OPTIONS.margin,
  };
}

export async function generatePdfFromHtml(
  html: string,
  options?: PdfOptions,
  filename = "document.pdf",
): Promise<PdfResult> {
  const browser = await getBrowser();
  const page = await browser.newPage();

  try {
    await page.setContent(html, {
      waitUntil: "networkidle",
      timeout: 30_000,
    });

    const pdfBuffer = await page.pdf(toPlaywrightOptions(options));
    const buffer = Buffer.from(pdfBuffer);

    return {
      buffer,
      sizeBytes: buffer.byteLength,
      filename,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown PDF generation error";
    throw pdfGenerationFailed("Failed to generate PDF", { reason: message });
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function storePdfForDownload(
  result: PdfResult,
): Promise<SignedPdfResult> {
  await mkdir(STORAGE_DIR, { recursive: true });

  const id = randomUUID();
  const settings = await getSettings();
  const expiresAt = new Date(
    Date.now() + settings.signedUrlTtlSeconds * 1000,
  );
  const diskName = `${id}.pdf`;
  const filePath = join(STORAGE_DIR, diskName);

  await writeFile(filePath, result.buffer);

  await prisma.pdfArtifact.create({
    data: {
      id,
      filename: result.filename,
      sizeBytes: result.sizeBytes,
      expiresAt,
    },
  });

  const exp = Math.floor(expiresAt.getTime() / 1000);
  const payload = `${id}.${exp}`;
  const signature = signPayload(payload);
  const url = `${env.PUBLIC_BASE_URL}/v1/pdf/download/${id}?exp=${exp}&sig=${signature}`;

  return {
    url,
    expiresAt: expiresAt.toISOString(),
    filename: result.filename,
    sizeBytes: result.sizeBytes,
  };
}

export async function resolveSignedDownload(
  id: string,
  exp: string,
  sig: string,
): Promise<{ buffer: Buffer; filename: string }> {
  const expNum = Number(exp);
  if (!Number.isFinite(expNum) || expNum * 1000 < Date.now()) {
    throw notFound("Download link has expired");
  }

  const payload = `${id}.${exp}`;
  if (!verifySignature(payload, sig)) {
    throw notFound("Invalid download signature");
  }

  const artifact = await prisma.pdfArtifact.findUnique({ where: { id } });
  if (!artifact) {
    throw notFound("PDF not found");
  }

  if (artifact.expiresAt.getTime() < Date.now()) {
    throw notFound("Download link has expired");
  }

  const filePath = join(STORAGE_DIR, `${id}.pdf`);
  try {
    const buffer = await readFile(filePath);
    return { buffer, filename: artifact.filename };
  } catch {
    throw notFound("PDF file is no longer available");
  }
}

export async function cleanupExpiredArtifacts(): Promise<number> {
  const expired = await prisma.pdfArtifact.findMany({
    where: { expiresAt: { lt: new Date() } },
  });

  for (const artifact of expired) {
    await unlink(join(STORAGE_DIR, `${artifact.id}.pdf`)).catch(() => undefined);
  }

  const result = await prisma.pdfArtifact.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });

  return result.count;
}
