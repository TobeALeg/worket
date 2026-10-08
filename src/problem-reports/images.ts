import { nativeImage } from "electron";
import { randomUUID } from "node:crypto";
import { ensure } from "../contracts/definition.js";
import { REPORT_LIMITS, pngDimensions, reportHash, type ReportImage } from "../contracts/problem-report.js";
function dimensions(bytes: Buffer): {width:number;height:number} {
  if (bytes.subarray(0,8).equals(Buffer.from("89504e470d0a1a0a","hex")) && bytes.length >= 33)
    return {width:bytes.readUInt32BE(16),height:bytes.readUInt32BE(20)};
  ensure(bytes[0] === 0xff && bytes[1] === 0xd8,"INVALID_IMAGE","请选择 PNG 或 JPG 图片");
  let i=2;
  while(i+4<bytes.length) {
    ensure(bytes[i] === 0xff,"INVALID_IMAGE");while(bytes[i] === 0xff)i++;
    const marker=bytes[i++]!; if(marker===0xda || marker===0xd9)break;
    const length=bytes.readUInt16BE(i);ensure(length>=2 && i+length<=bytes.length,"INVALID_IMAGE");
    if([0xc0,0xc1,0xc2].includes(marker)){ensure(length>=8,"INVALID_IMAGE");return {height:bytes.readUInt16BE(i+3),width:bytes.readUInt16BE(i+5)};}
    i+=length;
  }
  throw new Error("无法读取截图，请选择完整的 PNG 或 JPG 图片");
}
export function normalizeImage(input: unknown): ReportImage {
  ensure(typeof input === "string" && input.length <= Math.ceil(REPORT_LIMITS.imageBytes/3)*4 && /^[A-Za-z0-9+/]*={0,2}$/.test(input),"INPUT_TOO_LARGE","每张截图最多 5 MB");
  const bytes=Buffer.from(input,"base64"), size=dimensions(bytes);
  ensure(size.width>0 && size.height>0 && size.width<=8192 && size.height<=8192 && size.width*size.height<=REPORT_LIMITS.pixels,"INVALID_IMAGE","截图尺寸过大，请缩小后添加");
  const image=nativeImage.createFromBuffer(bytes);ensure(!image.isEmpty(),"INVALID_IMAGE","截图无法读取");
  const png=image.toPNG();const clean=pngDimensions(png);
  return {id:randomUUID(),mime:"image/png",data:png.toString("base64"),bytes:png.length,sha256:reportHash(png),...clean};
}
