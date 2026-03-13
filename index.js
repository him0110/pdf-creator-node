"use strict";
/**
 * @author Shyam Hajare <hajareshyam@gmail.com>
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * create function is used to create pdf from handlebar templates.
 * @param  {document, options}
 * @return {callback}
 */
const handlebars_1 = __importDefault(require("handlebars"));
const puppeteer_1 = __importDefault(require("puppeteer"));
const stream_1 = require("stream");
const fs = __importStar(require("fs"));
handlebars_1.default.registerHelper("ifCond", function (v1, operator, v2, options) {
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
});
/**
 * Converts an html-pdf style `border` value into a Puppeteer margin object.
 * Supports:
 *   - string shorthand  →  "10mm"  (applied to all four sides)
 *   - object            →  { top, right, bottom, left }
 */
function parseBorder(border) {
    if (!border)
        return undefined;
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
function processTemplate(template) {
    if (!template)
        return "<span></span>";
    return template
        .replace(/\{\{\s*page\s*\}\}/g, '<span class="pageNumber"></span>')
        .replace(/\{\{\s*pages\s*\}\}/g, '<span class="totalPages"></span>');
}
/**
 * Translates PdfOptions (html-pdf API shape) → Puppeteer PDFOptions.
 */
function buildPuppeteerOptions(options) {
    var _a, _b, _c, _d, _e;
    const headerContent = (_a = options.header) === null || _a === void 0 ? void 0 : _a.contents;
    const footerRaw = (_b = options.footer) === null || _b === void 0 ? void 0 : _b.contents;
    const footerContent = typeof footerRaw === "string" ? footerRaw : footerRaw === null || footerRaw === void 0 ? void 0 : footerRaw.default;
    const hasHeader = !!headerContent;
    const hasFooter = !!footerContent;
    const margin = parseBorder(options.border) || {};
    if ((_c = options.header) === null || _c === void 0 ? void 0 : _c.height) {
        margin.top = options.header.height;
    }
    if ((_d = options.footer) === null || _d === void 0 ? void 0 : _d.height) {
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
        printBackground: (_e = options.printBackground) !== null && _e !== void 0 ? _e : true,
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
const create = function (document, options) {
    return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
        var _a;
        if (!document || !document.html || !document.data) {
            return reject(new Error("Some, or all, options are missing."));
        }
        let browser;
        try {
            // Compile Handlebars template with the provided data
            const html = handlebars_1.default.compile(document.html)(document.data);
            browser = yield puppeteer_1.default.launch({
                headless: true,
                args: ["--no-sandbox", "--disable-setuid-sandbox"],
            });
            const page = yield browser.newPage();
            // Set the base URL so relative resources (images, CSS) resolve correctly
            yield page.setContent(html, Object.assign({ waitUntil: "networkidle0" }, (options.base ? { timeout: (_a = options.timeout) !== null && _a !== void 0 ? _a : 30000 } : {})));
            const pdfBuffer = yield page.pdf(buildPuppeteerOptions(options));
            switch (document.type) {
                case "buffer":
                    resolve(pdfBuffer);
                    break;
                case "stream": {
                    const readable = new stream_1.Readable();
                    readable.push(pdfBuffer);
                    readable.push(null);
                    resolve(readable);
                    break;
                }
                default: {
                    // "" or "file"  →  write to disk
                    const filePath = document.path;
                    fs.writeFile(filePath, pdfBuffer, (err) => {
                        if (err)
                            reject(err);
                        else
                            resolve({ filename: filePath });
                    });
                    break;
                }
            }
        }
        catch (err) {
            reject(err);
        }
        finally {
            if (browser)
                yield browser.close();
        }
    }));
};
module.exports.create = create;
