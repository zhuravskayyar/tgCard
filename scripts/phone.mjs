// npm run phone — open the local game on a phone over Wi-Fi.
// Reuses a running DB/server, builds the client in watch mode and serves it on the LAN.
// Ctrl+C stops everything this script started.
import { spawn, spawnSync } from "node:child_process";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

process.env.NODE_ENV = "development"; // keep dev-only UI (demo account picker)

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "client");
const outDir = path.join(root, ".runtime", "phone-dist");
const clientPort = 4173;
const children = [];

function portOpen(port) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.setTimeout(500);
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => resolve(false));
    socket.once("timeout", () => { socket.destroy(); resolve(false); });
  });
}

async function waitForPort(port, seconds) {
  for (let i = 0; i < seconds * 4; i += 1) {
    if (await portOpen(port)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

function lanAddress() {
  const candidates = [];
  for (const [name, addresses] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|VirtualBox|VMware|Hyper-V|Loopback/i.test(name)) continue;
    for (const a of addresses ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      if (!/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) continue;
      candidates.push({ name, address: a.address });
    }
  }
  candidates.sort((a, b) => Number(/wi-?fi|wlan|бездрот/i.test(b.name)) - Number(/wi-?fi|wlan|бездрот/i.test(a.name)));
  return candidates[0]?.address;
}

function cleanup() {
  for (const child of children) {
    if (child.exitCode === null) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  }
}
process.on("SIGINT", () => { cleanup(); process.exit(0); });
process.on("exit", cleanup);

const ip = lanAddress();
if (!ip) {
  console.error("Не знайшов Wi-Fi адресу комп'ютера. Перевір, що Wi-Fi підключено.");
  process.exit(1);
}

// 1. Database
if (await portOpen(5432)) {
  console.log("✓ База вже працює");
} else {
  console.log("… Запускаю базу");
  const db = spawnSync("npm run dev:db", { cwd: root, stdio: "inherit", shell: true });
  if (db.status !== 0) process.exit(db.status ?? 1);
}

// 2. Server (any running one works: the proxy below strips Origin, so CLIENT_ORIGIN does not matter)
if (await portOpen(3000)) {
  console.log("✓ Сервер вже працює");
} else {
  console.log("… Запускаю сервер");
  const server = spawn("npm run dev:server", { cwd: root, stdio: ["ignore", "inherit", "inherit"], shell: true });
  children.push(server);
  if (!(await waitForPort(3000, 60))) {
    console.error("Сервер не запустився за 60 секунд.");
    process.exit(1);
  }
}

// 3. Client: watch build + LAN preview
const { build, preview } = await import("vite");
const stripOrigin = (target) => ({
  target,
  configure: (proxy) => proxy.on("proxyReq", (req) => req.removeHeader("origin")),
});

console.log("… Збираю клієнт (перший раз ~1 хв)");
const watcher = await build({
  root: clientRoot,
  mode: "development",
  logLevel: "warn",
  define: { "import.meta.env.VITE_API_URL": JSON.stringify("") },
  build: { outDir, emptyOutDir: true, watch: {} },
});

await new Promise((resolve, reject) => {
  let first = true;
  watcher.on("event", (event) => {
    if (event.code === "BUNDLE_END") event.result?.close();
    if (event.code === "END") {
      if (first) { first = false; resolve(); } else console.log(`↻ Клієнт перезібрано ${new Date().toLocaleTimeString()} — онови сторінку`);
    }
    if (event.code === "ERROR") {
      if (first) reject(event.error); else console.error("✗ Помилка збірки:", event.error?.message);
    }
  });
});

await preview({
  root: clientRoot,
  logLevel: "warn",
  build: { outDir },
  preview: {
    host: "0.0.0.0",
    port: clientPort,
    strictPort: true,
    proxy: { "/api": stripOrigin("http://127.0.0.1:3000"), "/card-art": stripOrigin("http://127.0.0.1:3000") },
  },
});

const url = `http://${ip}:${clientPort}`;
console.log(`
==============================================
  Відкрий у Chrome (телефон і комп'ютер):

     ${url}

  Телефон має бути в тій самій Wi-Fi.
  Зміни в коді збираються самі — просто онови сторінку.
  Зупинити: Ctrl+C
==============================================
`);

// USB phone: forward the port and open the game (works even without shared Wi-Fi)
const adb = path.join(root, ".runtime", "platform-tools", "adb.exe");
const devices = spawnSync(adb, ["devices"], { encoding: "utf8" });
if (devices.status === 0 && /\tdevice\r?$/m.test(devices.stdout)) {
  spawnSync(adb, ["reverse", `tcp:${clientPort}`, `tcp:${clientPort}`], { stdio: "ignore" });
  spawnSync(adb, ["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", `http://localhost:${clientPort}`, "com.android.chrome"], { stdio: "ignore" });
  console.log(`✓ Телефон по USB: відкрив http://localhost:${clientPort} у Chrome\n`);
}
