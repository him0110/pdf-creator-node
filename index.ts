/**
 * @author Shyam Hajare <hajareshyam@gmail.com>
 */

/**
 * create function is used to create pdf from handlebar templates.
 * @param  {document, options}
 * @return {callback}
 */

import Handlebars from "handlebars";
import puppeteer from "puppeteer";
import { Readable } from "stream";
import path from "path";
import os from "os";

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

function parseBorder(
  border:
    | string
    | { top?: string; right?: string; bottom?: string; left?: string }
    | undefined
): { top: string; right: string; bottom: string; left: string } {
  if (!border) return { top: "0", right: "0", bottom: "0", left: "0" };
  if (typeof border === "string") {
    return { top: border, right: border, bottom: border, left: border };
  }
  return {
    top: border.top || "0",
    right: border.right || "0",
    bottom: border.bottom || "0",
    left: border.left || "0",
  };
}

function injectBaseHref(html: string, base: string): string {
  const baseTag = `<base href="${base}">`;
  const headMatch = html.match(/<head[^>]*>/i);
  if (headMatch) {
    return html.replace(headMatch[0], headMatch[0] + baseTag);
  }
  const htmlMatch = html.match(/<html[^>]*>/i);
  if (htmlMatch) {
    return html.replace(
      htmlMatch[0],
      htmlMatch[0] + "<head>" + baseTag + "</head>"
    );
  }
  return baseTag + html;
}

interface ExtractedPageElements {
  headerDefault?: string;
  headerFirst?: string;
  headerLast?: string;
  headerByPage: Record<number, string>;
  footerDefault?: string;
  footerFirst?: string;
  footerLast?: string;
  footerByPage: Record<number, string>;
  styles: string;
  bodyHtml: string;
}

function extractPageElements(html: string): ExtractedPageElements {
  const result: ExtractedPageElements = {
    headerByPage: {},
    footerByPage: {},
    styles: "",
    bodyHtml: html,
  };

  // Extract all <style> and <link rel="stylesheet"> tags for re-injection into header/footer
  const styleRegex = /<style[^>]*>[\s\S]*?<\/style>/gi;
  const linkRegex = /<link[^>]*rel=["']stylesheet["'][^>]*\/?>/gi;
  const styles: string[] = [];
  let match;

  while ((match = styleRegex.exec(html)) !== null) {
    styles.push(match[0]);
  }
  while ((match = linkRegex.exec(html)) !== null) {
    styles.push(match[0]);
  }
  result.styles = styles.join("\n");

  let modified = html;

  // html-pdf uses outerHTML for extracted elements. Our regex captures the full
  // match (m[0]) which includes the wrapping <div>, matching outerHTML behavior.
  const extractAndRemove = (regex: RegExp): string | undefined => {
    const m = regex.exec(modified);
    if (m) {
      modified = modified.replace(m[0], "");
      return m[0]; // outerHTML — includes the wrapping div, matching html-pdf
    }
    return undefined;
  };

  // Extract #pageHeader-first, #pageHeader-last (wildcard variants first)
  const headerFirstRegex =
    /<div[^>]*id=["']pageHeader-first["'][^>]*>[\s\S]*?<\/div>/i;
  const headerLastRegex =
    /<div[^>]*id=["']pageHeader-last["'][^>]*>[\s\S]*?<\/div>/i;
  const footerFirstRegex =
    /<div[^>]*id=["']pageFooter-first["'][^>]*>[\s\S]*?<\/div>/i;
  const footerLastRegex =
    /<div[^>]*id=["']pageFooter-last["'][^>]*>[\s\S]*?<\/div>/i;

  result.headerFirst = extractAndRemove(headerFirstRegex);
  result.headerLast = extractAndRemove(headerLastRegex);

  // Extract numbered page headers: #pageHeader-1, #pageHeader-2, etc.
  const headerNumRegex =
    /<div[^>]*id=["']pageHeader-(\d+)["'][^>]*>[\s\S]*?<\/div>/gi;
  let numMatch;
  while ((numMatch = headerNumRegex.exec(modified)) !== null) {
    result.headerByPage[parseInt(numMatch[1], 10)] = numMatch[0]; // outerHTML
  }
  modified = modified.replace(headerNumRegex, "");

  // Extract default #pageHeader
  const headerDefaultRegex =
    /<div[^>]*id=["']pageHeader["'][^>]*>[\s\S]*?<\/div>/i;
  result.headerDefault = extractAndRemove(headerDefaultRegex);

  result.footerFirst = extractAndRemove(footerFirstRegex);
  result.footerLast = extractAndRemove(footerLastRegex);

  // Extract numbered page footers: #pageFooter-1, #pageFooter-2, etc.
  const footerNumRegex =
    /<div[^>]*id=["']pageFooter-(\d+)["'][^>]*>[\s\S]*?<\/div>/gi;
  while ((numMatch = footerNumRegex.exec(modified)) !== null) {
    result.footerByPage[parseInt(numMatch[1], 10)] = numMatch[0]; // outerHTML
  }
  modified = modified.replace(footerNumRegex, "");

  // Extract default #pageFooter
  const footerDefaultRegex =
    /<div[^>]*id=["']pageFooter["'][^>]*>[\s\S]*?<\/div>/i;
  result.footerDefault = extractAndRemove(footerDefaultRegex);

  // FIX #1: #pageContent element support
  // html-pdf uses #pageContent's outerHTML as the body if present
  const pageContentRegex =
    /<div[^>]*id=["']pageContent["'][^>]*>([\s\S]*?)<\/div>/i;
  const pageContentMatch = pageContentRegex.exec(modified);
  if (pageContentMatch) {
    result.bodyHtml = pageContentMatch[0]; // outerHTML of #pageContent
  } else {
    result.bodyHtml = modified;
  }

  return result;
}

function applyPaginationReplacements(content: string): string {
  return content
    .replace(/\{\{page\}\}/g, '<span class="pageNumber"></span>')
    .replace(/\{\{pages\}\}/g, '<span class="totalPages"></span>');
}

/**
 * Builds a footer/header template with per-page logic matching html-pdf's createSection.
 *
 * html-pdf createSection pagination logic:
 *   var html = o[pageNum] || c[pageNum]           // RAW page num for per-page lookup
 *   var pageNumFinal = pageNum + paginationOffset
 *   var numPagesFinal = numPages + paginationOffset
 *   if (pageNumFinal === 1 && !html) html = o.first || c.first   // DISPLAYED page for "first"
 *   if (pageNumFinal === numPages && !html) html = o.last || c.last // DISPLAYED vs RAW total for "last"
 *   {{page}} → pageNumFinal, {{pages}} → numPagesFinal
 */
function buildSectionTemplate(
  optionContents:
    | string
    | {
        first?: string;
        default?: string;
        last?: string;
        [page: number]: string;
      }
    | undefined,
  extractedContents: {
    default?: string;
    first?: string;
    last?: string;
    byPage: Record<number, string>;
  },
  styles: string,
  paginationOffset: number
): string {
  // Normalize option contents to object form (html-pdf: if typeof o !== 'object', o = {default: o})
  let o: Record<string, string | undefined> = {};
  if (typeof optionContents === "string") {
    o = { default: optionContents };
  } else if (optionContents) {
    o = { ...optionContents } as Record<string, string | undefined>;
  }

  const c = extractedContents;

  // Pre-process all content strings with {{page}}/{{pages}} replacement
  const processContent = (s: string | undefined): string => {
    if (!s) return "";
    return applyPaginationReplacements(s);
  };

  // Build per-page rules from BOTH option and extracted numeric keys (RAW pageNum)
  const pageRules: string[] = [];
  const seenPages = new Set<number>();

  // Option numeric keys first (higher priority)
  for (const key of Object.keys(o)) {
    const pageNum = parseInt(key, 10);
    if (!isNaN(pageNum)) {
      seenPages.add(pageNum);
      const content = processContent(o[key]);
      pageRules.push(
        `if (pageNum === ${pageNum}) { html = ${JSON.stringify(content)}; }`
      );
    }
  }

  // Extracted numeric keys (lower priority, only if not already set by options)
  for (const [key, val] of Object.entries(c.byPage)) {
    const pageNum = parseInt(key, 10);
    if (!isNaN(pageNum) && !seenPages.has(pageNum)) {
      const content = processContent(val);
      pageRules.push(
        `if (pageNum === ${pageNum}) { html = ${JSON.stringify(content)}; }`
      );
    }
  }

  const oFirst = processContent(o.first);
  const cFirst = processContent(c.first);
  const oLast = processContent(o.last);
  const cLast = processContent(c.last);
  const oDefault = processContent(o.default);
  const cDefault = processContent(c.default);

  // Build JS that exactly matches html-pdf's createSection logic
  // Only include inline <style> tags — external <link> tags cannot resolve in
  // Puppeteer's isolated header/footer context (unlike PhantomJS which shared page context)
  const inlineStyles =
    (styles || "").match(/<style[^>]*>[\s\S]*?<\/style>/gi)?.join("\n") || "";
  return `${inlineStyles}<div style="width: 100%; font-size: 10px; padding: 0 10px;">
    <span id="section-content"></span>
    <script>
      (function() {
        var pageNum = parseInt(document.querySelector('.pageNumber').textContent, 10);
        var totalPages = parseInt(document.querySelector('.totalPages').textContent, 10);
        var paginationOffset = ${paginationOffset};
        var pageNumFinal = pageNum + paginationOffset;
        var numPagesFinal = totalPages + paginationOffset;

        var html = '';

        // Per-page lookup by RAW pageNum (html-pdf: o[pageNum] || c[pageNum])
        ${pageRules.join(" else ")}

        // "first" matches when DISPLAYED page === 1
        if (pageNumFinal === 1 && !html) {
          html = ${JSON.stringify(oFirst)} || ${JSON.stringify(cFirst)};
        }

        // "last" matches when DISPLAYED page === RAW totalPages (html-pdf behavior)
        if (pageNumFinal === totalPages && !html) {
          html = ${JSON.stringify(oLast)} || ${JSON.stringify(cLast)};
        }

        // Fallback to default
        if (!html) {
          html = ${JSON.stringify(oDefault)} || ${JSON.stringify(cDefault)} || '';
        }

        // Replace page number spans with final values
        var el = document.getElementById('section-content');
        el.innerHTML = html;
        var pnSpans = el.querySelectorAll('.pageNumber');
        var tpSpans = el.querySelectorAll('.totalPages');
        for (var i = 0; i < pnSpans.length; i++) pnSpans[i].textContent = pageNumFinal;
        for (var i = 0; i < tpSpans.length; i++) tpSpans[i].textContent = numPagesFinal;
      })();
    </script>
  </div>`;
}

const create = function (
  document: Document,
  options: CreateOptions
): Promise<Buffer | NodeJS.ReadableStream | FileInfo> {
  return new Promise(async (resolve, reject) => {
    if (!document || !document.html || !document.data) {
      reject(new Error("Some, or all, options are missing."));
      return;
    }

    let browser;
    try {
      // Compiles a template
      let html = Handlebars.compile(document.html)(document.data);

      // Inject <base href> for resolving relative resource paths
      if (options.base) {
        html = injectBaseHref(html, options.base);
      }

      // Extract in-HTML #pageHeader / #pageFooter / #pageContent elements (html-pdf feature)
      const extracted = extractPageElements(html);
      html = extracted.bodyHtml;

      browser = await puppeteer.launch({
        headless: true,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
      });
      const page = await browser.newPage();

      // Set viewport size
      if (options.viewportSize) {
        await page.setViewport({
          width: options.viewportSize.width,
          height: options.viewportSize.height,
        });
      }

      // Set custom HTTP headers
      if (options.httpHeaders) {
        await page.setExtraHTTPHeaders(options.httpHeaders);
      }

      // Set HTTP cookies
      if (options.httpCookies && options.httpCookies.length > 0) {
        const cookies = options.httpCookies.map((cookie) => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain || "localhost",
          path: cookie.path || "/",
          httpOnly: cookie.httponly || false,
          secure: cookie.secure || false,
          ...(cookie.expires ? { expires: cookie.expires } : {}),
        }));
        await browser!.setCookie(...cookies);
      }

      // Set zoom factor
      const zoomFactor = options.zoomFactor
        ? parseFloat(options.zoomFactor)
        : 1;

      // FIX #2: For renderDelay "manual", inject callPhantom polyfill BEFORE content loads.
      // html-pdf sets page.onCallback before content is loaded, so window.callPhantom()
      // is available during page JS execution.
      if (options.renderDelay === "manual") {
        await page.evaluateOnNewDocument(() => {
          (window as any).__pdfReadyPromise = new Promise<void>((resolve) => {
            (window as any).__pdfReadyResolve = resolve;
            // Polyfill window.callPhantom — the signal html-pdf pages use
            (window as any).callPhantom = function (data?: any) {
              (window as any).__pdfReadyResolve();
              return data;
            };
          });
        });
      }

      // Load content
      await page.setContent(html, {
        waitUntil: "networkidle0",
        timeout: options.timeout || 30000,
      });

      // Apply zoom factor
      if (zoomFactor !== 1) {
        await page.evaluate((zoom: number) => {
          (document.body.style as any).zoom = String(zoom);
        }, zoomFactor);
      }

      // Render delay handling
      if (options.renderDelay === "manual") {
        // Wait for the page's JS to call window.callPhantom()
        await page.evaluate(() => {
          return (window as any).__pdfReadyPromise;
        });
      } else if (
        typeof options.renderDelay === "number" &&
        options.renderDelay > 0
      ) {
        await new Promise((r) => setTimeout(r, options.renderDelay as number));
      }

      // Determine output type (pdf, png, jpeg)
      const outputType = options.type || "pdf";

      // Resolve output file path
      const resolveOutputPath = (): string => {
        if (document.path) {
          return path.resolve(document.path);
        }
        // Auto-generate filename using directory option (like html-pdf)
        const dir = options.directory || os.tmpdir();
        return path.join(dir, `html-pdf-${process.pid}.${outputType}`);
      };

      if (outputType === "png" || outputType === "jpeg") {
        // Screenshot mode for image output
        const screenshotOptions: any = {
          type: outputType === "jpeg" ? "jpeg" : "png",
          fullPage: true,
        };

        if (outputType === "jpeg" && options.quality) {
          screenshotOptions.quality = parseInt(options.quality, 10);
        }

        if (document.type !== "buffer" && document.type !== "stream") {
          screenshotOptions.path = resolveOutputPath();
        }

        const imgBuffer = await page.screenshot(screenshotOptions);

        await browser.close();
        browser = null;

        switch (document.type) {
          case "buffer":
            resolve(Buffer.from(imgBuffer));
            break;
          case "stream":
            resolve(Readable.from(Buffer.from(imgBuffer)));
            break;
          default:
            resolve({
              filename: screenshotOptions.path || resolveOutputPath(),
            });
            break;
        }
      } else {
        // PDF mode
        const margin = parseBorder(options.border);
        const paginationOffset = options.paginationOffset || 0;

        // Determine header/footer presence from both sources
        // html-pdf: if (options.header || content.header) — triggers on options.header existing, not contents
        const hasOptionHeader = !!options.header;
        const hasOptionFooter = !!options.footer;
        const hasExtractedHeader = !!(
          extracted.headerDefault ||
          extracted.headerFirst ||
          extracted.headerLast ||
          Object.keys(extracted.headerByPage).length > 0
        );
        const hasExtractedFooter = !!(
          extracted.footerDefault ||
          extracted.footerFirst ||
          extracted.footerLast ||
          Object.keys(extracted.footerByPage).length > 0
        );

        const hasHeader = hasOptionHeader || hasExtractedHeader;
        const hasFooter = hasOptionFooter || hasExtractedFooter;

        // Header/footer heights → margins
        if (hasOptionHeader && options.header!.height) {
          margin.top = options.header!.height;
        } else if (hasHeader && margin.top === "0") {
          margin.top = "46mm"; // html-pdf default header height
        }

        if (hasOptionFooter && options.footer!.height) {
          margin.bottom = options.footer!.height;
        } else if (hasFooter && margin.bottom === "0") {
          margin.bottom = "28mm"; // html-pdf default footer height
        }

        const pdfOptions: any = {
          margin,
          printBackground: true,
          timeout: options.timeout || 30000,
        };

        // Page size: format or explicit width/height
        if (options.height && options.width) {
          pdfOptions.height = options.height;
          pdfOptions.width = options.width;
        } else {
          pdfOptions.format = options.format || "A4";
        }

        // Orientation
        if (options.orientation === "landscape") {
          pdfOptions.landscape = true;
        }

        // FIX #3-5: Build header/footer using unified buildSectionTemplate
        // that merges BOTH option contents and extracted HTML contents,
        // with correct pagination logic matching html-pdf's createSection.
        if (hasHeader) {
          pdfOptions.displayHeaderFooter = true;
          pdfOptions.headerTemplate = buildSectionTemplate(
            hasOptionHeader ? options.header!.contents : undefined,
            {
              default: extracted.headerDefault,
              first: extracted.headerFirst,
              last: extracted.headerLast,
              byPage: extracted.headerByPage,
            },
            extracted.styles,
            paginationOffset
          );
        }

        if (hasFooter) {
          pdfOptions.displayHeaderFooter = true;
          pdfOptions.footerTemplate = buildSectionTemplate(
            hasOptionFooter ? options.footer!.contents : undefined,
            {
              default: extracted.footerDefault,
              first: extracted.footerFirst,
              last: extracted.footerLast,
              byPage: extracted.footerByPage,
            },
            extracted.styles,
            paginationOffset
          );
        }

        // Ensure both templates exist when displayHeaderFooter is true
        if (pdfOptions.displayHeaderFooter) {
          if (!pdfOptions.headerTemplate)
            pdfOptions.headerTemplate = "<span></span>";
          if (!pdfOptions.footerTemplate)
            pdfOptions.footerTemplate = "<span></span>";
        }

        // Output path for file mode
        if (document.type !== "buffer" && document.type !== "stream") {
          pdfOptions.path = resolveOutputPath();
        }

        const pdfBuffer = await page.pdf(pdfOptions);

        await browser.close();
        browser = null;

        switch (document.type) {
          case "buffer":
            resolve(Buffer.from(pdfBuffer));
            break;
          case "stream":
            resolve(Readable.from(Buffer.from(pdfBuffer)));
            break;
          default:
            resolve({ filename: pdfOptions.path || resolveOutputPath() });
            break;
        }
      }
    } catch (err) {
      if (browser) {
        await browser.close().catch(() => {});
      }
      reject(err);
    }
  });
};

module.exports.create = create;
