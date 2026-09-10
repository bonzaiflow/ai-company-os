import type http from "node:http";

export function json(res: http.ServerResponse, data: unknown, status = 200): void {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data));
}

export function readBody(req: http.IncomingMessage): Promise<any> {
  return new Promise((resolve, reject) => {
    let buf = "";
    req.on("data", (d) => {
      buf += d;
      if (buf.length > 20_000_000) reject(new Error("body too large"));
    });
    req.on("end", () => {
      try {
        resolve(buf ? JSON.parse(buf) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}
