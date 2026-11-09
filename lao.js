// Turns kip amounts into Lao number words (as audio-clip keys + Lao text) and English text.
(function (root) {
  const LAO = {
    "1":"ໜຶ່ງ","2":"ສອງ","3":"ສາມ","4":"ສີ່","5":"ຫ້າ","6":"ຫົກ","7":"ເຈັດ","8":"ແປດ","9":"ເກົ້າ",
    "10":"ສິບ","20":"ຊາວ","et":"ເອັດ","100":"ຮ້ອຍ","1000":"ພັນ","10000":"ໝື່ນ","100000":"ແສນ","1000000":"ລ້ານ",
    "kip":"ກີບ","notes":"ໃບ","total":"ລວມ","try_again":"ກະລຸນາລອງໃໝ່","ready":"ພ້ອມແລ້ວ"
  };
  const tok = k => ({ key: k, lao: LAO[k] });

  function below100(n) {
    const t = [], tens = Math.floor(n / 10), u = n % 10;
    if (tens === 1) t.push(tok("10"));
    else if (tens === 2) t.push(tok("20"));
    else if (tens >= 3) { t.push(tok(String(tens))); t.push(tok("10")); }
    if (u === 1 && tens >= 1) t.push(tok("et"));
    else if (u >= 1) t.push(tok(String(u)));
    return t;
  }

  function numTokens(n) {
    if (n >= 1000000) {
      const m = Math.floor(n / 1000000), rest = n % 1000000;
      return [...numTokens(m), tok("1000000"), ...(rest ? numTokens(rest) : [])];
    }
    const t = [];
    for (const v of [100000, 10000, 1000, 100]) {
      const d = Math.floor(n / v); n %= v;
      if (d) { t.push(tok(String(d))); t.push(tok(String(v))); }
    }
    if (n) t.push(...below100(n));
    return t;
  }

  const fmt = n => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const laoText = t => t.map(x => x.lao).join("");

  // values: e.g. [50000, 20000] -> what to say
  function buildSpeech(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    let tokens;
    if (values.length === 1) tokens = [...numTokens(sum), tok("kip")];
    else tokens = [...numTokens(values.length), tok("notes"), tok("total"), ...numTokens(sum), tok("kip")];
    const en = values.length === 1 ? fmt(sum) + " kip" : values.length + " notes. Total " + fmt(sum) + " kip.";
    return { tokens, lao: laoText(tokens), en, sum, count: values.length };
  }

  const api = { LAO, tok, numTokens, buildSpeech, fmt };
  if (typeof module !== "undefined") module.exports = api; else root.LaoNum = api;
})(typeof self !== "undefined" ? self : this);
