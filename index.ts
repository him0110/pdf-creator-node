/**
 * @author Shyam Hajare <hajareshyam@gmail.com>
 */

/**
 * create function is used to create pdf from handlebar templates.
 * @param  {document, options}
 * @return {callback}
 */

import Handlebars from "handlebars";
import puppeteer, { PDFOptions } from "puppeteer";
import { Readable } from "stream";
import * as fs from "fs";

Handlebars.registerHelper(
  "ifCond",
  function (
    this: any,
    v1: any,
    operator: string,
    v2: any,
    options: IfCondOptions
  ) {
    switch (operator) {
      case "==":
        return v1 == v2 ? options.fn(this) : options.inverse(this);
      case "===":
        return v1 === v2 ? options.fn(this) : options.inverse(this);
      case "!=":
        return v1 != v2 ? options.fn(this) : options.inverse(this);
      case "!==":
        return v1 !== v2 ? options.fn(this) : options.inverse(this);
      case "<":
        return v1 < v2 ? options.fn(this) : options.inverse(this);
      case "<=":
        return v1 <= v2 ? options.fn(this) : options.inverse(this);
      case ">":
        return v1 > v2 ? options.fn(this) : options.inverse(this);
      case ">=":
        return v1 >= v2 ? options.fn(this) : options.inverse(this);
      case "&&":
        return v1 && v2 ? options.fn(this) : options.inverse(this);
      case "||":
        return v1 || v2 ? options.fn(this) : options.inverse(this);
      default:
        return options.inverse(this);
    }
  }
);

/**
 * Converts an html-pdf style `border` value into a Puppeteer margin object.
 * Supports:
 *   - string shorthand  →  "10mm"  (applied to all four sides)
 *   - object            →  { top, right, bottom, left }
 */
function parseBorder(
  border?: PdfOptions["border"]
): PDFOptions["margin"] {
  if (!border) return undefined;
  if (typeof border === "string") {
    return { top: border, right: border, bottom: border, left: border };
  }
  return {
    top: border.top,
    right: border.right,
    bottom: border.bottom,
    left: border.left,
  };
}

/**
 * Translates html-pdf variables ({{page}}, {{pages}}) to Puppeteer classes
 */
function processTemplate(template?: string): string {
  if (!template) return "<span></span>";
  return template
    .replace(/\{\{\s*page\s*\}\}/g, '<span class="pageNumber"></span>')
    .replace(/\{\{\s*pages\s*\}\}/g, '<span class="totalPages"></span>');
}

/**
 * Translates PdfOptions (html-pdf API shape) → Puppeteer PDFOptions.
 */
function buildPuppeteerOptions(options: PdfOptions): PDFOptions {
  const headerContent = options.header?.contents;
  const footerRaw = options.footer?.contents;
  const footerContent = typeof footerRaw === "string" ? footerRaw : footerRaw?.default;

  const hasHeader = !!headerContent;
  const hasFooter = !!footerContent;

  const margin = parseBorder(options.border) || {};
  if (options.header?.height) {
    margin.top = options.header.height;
  }
  if (options.footer?.height) {
    margin.bottom = options.footer.height;
  }

  // Ensure default font styles for headers/footers so they aren't unstyled/tiny
  const defaultStyles = `font-size: 10px; width: 100%; -webkit-print-color-adjust: exact;`;

  return {
    format: options.format,
    landscape: options.orientation === "landscape",
    margin,
    width: options.width,
    height: options.height,
    printBackground: options.printBackground ?? true,
    timeout: options.timeout,
    displayHeaderFooter: hasHeader || hasFooter,
    headerTemplate: hasHeader
      ? `<div style="${defaultStyles}">${processTemplate(headerContent)}</div>`
      : "<span></span>",
    footerTemplate: hasFooter
      ? `<div style="${defaultStyles}">${processTemplate(footerContent)}</div>`
      : "<span></span>",
  };
}

const create = function (
  document: Document,
  options: PdfOptions
): Promise<Buffer | Readable | FileInfo> {
  return new Promise(async (resolve, reject) => {
    if (!document || !document.html || !document.data) {
      return reject(new Error("Some, or all, options are missing."));
    }

    let browser: Awaited<ReturnType<typeof puppeteer.launch>> | undefined;
    try {
      // Compile Handlebars template with the provided data
      const html = Handlebars.compile(document.html)(document.data);

      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });

      const page = await browser.newPage();

      // Set the base URL so relative resources (images, CSS) resolve correctly
      await page.setContent(html, {
        waitUntil: "networkidle0",
        ...(options.base ? { timeout: options.timeout ?? 30000 } : {}),
      });

      const pdfBuffer = await page.pdf(buildPuppeteerOptions(options));

      switch (document.type) {
        case "buffer":
          resolve(pdfBuffer as Buffer);
          break;

        case "stream": {
          const readable = new Readable();
          readable.push(pdfBuffer);
          readable.push(null);
          resolve(readable);
          break;
        }

        default: {
          // "" or "file"  →  write to disk
          const filePath = document.path!;
          fs.writeFile(filePath, pdfBuffer, (err) => {
            if (err) reject(err);
            else resolve({ filename: filePath });
          });
          break;
        }
      }
    } catch (err) {
      reject(err);
    } finally {
      if (browser) await browser.close();
    }
  });
};

module.exports.create = create;
