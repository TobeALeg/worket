import { DatabaseSync } from "node:sqlite";
import { chmodSync, existsSync } from "node:fs";
import { REPORT_LIMITS, REPORT_STATES, validateEnvelope } from "../dist/contracts/problem-report.js";
import { ensure, ContractError } from "../dist/contracts/definition.js";

export class ProblemReportStore {
  constructor(path) {
    this.db=new DatabaseSync(path);
    if (path !== ":memory:" && existsSync(path)) chmodSync(path,0o600);
    this.db.exec(`PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS problem_reports (id TEXT NOT NULL, subject TEXT NOT NULL, device TEXT NOT NULL, digest TEXT NOT NULL, received INTEGER NOT NULL, payload TEXT, state TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', public_note TEXT NOT NULL DEFAULT '', deleted INTEGER, PRIMARY KEY(subject,id)) STRICT;
      CREATE INDEX IF NOT EXISTS problem_reports_received ON problem_reports(received);
      CREATE INDEX IF NOT EXISTS problem_reports_device ON problem_reports(device,received);`);
    if (!this.db.prepare("PRAGMA table_info(problem_reports)").all().some(column=>column.name==="bytes")) this.db.exec("ALTER TABLE problem_reports ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0");
  }
  expire() {
    const now=Date.now();
    this.db.prepare("UPDATE problem_reports SET payload=NULL,note='',public_note='',deleted=? WHERE payload IS NOT NULL AND received<?").run(now,now-REPORT_LIMITS.reportTtl);
    this.db.prepare("DELETE FROM problem_reports WHERE deleted IS NOT NULL AND deleted<?").run(now-REPORT_LIMITS.localTtl);
  }
  receive(subject,device,envelope) {
    validateEnvelope(envelope); this.expire();
    const report=envelope.report, old=this.db.prepare("SELECT * FROM problem_reports WHERE subject=? AND id=?").get(subject,report.reportId);
    if (old) {
      ensure(!old.deleted,"REPORT_DELETED"); ensure(old.digest === envelope.sha256,"IDEMPOTENCY_CONFLICT");
      return {reportId:old.id,sha256:old.digest,receivedAt:new Date(old.received).toISOString()};
    }
    const now=Date.now();
    ensure(Date.parse(report.submittedAt) >= now-REPORT_LIMITS.localTtl && Date.parse(report.submittedAt) <= now+300000,"REPORT_EXPIRED");
    ensure(this.db.prepare("SELECT COUNT(*) n FROM problem_reports WHERE device=? AND received>?").get(device,now-86400_000).n < REPORT_LIMITS.deviceDaily,"REPORT_RATE_LIMITED");
    ensure(this.db.prepare("SELECT COUNT(*) n FROM problem_reports WHERE received>?").get(now-86400_000).n < REPORT_LIMITS.globalDaily,"REPORT_RATE_LIMITED");
    const serialized=JSON.stringify(report),bytes=Buffer.byteLength(serialized);
    ensure(this.db.prepare("SELECT COALESCE(SUM(bytes),0) n FROM problem_reports WHERE device=? AND received>?").get(device,now-86400_000).n+bytes <= REPORT_LIMITS.deviceDailyBytes,"REPORT_RATE_LIMITED");
    ensure(this.db.prepare("SELECT COALESCE(SUM(bytes),0) n FROM problem_reports WHERE received>?").get(now-86400_000).n+bytes <= REPORT_LIMITS.globalDailyBytes,"REPORT_RATE_LIMITED");
    // One complete, bounded request; SQLite commits metadata and all image bytes atomically.
    this.db.prepare("INSERT INTO problem_reports(id,subject,device,digest,received,payload,state,bytes) VALUES(?,?,?,?,?,?,?,?)").run(report.reportId,subject,device,envelope.sha256,now,serialized,"待排查",bytes);
    return {reportId:report.reportId,sha256:envelope.sha256,receivedAt:new Date(now).toISOString()};
  }
  row(subject,id) { const row=this.db.prepare("SELECT * FROM problem_reports WHERE subject=? AND id=? AND payload IS NOT NULL").get(subject,id); ensure(row,"NOT_FOUND"); return row; }
  view(row,admin=false) {
    const report=JSON.parse(row.payload);
    return {reportId:row.id,receivedAt:new Date(row.received).toISOString(),state:row.state,publicNote:row.public_note,report,...(admin ? {subject:row.subject,device:row.device,note:row.note} : {})};
  }
  list(subject) {
    this.expire();
    // Remove image bytes and events inside SQLite before materializing a list.
    // A busy inbox must not load hundreds of full screenshot payloads into memory.
    const projection=`SELECT id,subject,device,digest,received,state,note,public_note,deleted,
      json_remove(payload,'$.screenshots[0].data','$.screenshots[1].data','$.screenshots[2].data','$.diagnostics.events') AS payload,
      (SELECT json_group_array(DISTINCT json_extract(event.value,'$.code')) FROM json_each(problem_reports.payload,'$.diagnostics.events') event WHERE json_extract(event.value,'$.code') IS NOT NULL) AS errors
      FROM problem_reports WHERE payload IS NOT NULL`;
    const rows=subject ? this.db.prepare(projection+" AND subject=? ORDER BY received DESC LIMIT 100").all(subject) : this.db.prepare(projection+" ORDER BY received DESC LIMIT 200").all();
    return rows.map(row=>{const view=this.view(row,!subject); return {...view,...(!subject ? {errorCodes:JSON.parse(row.errors)} : {}),report:{...view.report,diagnostics:view.report.diagnostics ? {...view.report.diagnostics,events:[]} : null}};});
  }
  get(subject,id,admin=false) {this.expire(); return this.view(this.row(subject,id),admin);}
  delete(subject,id,device="") {
    this.expire();
    // Unknown IDs need tombstones for cancelled in-flight uploads, with the same
    // daily bounds as reports. Deleting an existing report always remains allowed.
    if (!this.db.prepare("SELECT id FROM problem_reports WHERE subject=? AND id=?").get(subject,id)) {
      const day=Date.now()-86400_000;
      ensure(this.db.prepare("SELECT COUNT(*) n FROM problem_reports WHERE device=? AND received>?").get(device,day).n < REPORT_LIMITS.deviceDaily,"REPORT_RATE_LIMITED");
      ensure(this.db.prepare("SELECT COUNT(*) n FROM problem_reports WHERE received>?").get(day).n < REPORT_LIMITS.globalDaily,"REPORT_RATE_LIMITED");
    }
    this.db.prepare("INSERT INTO problem_reports(id,subject,device,digest,received,payload,state,deleted) VALUES(?,?,?,'',?,NULL,'待排查',?) ON CONFLICT(subject,id) DO UPDATE SET payload=NULL,note='',public_note='',deleted=COALESCE(deleted,excluded.deleted)").run(id,subject,device,Date.now(),Date.now());
    return {deleted:true};
  }
  review(subject,id,input) {
    this.row(subject,id);
    ensure(input && Object.keys(input).every(k=>["state","note","publicNote"].includes(k)) && REPORT_STATES.includes(input.state) && typeof input.note === "string" && input.note.length <= 4000 && typeof input.publicNote === "string" && input.publicNote.length <= 4000,"INVALID_INPUT");
    this.db.prepare("UPDATE problem_reports SET state=?,note=?,public_note=? WHERE subject=? AND id=?").run(input.state,input.note,input.publicNote,subject,id);
    return this.get(subject,id,true);
  }
  image(subject,id,imageId) {
    const image=this.get(subject,id).report.screenshots.find(i=>i.id===imageId); ensure(image,"NOT_FOUND"); return Buffer.from(image.data,"base64");
  }
  close() {this.db.close();}
}
export async function reportBody(req) {
  ensure(req.headers["content-type"]?.startsWith("application/json"),"INVALID_INPUT");
  if (req.headers["content-length"]) ensure(Number(req.headers["content-length"]) <= REPORT_LIMITS.wireBytes,"INPUT_TOO_LARGE");
  const chunks=[]; let size=0;
  for await (const chunk of req) {size+=chunk.length; ensure(size<=REPORT_LIMITS.wireBytes,"INPUT_TOO_LARGE"); chunks.push(chunk);}
  try {return JSON.parse(Buffer.concat(chunks));} catch {throw new ContractError("INVALID_INPUT");}
}
export async function reportRoute(req,res,store,subject,device,recheck) {
  if (!req.url?.startsWith("/v1/problem-reports")) return false;
  ensure(store,"NOT_FOUND");
  if (req.url === "/v1/problem-reports") {
    if (req.method === "POST") {const input=await reportBody(req); recheck(); res.end(JSON.stringify(store.receive(subject,device,input)));}
    else if (req.method === "GET") res.end(JSON.stringify({items:store.list(subject)}));
    else throw new ContractError("NOT_FOUND");
  } else {
    const match=req.url.match(/^\/v1\/problem-reports\/([a-f0-9-]{36})$/); ensure(match,"NOT_FOUND");
    if (req.method === "GET") res.end(JSON.stringify(store.get(subject,match[1])));
    else if (req.method === "DELETE") res.end(JSON.stringify(store.delete(subject,match[1],device)));
    else throw new ContractError("NOT_FOUND");
  }
  return true;
}
