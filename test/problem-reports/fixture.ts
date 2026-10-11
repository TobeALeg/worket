import { randomUUID } from "node:crypto";
import { deflateSync } from "node:zlib";
import { reportHash, type ProblemReport, type ReportEnvelope } from "../../dist/contracts/problem-report.js";
function chunk(type:string,data:Buffer) {
  const tag=Buffer.from(type), payload=Buffer.concat([tag,data]);let crc=0xffffffff;
  for(const byte of payload){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const bytes=Buffer.alloc(data.length+12);bytes.writeUInt32BE(data.length);payload.copy(bytes,4);bytes.writeUInt32BE((crc^0xffffffff)>>>0,bytes.length-4);return bytes;
}
export function png() {
  const header=Buffer.alloc(13);header.writeUInt32BE(2);header.writeUInt32BE(2,4);header[8]=8;header[9]=6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a','hex'),chunk('IHDR',header),chunk('IDAT',deflateSync(Buffer.from([0,255,0,0,255,0,255,0,255,0,0,0,255,255,255,255,255,255]))),chunk('IEND',Buffer.alloc(0))]);
}
export function envelope(withLogs=true):ReportEnvelope {
  const bytes=png(),at=new Date().toISOString();
  const report:ProblemReport={schemaVersion:1,reportId:randomUUID(),occurredAt:at,submittedAt:at,description:'点击交接后执行者没有打开',environment:{version:'0.1.8',platform:'darwin',arch:'arm64'},screenshots:[{id:randomUUID(),mime:'image/png',data:bytes.toString('base64'),bytes:bytes.length,sha256:reportHash(bytes),width:2,height:2}],diagnostics:withLogs ? {from:at,to:at,events:[{at,action:'handoff',phase:'pending',traceId:randomUUID()}],truncated:false,previousExit:false} : null,authorization:{scopeVersion:1,diagnostics:withLogs}};
  return {report,sha256:reportHash(report)};
}
