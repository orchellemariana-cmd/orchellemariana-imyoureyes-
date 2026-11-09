"use strict";
const $ = id => document.getElementById(id);
const cam = $("cam"), banner = $("banner"), result = $("result"), actions = $("actions");
const NOTES = ["1000","2000","5000","10000","20000","50000","100000"];
const LAO = {"1000":"ໜຶ່ງພັນກີບ","2000":"ສອງພັນກີບ","5000":"ຫ້າພັນກີບ","10000":"ໜຶ່ງໝື່ນກີບ","20000":"ສອງໝື່ນກີບ","50000":"ຫ້າໝື່ນກີບ","100000":"ໜຶ່ງແສນກີບ"};
const EN = {"1000":"one thousand","2000":"two thousand","5000":"five thousand","10000":"ten thousand","20000":"twenty thousand","50000":"fifty thousand","100000":"one hundred thousand"};
const SILENT = "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=";

let stream = null, current = null, model = null, cfg = null;
let englishToo = true, weak = 0, streak = 0, cand = null;
const player = new Audio();

try { englishToo = localStorage.getItem("en") !== "0"; } catch (e) {}

const fmt = n => n.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
const buzz = p => { try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} };
const hasLaoVoice = () => speechSynthesis.getVoices().some(v => v.lang.toLowerCase().startsWith("lo"));

function say(text, lang) {
  return new Promise(res => {
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang; u.rate = 0.9;
      const v = speechSynthesis.getVoices().find(x => x.lang.toLowerCase().startsWith(lang.slice(0, 2)));
      if (v) u.voice = v;
      u.onend = res; u.onerror = res;
      speechSynthesis.speak(u);
    } catch (e) { res(); }
  });
}

// Recorded Lao clip if present, else Lao voice if the phone has one.
async function speakLao(key, text) {
  try {
    player.src = `/audio/${key}.mp3`;
    await new Promise((ok, fail) => { player.onended = ok; player.onerror = fail; player.play().catch(fail); });
    return;
  } catch (e) {}
  if (hasLaoVoice()) await say(text, "lo-LA");
}

async function announce() {
  speechSynthesis.cancel(); player.pause();
  buzz(300);
  await speakLao(current, LAO[current]);
  if (englishToo || !hasLaoVoice()) await say(EN[current] + " kip", "en-US");
}

function setButtons(list) {
  actions.innerHTML = "";
  list.forEach(b => {
    const el = document.createElement("button");
    el.className = b.cls || ""; el.textContent = b.text; el.onclick = b.fn;
    actions.appendChild(el);
  });
}

function home() {
  current = null; result.style.display = "none"; weak = streak = 0; cand = null;
  banner.textContent = stream ? "ເອົາເງິນໄປໃກ້ກ້ອງ · Hold the note near the camera" : "ກົດປຸ່ມເພື່ອເລີ່ມ · Tap to start";
  const l = [];
  if (!stream) l.push({ text: "📷 ເລີ່ມສະແກນ · Start camera", cls: "big", fn: startCam });
  if (!model) l.push({ text: "🧪 Demo: simulate a note", cls: "alt", fn: simulate });
  l.push({ text: englishToo ? "English voice: ON" : "English voice: OFF", cls: "alt", fn: toggleEn });
  setButtons(l);
}

function toggleEn() {
  englishToo = !englishToo;
  try { localStorage.setItem("en", englishToo ? "1" : "0"); } catch (e) {}
  home();
}

function showResult(label) {
  current = label;
  $("amt").textContent = fmt(label) + " ກີບ";
  $("amtEn").textContent = fmt(label) + " Kip";
  result.style.display = "flex";
  banner.textContent = "ລະບຸເງິນແລ້ວ · Note detected";
  setButtons([
    { text: "🔊 ຟັງອີກຄັ້ງ · Listen again", cls: "big", fn: announce },
    { text: "📷 ສະແກນໃໝ່ · Scan again", fn: home }
  ]);
  announce();
}

const simulate = () => showResult(NOTES[Math.floor(Math.random() * NOTES.length)]);

async function loadModel() {
  try {
    cfg = await (await fetch("/model/labels.json")).json();
    model = await tf.loadGraphModel("/model/model.json");
  } catch (e) {
    try { model = await tf.loadLayersModel("/model/model.json"); } catch (e2) { model = null; }
  }
  $("note").textContent = model
    ? "Model loaded. Announces only when at least " + Math.round(cfg.minConfidence * 100) + "% sure."
    : "Demo mode: add model/model.json to enable real recognition.";
}

async function startCam() {
  player.src = SILENT; player.play().catch(() => {}); // unlock audio on iPhone
  say("ພ້ອມແລ້ວ", hasLaoVoice() ? "lo-LA" : "en-US");
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    cam.srcObject = stream; await cam.play();
    home(); loop();
  } catch (e) {
    banner.textContent = "ບໍ່ສາມາດເປີດກ້ອງ · Camera not available";
  }
}

function classify() {
  const size = cfg.inputSize;
  return tf.tidy(() => {
    let img = tf.browser.fromPixels(cam);
    const [h, w] = img.shape, s = Math.min(h, w);
    img = img.slice([Math.floor((h - s) / 2), Math.floor((w - s) / 2), 0], [s, s, 3]);
    img = tf.image.resizeBilinear(img, [size, size]).toFloat();
    img = cfg.normalize === "neg1to1" ? img.div(127.5).sub(1) : img.div(255);
    return model.predict(img.expandDims(0));
  });
}

async function loop() {
  if (stream && !current && model && cam.videoWidth) {
    const out = classify();
    const p = await out.data(); out.dispose();
    let b = 0; for (let i = 1; i < p.length; i++) if (p[i] > p[b]) b = i;
    const label = cfg.labels[b], conf = p[b];
    if (conf >= cfg.minConfidence && label !== "background") {
      weak = 0; streak = label === cand ? streak + 1 : 1; cand = label;
      if (streak >= 3) showResult(label);
    } else {
      streak = 0; cand = null;
      if (label !== "background" && ++weak >= 8) { weak = 0; buzz([0, 100, 100, 100]); speakLao("try_again", "ກະລຸນາລອງໃໝ່"); }
    }
  }
  setTimeout(loop, 400);
}

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
speechSynthesis.onvoiceschanged = () => {};
home();
loadModel().then(home);
