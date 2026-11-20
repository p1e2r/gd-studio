// Fake boomlings server for tests. Records requests so tests can check encoding + headers.
import http from "node:http";
import zlib from "node:zlib";

const b64 = (s) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
const levelRaw = "kS38,1_40_2_125_3_255_11_255_12_255_13_255_4_-1_6_1000_7_1_15_1_18_0_8_1|,kA2,0,kA4,0;1,1,2,15,3,15;1,8,2,105,3,15;1,1,2,195,3,45,21,1;1,901,2,300,3,105,51,1,28,30,10,0.5;";
const levelData = b64(zlib.gzipSync(levelRaw));
const lvl = (id, name) => `1:${id}:2:${name}:5:1:6:16:8:10:9:40:10:123456:12:0:13:22:14:999:17:0:43:0:25:0:18:7:19:1:42:1:45:4:3:${b64("A cool level")}:15:2:30:0:31:0:37:1:38:1:39:7:46:0:47:0:35:546561`;

export const requests = [];
export function start(port = 4999) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const params = Object.fromEntries(new URLSearchParams(body));
      requests.push({ url: req.url, headers: req.headers, params });
      const ep = req.url.split("/").pop();
      const send = (s) => { res.writeHead(200, { "Content-Type": "text/html" }); res.end(s); };
      switch (ep) {
        case "getGJLevels21.php":
          if (params.str === "nothing") return send("-1");
          return send(`${lvl(128, "Bloodbath")}|${lvl(4284013, "Test Level")}#16:RobTop:71#1~|~546561~|~2~|~Cool Song~|~3~|~1~|~4~|~Artist~|~5~|~5.2~|~10~|~https%3A%2F%2Fexample.com%2Fs.mp3#9999:0:10#hash`);
        case "downloadGJLevel22.php":
          return send(`${lvl(params.levelID < 0 ? 777 : params.levelID, "Bloodbath")}:4:${levelData}:27:${b64(String.fromCharCode(..."1".split("").map((c, i) => c.charCodeAt(0) ^ "26364".charCodeAt(i))))}#hash#seed`);
        case "getGJUsers20.php": return send("1:RobTop:2:16:13:149:17:0:6::9:1:10:0:11:3:14:0:15:0:16:71:3:500:8:0:4:10:46:100#1:0:10");
        case "getGJUserInfo20.php": return send("1:RobTop:2:16:13:149:17:0:10:0:11:3:51:12:3:500:46:100:4:10:8:30:18:0:19:0:50:0:20::21:2:22:3:23:1:24:1:25:1:26:1:28:1:43:1:48:1:53:1:54:1:30:1:16:71:31:0:44::45::49:2:29:1:52:20");
        case "getGJComments21.php": return send(`2~${b64("Nice level!")}~3~16~4~42~7~0~10~88~9~2 days~6~1:1~RobTop~9~1~10~0~11~3~14~0~15~2~16~71#1:0:20`);
        case "getGJAccountComments20.php": return send(`2~${b64("Hello profile")}~4~5~9~1 day~6~9#1:0:10`);
        case "getGJScores20.php": return send("1:Player1:2:1:13:149:17:500:6:1:9:3:10:4:11:5:14:0:15:0:16:11:3:40000:8:0:46:1000:4:300:52:500|1:Player2:2:2:13:149:17:500:6:2:9:3:10:4:11:5:14:0:15:0:16:12:3:39000:8:0:46:1000:4:290:52:400");
        case "getGJMapPacks21.php": return send("1:1:2:Pack One:3:1,2,3:4:4:5:1:6:2:7:255,0,0:17:255,0,0#30:0:10#hash");
        case "getGJGauntlets21.php": return send("1:1:3:1,2,3,4,5|1:2:3:6,7,8,9,10#hash");
        case "loginGJAccount.php": return send(params.gjp2 ? "71,16" : "-1");
        case "uploadGJComment21.php": return send(params.chk ? "123" : "-1");
        case "uploadGJLevel21.php": return send(params.seed2 && params.levelString ? "99999" : "-1");
        default: return send("-1");
      }
    });
  });
  server.listen(port);
  return server;
}

if (process.argv[1]?.endsWith("mock-gd-server.mjs")) { start(+process.argv[2] || 4999); console.log("mock GD on", +process.argv[2] || 4999); }
