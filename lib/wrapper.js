import {Readable} from "node:stream";
import {Buffer} from "node:buffer";
import qs from "node:querystring";
import Busboy from "busboy";
import {print} from "./utility.js";

export function wrapper(func,type) {
  type = type.toUpperCase();
  return async (...args) => {
    if (type === "HONO") {
      const headers = args[0].req.header(); // returns lowercase headers
      let body;
      
      // Check if Content-Type header exists before trying to use it
      if (headers["content-type"]) {
        const mainType = headers["content-type"].split(';')[0].trim();
        
        switch (mainType) {
          case "application/x-www-form-urlencoded":
            body = await args[0].req.parseBody();
            break;
          case "application/json":
            body = await args[0].req.json();
            break;
          case "multipart/form-data":
            // Existing multipart/form-data handling...
            if (args[0].req.raw.body instanceof ReadableStream) {
              const bodyStream = Readable.fromWeb(args[0].req.raw.body);
              body = await streamToBuffer(bodyStream);
            } else body = Buffer.from(args[0].req.raw.body, isBase64(args[0].req.raw.body) ? "base64" : "utf8");
            const { fields, files } = await parseFormData(body, headers["content-type"]);
            body = {fields, files};
            break;
        }
      }
      
      
      if (body) print(body);
      // If body is nonexistant, get query parameters
      else body = args[0].req.query();

      let resp = await func(body);
      
      if (!resp || typeof resp !== "object") resp = {msg:undefined,code:undefined,type:undefined};
      
      if (!resp.msg.length) resp.msg = "No content specified!";
      if (!resp.code || resp.code < 100 || resp.code > 599) resp.msg = 500;
      
      
      if (resp.type) {
        // Send JSON response back as a string
        if (resp.type === "application/json") resp.msg = JSON.stringify(resp.msg);
      }
      else resp.type = "plain/text";

      print(resp.msg);
    
      return args[0].body(resp.msg, resp.code,
      {
        "Content-Type": resp.type
      });
    }
  };
}

// Helper to parse multipart data
function parseFormData (bodyBuffer, contentType) {
  return new Promise((resolve, reject) => {
    const busboy = Busboy({ headers: { "content-type": contentType } });
    const fields = {};
    const files = [];
  
    busboy.on("file", (name, file, info) => {
      const chunks = [];
      file.on("data", (data) => chunks.push(data));
      file.on("end", () => {
        files.push({
          filename: info.filename,
          contentType: info.mimeType,
          content: Buffer.concat(chunks)
        });
      });
    });
  
    busboy.on("field", (name, value) => {
      fields[name] = fields[name] || [];
      fields[name].push(value);
    });
  
    busboy.on("finish", () => resolve({ fields, files }));
    busboy.on("error", reject);
    busboy.end(bodyBuffer);
  });
}

// Converts ReadableStreams into Buffers
async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function isBase64(str) {
  if (str.length % 4 !== 0) return false;
  
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(str)) return false;
  
  try {
    const decoded = atob(str);
    if (/^[\x20-\x7E]*$/.test(decoded)) return true;
  } catch (e) {
    return false;
  }
  return false;
}