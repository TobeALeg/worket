import { createHash } from "node:crypto";
import { inflateSync } from "node:zlib";
import { ContractError, ensure } from "./definition.js";

export const REPORT_LIMITS = {
  text: 4000, images: 3, imageBytes: 5 * 1024 * 1024, pixels: 16_000_000,
  logBytes: 2 * 1024 * 1024, totalBytes: 18 * 1024 * 1024, wireBytes: 25 * 1024 * 1024,
  localBytes: 50 * 1024 * 1024, logStorageBytes: 20 * 1024 * 1024,
  localTtl: 7 * 86400_000, reportTtl: 30 * 86400_000, windowMs: 600_000,
  maxAttempts: 10, deviceDaily: 20, globalDaily: 500, deviceDailyBytes: 50 * 1024 * 1024, globalDailyBytes: 500 * 1024 * 1024,
} as const;
export const REPORT_STATES = ["待排查", "排查中", "待补充", "已解决"] as const;
export type ReportState = typeof REPORT_STATES[number];
export const DIAGNOSTIC_ACTIONS = ["app", "renderer", "connection", "record", "sync", "handoff", "distillation", "update", "feedback"] as const;
export const DIAGNOSTIC_CODES = ["OPERATION_FAILED","RENDERER_ERROR","RENDERER_EXIT","RENDERER_UNRESPONSIVE","UNCAUGHT_EXCEPTION","SERVICE_REQUEST_FAILED","AUTH_REQUIRED","AUTH_EXPIRED","AUTH_CHANGED","SERVICE_UPGRADE_REQUIRED","REPORT_NETWORK_UNAVAILABLE","REPORT_RATE_LIMITED","INVALID_RECEIPT","REPORT_STORAGE_FULL","REPORT_STORAGE_UNAVAILABLE","INVALID_INPUT","INPUT_TOO_LARGE","INVALID_IMAGE","MODEL_UNAVAILABLE","MODEL_TIMEOUT","INVALID_MODEL_OUTPUT","MATERIAL_UNAVAILABLE","SERVICE_INTERRUPTED"] as const;
export type DiagnosticAction = typeof DIAGNOSTIC_ACTIONS[number];
export type DiagnosticEvent = { at: string; traceId: string; action: DiagnosticAction; phase: "start" | "complete" | "failed" | "pending" | "selected" | "open-requested" | "preparing" | "prepared" | "opening"; code?: string; elapsedMs?: number; requestId?: string; executor?: "codex" | "workbuddy"; count?: number };
export type DiagnosticSnapshot = { from: string; to: string; events: DiagnosticEvent[]; truncated: boolean; previousExit: boolean };
export type ReportImage = { id: string; mime: "image/png"; data: string; bytes: number; sha256: string; width: number; height: number };
export type ProblemReport = { schemaVersion: 1; reportId: string; occurredAt: string; submittedAt: string; description: string; environment: { version: string; platform: string; arch: string }; screenshots: ReportImage[]; diagnostics: DiagnosticSnapshot | null; authorization: { scopeVersion: 1; diagnostics: boolean } };
export type ReportEnvelope = { report: ProblemReport; sha256: string };
export type ReportReceipt = { reportId: string; sha256: string; receivedAt: string };
export const reportJSON = (value: unknown): string => {
  if (Array.isArray(value)) return `[${value.map(reportJSON).join(",")}]`;
  if (value && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${reportJSON(v)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
};
export const reportHash = (value: unknown) => createHash("sha256").update(Buffer.isBuffer(value) ? value : reportJSON(value)).digest("hex");
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
function keys(value: unknown, allowed: string[]): asserts value is Record<string, any> {
  ensure(record(value) && Object.keys(value).every(k => allowed.includes(k)), "INVALID_INPUT");
}
const text = (v: unknown, max: number) => typeof v === "string" && v.length <= max;
const time = (v: unknown) => typeof v === "string" && /^\d{4}-\d\d-\d\dT/.test(v) && Number.isFinite(Date.parse(v));
export function validateEvent(value: unknown): asserts value is DiagnosticEvent {
  keys(value, ["at", "traceId", "action", "phase", "code", "elapsedMs", "requestId", "executor", "count"]);
  ensure(time(value.at) && /^[a-f0-9-]{36}$/.test(value.traceId) && DIAGNOSTIC_ACTIONS.includes(value.action), "INVALID_INPUT");
  ensure(["start", "complete", "failed", "pending", "selected", "open-requested", "preparing", "prepared", "opening"].includes(value.phase), "INVALID_INPUT");
  // Free text, error messages and paths never enter diagnostic events.
  if (value.code !== undefined) ensure(typeof value.code === "string" && (DIAGNOSTIC_CODES as readonly string[]).includes(value.code), "INVALID_INPUT");
  if (value.requestId !== undefined) ensure(typeof value.requestId === "string" && /^[a-f0-9-]{36}$/.test(value.requestId), "INVALID_INPUT");
  if (value.executor !== undefined) ensure(["codex", "workbuddy"].includes(value.executor), "INVALID_INPUT");
  for (const field of ["elapsedMs", "count"]) if (value[field] !== undefined) ensure(Number.isSafeInteger(value[field]) && value[field] >= 0 && value[field] <= 1e9, "INVALID_INPUT");
}
export function validateSnapshot(value: unknown): asserts value is DiagnosticSnapshot {
  keys(value, ["from", "to", "events", "truncated", "previousExit"]);
  ensure(time(value.from) && time(value.to) && Date.parse(value.from) <= Date.parse(value.to) && typeof value.truncated === "boolean" && typeof value.previousExit === "boolean", "INVALID_INPUT");
  ensure(Array.isArray(value.events) && value.events.length <= 10000 && Buffer.byteLength(JSON.stringify(value)) <= REPORT_LIMITS.logBytes, "INPUT_TOO_LARGE");
  for (const event of value.events) { validateEvent(event); ensure(event.at >= value.from && event.at <= value.to, "INVALID_INPUT"); }
}
function crc32(bytes: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of bytes) { crc ^= byte; for (let i=0;i<8;i++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
  return (crc ^ 0xffffffff) >>> 0;
}
// Desktop re-encodes all selected JPEG/PNG files to PNG. Validate its canonical pixels,
// not filenames/MIME hints. Metadata chunks are rejected rather than retained on the server.
export function pngDimensions(bytes: Buffer): {width: number; height: number} {
  ensure(bytes.length <= REPORT_LIMITS.imageBytes && bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a", "hex")), "INVALID_IMAGE");
  let offset=8, width=0, height=0, color=0, header=false, ended=false, dataEnded=false;
  const compressed: Buffer[]=[];
  while (offset+12 <= bytes.length) {
    const size=bytes.readUInt32BE(offset), end=offset+12+size;
    ensure(end <= bytes.length, "INVALID_IMAGE");
    const type=bytes.toString("ascii", offset+4, offset+8), data=bytes.subarray(offset+8, end-4);
    ensure(crc32(bytes.subarray(offset+4,end-4)) === bytes.readUInt32BE(end-4), "INVALID_IMAGE");
    if (type === "IHDR") {
      ensure(!header && offset === 8 && size === 13, "INVALID_IMAGE"); header=true;
      width=data.readUInt32BE(0); height=data.readUInt32BE(4); color=data[9]!;
      ensure(width > 0 && height > 0 && width <= 8192 && height <= 8192 && width*height <= REPORT_LIMITS.pixels && data[8] === 8 && [2,6].includes(color) && data[10] === 0 && data[11] === 0 && data[12] === 0, "INVALID_IMAGE");
    } else if (type === "IDAT") { ensure(header && !dataEnded, "INVALID_IMAGE"); compressed.push(data); }
    else if (type === "IEND") { ensure(size === 0 && compressed.length > 0 && end === bytes.length, "INVALID_IMAGE"); ended=true; }
    else { const sizes:Record<string,number>={sRGB:1,gAMA:4,cHRM:32,pHYs:9}; ensure(sizes[type]===size && header && !compressed.length, "INVALID_IMAGE"); if(type === "sRGB")ensure(data[0]!<=3,"INVALID_IMAGE"); }
    if (compressed.length && type !== "IDAT") dataEnded=true;
    offset=end;
  }
  ensure(ended && offset === bytes.length, "INVALID_IMAGE");
  const stride=width*(color === 6 ? 4 : 3)+1;
  let pixels: Buffer;
  try { pixels=inflateSync(Buffer.concat(compressed), {maxOutputLength: stride*height}); } catch { throw new ContractError("INVALID_IMAGE"); }
  ensure(pixels.length === stride*height, "INVALID_IMAGE");
  for (let y=0;y<height;y++) ensure(pixels[y*stride]! <= 4, "INVALID_IMAGE");
  return {width,height};
}
export function validateImage(value: unknown): asserts value is ReportImage {
  keys(value,["id","mime","data","bytes","sha256","width","height"]);
  ensure(typeof value.id === "string" && /^[a-f0-9-]{36}$/.test(value.id) && value.mime === "image/png" && text(value.data, Math.ceil(REPORT_LIMITS.imageBytes/3)*4) && /^[A-Za-z0-9+/]*={0,2}$/.test(value.data), "INVALID_IMAGE");
  const bytes=Buffer.from(value.data,"base64");
  ensure(bytes.toString("base64") === value.data && bytes.length === value.bytes && reportHash(bytes) === value.sha256, "INVALID_IMAGE");
  const dimensions=pngDimensions(bytes);
  ensure(dimensions.width === value.width && dimensions.height === value.height, "INVALID_IMAGE");
}
export function validateEnvelope(value: unknown): asserts value is ReportEnvelope {
  keys(value,["report","sha256"]); keys(value.report,["schemaVersion","reportId","occurredAt","submittedAt","description","environment","screenshots","diagnostics","authorization"]);
  const r=value.report;
  ensure(r.schemaVersion === 1 && typeof r.reportId === "string" && /^[a-f0-9-]{36}$/.test(r.reportId) && time(r.occurredAt) && time(r.submittedAt) && text(r.description, REPORT_LIMITS.text), "INVALID_INPUT");
  keys(r.environment,["version","platform","arch"]);
  ensure(typeof r.environment.version === "string" && /^[0-9a-zA-Z.+-]{1,40}$/.test(r.environment.version) && ["darwin","win32","linux"].includes(r.environment.platform) && ["arm64","x64","ia32"].includes(r.environment.arch), "INVALID_INPUT");
  keys(r.authorization,["scopeVersion","diagnostics"]);
  ensure(r.authorization.scopeVersion === 1 && typeof r.authorization.diagnostics === "boolean", "INVALID_INPUT");
  ensure(Array.isArray(r.screenshots) && r.screenshots.length <= REPORT_LIMITS.images, "INPUT_TOO_LARGE");
  const ids=new Set(); for (const image of r.screenshots) { validateImage(image); ensure(!ids.has(image.id),"INVALID_INPUT"); ids.add(image.id); }
  ensure(r.description.trim() || r.screenshots.length, "INVALID_INPUT");
  ensure(r.authorization.diagnostics === (r.diagnostics !== null), "INVALID_INPUT");
  if (r.diagnostics !== null) validateSnapshot(r.diagnostics);
  ensure(Buffer.byteLength(JSON.stringify({...r, screenshots:[]})) + r.screenshots.reduce((sum:number, i:ReportImage)=>sum+i.bytes,0) <= REPORT_LIMITS.totalBytes, "INPUT_TOO_LARGE");
  ensure(typeof value.sha256 === "string" && value.sha256 === reportHash(r), "IDEMPOTENCY_CONFLICT");
}
