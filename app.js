"use strict";
const $ = id => document.getElementById(id);
const cam = $("cam"), ov = $("ov"), ctx = ov.getContext("2d");
const { buildSpeech, tok, fmt } = LaoNum;

let cfg = { labels: ["1000","2000","5000","10000","20000","50000","100000"], inputSize: 416, minConfidence: 0.75, iou: 0.5 };
let model = null, stream = null;
let hist = [], lastSig = null, emptyN = 0, lastStableAt = 0, speakId = 0, lastSpeech = null;
const player = new Audio();
const clipOk = {};

const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const synth = typeof speechSynthesis !== "undefined" ? speechSynthesis : null;
const hasLaoVoice = () => !!synth && synth.getVoices().some(v => v.lang.toLowerCase().startsWith("lo"));

/* ---------- Speech: recorded Lao words -> Lao phone voice -> English ---------- */
function say(text, lang, id) {
  return new Promise(res => {
    if (!synth) return res();
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = 0.95;
      const v = synth.getVoices().find(x => x.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      if (v) u.voice = v;
      u.onend = res; u.onerror = res;
      synth.speak(u);
    } catch (e) { res(); }
  });
}

async function clipExists(key) {
  if (key in clipOk) return clipOk[key];
  try {
    const r = await fetch(`/audio/${key}.mp3`, { method: "HEAD" });
    clipOk[key] = r.ok && (r.headers.get("content-type") || "").includes("audio");
  } catch (e) { clipOk[key] = false; }
  return clipOk[key];
}

function playClip(key) {
  return new Promise(res => {
    player.onended = res; player.onerror = res;
    player.src = `/audio/${key}.mp3`;
    player.play().catch(res);
  });
}

async function speak(sp) {
  const id = ++speakId;
  lastSpeech = sp;
  if (synth) synth.cancel();
  player.pause();
  buzz(sp.count > 1 ? [150, 80, 150] : 250);
  const oks = await Promise.all(sp.tokens.map(t => clipExists(t.key)));
  if (id !== speakId) return;
  if (oks.every(Boolean)) {
    for (const t of sp.tokens) { if (id !== speakId) return; await playClip(t.key); }
  } else if (hasLaoVoice()) {
    await say(sp.lao, "lo-LA", id);
  } else {
    await say(sp.en, "en-US", id);
  }
}

async function speakWord(key) {
  const sp = { tokens: [tok(key)], lao: tok(key).lao, en: key === "try_again" ? "Please try again" : "Ready", count: 1 };
  const id = ++speakId;
  if (synth) synth.cancel();
  if (await clipExists(key)) await playClip(key);
  else if (hasLaoVoice()) await say(sp.lao, "lo-LA", id);
  else await say(sp.en, "en-US", id);
}

/* ---------- Detection ---------- */
async function detect() {
  const S = cfg.inputSize, vw = cam.videoWidth, vh = cam.videoHeight;
  const scale = Math.min(S / vw, S / vh);
  const nw = Math.round(vw * scale), nh = Math.round(vh * scale);
  const px = Math.floor((S - nw) / 2), py = Math.floor((S - nh) / 2);

  const out = tf.tidy(() => {
    let img = tf.browser.fromPixels(cam).toFloat().div(255);
    img = tf.image.resizeBilinear(img, [nh, nw]);
    img = tf.pad(img, [[py, S - nh - py], [px, S - nw - px], [0, 0]], 114 / 255);
    return model.predict(img.expandDims(0));
  });
  const t = Array.isArray(out) ? out[0] : out;
  const data = await t.data(), shape = t.shape;
  tf.dispose(out);

  const nc = cfg.labels.length;
  const layout = shape[1] === 4 + nc ? "channel" : "anchor";
  const N = layout === "channel" ? shape[2] : shape[1];
  const boxes = Detect.decode(data, nc, N, S, cfg.minConfidence, cfg.iou, layout);
  return boxes.map(b => ({
    x1: Math.max(0, (b.x1 - px) / scale), y1: Math.max(0, (b.y1 - py) / scale),
    x2: Math.min(vw, (b.x2 - px) / scale), y2: Math.min(vh, (b.y2 - py) / scale),
    score: b.score, value: Number(cfg.labels[b.cls])
  }));
}

function draw(dets) {
  const cw = ov.clientWidth, ch = ov.clientHeight;
  if (ov.width !== cw || ov.height !== ch) { ov.width = cw; ov.height = ch; }
  ctx.clearRect(0, 0, cw, ch);
  const vw = cam.videoWidth, vh = cam.videoHeight;
  const s = Math.max(cw / vw, ch / vh), ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  ctx.lineWidth = 4; ctx.strokeStyle = "#4ade80"; ctx.fillStyle = "#4ade80"; ctx.font = "bold 22px system-ui";
  for (const d of dets) {
    const x = d.x1 * s + ox, y = d.y1 * s + oy;
    ctx.strokeRect(x, y, (d.x2 - d.x1) * s, (d.y2 - d.y1) * s);
    ctx.fillText(fmt(d.value), x + 6, y + 24);
  }
}

/* ---------- UI + automatic announcing ---------- */
function showResult(sp) {
  $("panel").hidden = false;
  $("count").textContent = sp.count > 1 ? sp.count + " ໃບ · " + sp.count + " notes" : "1 ໃບ · 1 note";
  $("total").textContent = fmt(sp.sum) + " ກີບ";
  $("totalEn").textContent = fmt(sp.sum) + " Kip";
}

function clearResult() { $("panel").hidden = true; }

function handle(values) {
  const sig = values.slice().sort((a, b) => a - b).join(",");
  const now = performance.now();
  hist.push(sig); if (hist.length > 6) hist.shift();

  if (sig === "") {
    if (++emptyN >= 8) { emptyN = 0; if (lastSig !== null) { lastSig = null; clearResult(); } lastStableAt = now; }
    $("status").textContent = lastSig ? $("status").textContent : "ວາງເງິນໃຫ້ກ້ອງເຫັນ · Show the money";
    return;
  }
  emptyN = 0;
  const stable = hist.length >= 3 && hist.slice(-3).every(s => s === sig);
  if (stable) {
    lastStableAt = now;
    if (sig !== lastSig) {            // new set of notes -> say it immediately
      lastSig = sig;
      const sp = buildSpeech(values);
      showResult(sp); speak(sp);
      $("status").textContent = "ລະບຸເງິນແລ້ວ · Detected";
    }
  } else if (now - lastStableAt > 4000) {   // can't settle on an answer -> never guess
    lastStableAt = now;
    buzz([0, 100, 100, 100]); speakWord("try_again");
  }
}

async function loop() {
  while (stream) {
    const t0 = performance.now();
    try {
      if (model && cam.videoWidth && !document.hidden) {
        const dets = await detect();
        draw(dets);
        handle(dets.map(d => d.value));
      }
    } catch (e) { console.error(e); }
    await sleep(Math.max(0, 120 - (performance.now() - t0)));
  }
}

/* ---------- Demo (no model yet) ---------- */
function simulate() {
  const all = [1000, 2000, 5000, 10000, 20000, 50000, 100000];
  const n = 1 + Math.floor(Math.random() * 3);
  const values = Array.from({ length: n }, () => all[Math.floor(Math.random() * all.length)]);
  lastSig = values.join(",");
  const sp = buildSpeech(values);
  showResult(sp); speak(sp);
}

/* ---------- Start-up ---------- */
async function loadModel() {
  try { Object.assign(cfg, await (await fetch("/model/labels.json")).json()); } catch (e) {}
  try {
    await tf.ready();
    model = await tf.loadGraphModel("/model/model.json");
    tf.dispose(model.predict(tf.zeros([1, cfg.inputSize, cfg.inputSize, 3])));
    $("status").textContent = "ພ້ອມແລ້ວ · Ready";
  } catch (e) {
    model = null;
    $("status").textContent = "Demo mode: no model yet";
    $("demo").hidden = false;
  }
}

let torchOn = false;
function setupTorch() {
  try {
    const track = stream.getVideoTracks()[0];
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    if (!caps.torch) return;                       // e.g. iPhone Safari: no light control
    const btn = $("light");
    btn.hidden = false;
    btn.onclick = async () => {
      torchOn = !torchOn;
      try { await track.applyConstraints({ advanced: [{ torch: torchOn }] }); }
      catch (e) { torchOn = !torchOn; return; }
      btn.textContent = torchOn ? "🔦 ON" : "🔦 OFF";
      btn.classList.toggle("on", torchOn);
      buzz(80);
      if (hasLaoVoice()) say(torchOn ? "ເປີດໄຟ" : "ປິດໄຟ", "lo-LA");
      else say(torchOn ? "Light on" : "Light off", "en-US");
    };
  } catch (e) {}
}

async function start() {
  player.src = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";
  player.play().catch(() => {});                          // unlocks sound on iPhone
  if (synth) synth.speak(new SpeechSynthesisUtterance("")); // unlocks speech on iPhone
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    cam.srcObject = stream; await cam.play();
  } catch (e) {
    $("status").textContent = "ບໍ່ສາມາດເປີດກ້ອງ · Camera not available";
    $("start").hidden = true; $("demo").hidden = false; return;
  }
  $("start").hidden = true; $("tap").hidden = false;
  setupTorch();
  speakWord("ready");
  loop();
}

$("start").onclick = start;
$("demo").onclick = simulate;
$("tap").onclick = () => { if (lastSpeech) speak(lastSpeech); };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
loadModel();
