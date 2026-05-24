import { createReadStream, existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { networkInterfaces } from "node:os";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import selfsigned from "selfsigned";
import { WebSocketServer } from "ws";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const rootDir = resolve(__dirname, "..");
const distDir = join(rootDir, "dist");
const port = Number(process.env.PORT || 8787);
const useHttps = process.env.HTTPS !== "0";
const rooms = new Map();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const requestHandler = (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  const requested = safePath === "/" ? "index.html" : safePath.slice(1);
  const filePath = resolve(distDir, requested);
  const targetPath = filePath.startsWith(distDir) && existsSync(filePath) ? filePath : join(distDir, "index.html");

  if (!existsSync(targetPath)) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Run npm run build before starting the room server.");
    return;
  }

  res.writeHead(200, {
    "content-type": mimeTypes[extname(targetPath)] || "application/octet-stream",
    "cache-control": targetPath.endsWith("index.html") ? "no-cache" : "public, max-age=31536000",
  });
  createReadStream(targetPath).pipe(res);
};

const server = useHttps ? createHttpsServer(await createCertificate(), requestHandler) : createHttpServer(requestHandler);

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  ws.id = cryptoId();
  ws.roomCode = null;
  ws.role = null;

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(String(raw));
    } catch {
      send(ws, { type: "error", message: "That room message was not valid." });
      return;
    }

    if (message.type === "createRoom") createRoom(ws);
    if (message.type === "joinRoom") joinRoom(ws, message.roomCode);
    if (message.type === "submit") submitChoice(ws, message.direction);
    if (message.type === "resetRound") resetRoomRound(ws);
    if (message.type === "resetGame") resetRoomGame(ws);
    if (message.type === "leaveRoom") leaveRoom(ws);
  });

  ws.on("close", () => leaveRoom(ws));
  send(ws, { type: "connected", playerId: ws.id });
});

server.listen(port, "0.0.0.0", async () => {
  const urls = localUrls(port, useHttps ? "https" : "http");
  const hasDist = existsSync(distDir) && (await readdir(distDir).catch(() => [])).length > 0;
  console.log(`JitSwipe room server listening on port ${port}`);
  if (useHttps) console.log("Using local HTTPS for phone camera permission. Accept the certificate warning on each phone.");
  if (!hasDist) console.log("No dist build found yet. Run npm run build first.");
  urls.forEach((url) => console.log(`  ${url}`));
});

async function createCertificate() {
  const altNames = [
    { type: 2, value: "localhost" },
    { type: 7, ip: "127.0.0.1" },
    ...localAddresses().map((ip) => ({ type: 7, ip })),
  ];
  const pems = await selfsigned.generate(
    [{ name: "commonName", value: "JitSwipe Local" }],
    {
      algorithm: "sha256",
      days: 30,
      keySize: 2048,
      extensions: [{ name: "subjectAltName", altNames }],
    },
  );
  return { key: pems.private, cert: pems.cert };
}

function createRoom(ws) {
  leaveRoom(ws);
  const room = newRoom();
  room.players.pointer = ws;
  ws.roomCode = room.code;
  ws.role = "pointer";
  rooms.set(room.code, room);
  sendRoomState(room);
}

function joinRoom(ws, rawCode) {
  const code = normalizeCode(rawCode);
  const room = rooms.get(code);

  if (!room) {
    send(ws, { type: "error", message: "Room not found." });
    return;
  }

  const openRole = !room.players.looker ? "looker" : !room.players.pointer ? "pointer" : null;
  if (!openRole) {
    send(ws, { type: "error", message: "That room is full." });
    return;
  }

  leaveRoom(ws);
  room.players[openRole] = ws;
  ws.roomCode = code;
  ws.role = openRole;
  sendRoomState(room);
}

function leaveRoom(ws) {
  if (!ws.roomCode) return;

  const room = rooms.get(ws.roomCode);
  if (room && ws.role && room.players[ws.role] === ws) {
    room.players[ws.role] = null;
    room.choices[ws.role] = null;
    clearTimeout(room.resetTimer);
    room.phase = "input";
    if (!room.players.pointer && !room.players.looker) {
      rooms.delete(room.code);
    } else {
      sendRoomState(room);
    }
  }

  ws.roomCode = null;
  ws.role = null;
}

function submitChoice(ws, direction) {
  const room = getWsRoom(ws);
  if (!room || !DIRECTIONS.includes(direction) || room.phase !== "input" || !ws.role) return;

  room.choices[ws.role] = direction;
  if (room.choices.pointer && room.choices.looker) {
    resolveRoomRound(room);
  } else {
    sendRoomState(room);
  }
}

function resolveRoomRound(room) {
  const matched = room.choices.pointer === room.choices.looker;
  const winner = matched ? "pointer" : "looker";
  room.scores[winner] += 1;
  room.lastRound = {
    pointer: room.choices.pointer,
    looker: room.choices.looker,
    winner,
    matched,
  };
  room.phase = "reveal";
  room.roundNumber += 1;
  clearTimeout(room.resetTimer);
  sendRoomState(room);
  room.resetTimer = setTimeout(() => {
    room.choices.pointer = null;
    room.choices.looker = null;
    room.phase = "input";
    sendRoomState(room);
  }, 1250);
}

function resetRoomRound(ws) {
  const room = getWsRoom(ws);
  if (!room) return;
  room.choices.pointer = null;
  room.choices.looker = null;
  room.phase = "input";
  clearTimeout(room.resetTimer);
  sendRoomState(room);
}

function resetRoomGame(ws) {
  const room = getWsRoom(ws);
  if (!room) return;
  room.scores.pointer = 0;
  room.scores.looker = 0;
  room.roundNumber = 1;
  room.lastRound = null;
  resetRoomRound(ws);
}

function getWsRoom(ws) {
  return ws.roomCode ? rooms.get(ws.roomCode) : null;
}

function sendRoomState(room) {
  for (const role of ["pointer", "looker"]) {
    const ws = room.players[role];
    if (!ws || ws.readyState !== 1) continue;
    send(ws, {
      type: "roomState",
      playerId: ws.id,
      role,
      room: serializeRoom(room),
    });
  }
}

function serializeRoom(room) {
  const revealed = room.phase === "reveal";
  return {
    code: room.code,
    phase: room.phase,
    scores: room.scores,
    roundNumber: room.roundNumber,
    lastRound: room.lastRound,
    ready: Boolean(room.players.pointer && room.players.looker),
    players: {
      pointer: Boolean(room.players.pointer),
      looker: Boolean(room.players.looker),
    },
    choices: revealed
      ? room.choices
      : {
          pointer: Boolean(room.choices.pointer),
          looker: Boolean(room.choices.looker),
        },
  };
}

function newRoom() {
  return {
    code: uniqueRoomCode(),
    players: {
      pointer: null,
      looker: null,
    },
    scores: {
      pointer: 0,
      looker: 0,
    },
    choices: {
      pointer: null,
      looker: null,
    },
    lastRound: null,
    roundNumber: 1,
    phase: "input",
    resetTimer: null,
  };
}

function uniqueRoomCode() {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");
  } while (rooms.has(code));
  return code;
}

function normalizeCode(code) {
  return String(code || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 4);
}

function send(ws, message) {
  if (ws.readyState === 1) ws.send(JSON.stringify(message));
}

function cryptoId() {
  return Math.random().toString(36).slice(2, 10);
}

function localUrls(serverPort, protocol) {
  return [`${protocol}://localhost:${serverPort}`, ...localAddresses().map((ip) => `${protocol}://${ip}:${serverPort}`)];
}

function localAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((entry) => entry && entry.family === "IPv4" && !entry.internal)
    .map((entry) => entry.address);
}

const DIRECTIONS = ["up", "right", "down", "left"];
