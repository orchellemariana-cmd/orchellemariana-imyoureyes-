// Decodes YOLOv8-style detector output and removes duplicate boxes. Pure JS (no TensorFlow needed).
(function (root) {
  function iou(a, b) {
    const x1 = Math.max(a.x1, b.x1), y1 = Math.max(a.y1, b.y1);
    const x2 = Math.min(a.x2, b.x2), y2 = Math.min(a.y2, b.y2);
    const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
    const ua = (a.x2 - a.x1) * (a.y2 - a.y1) + (b.x2 - b.x1) * (b.y2 - b.y1) - inter;
    return ua > 0 ? inter / ua : 0;
  }

  // Class-agnostic NMS: one physical note must not be counted twice.
  function nms(boxes, thr) {
    const sorted = boxes.slice().sort((a, b) => b.score - a.score), keep = [];
    for (const b of sorted) if (keep.every(k => iou(k, b) < thr)) keep.push(b);
    return keep;
  }

  // data: flat Float32Array. layout "channel" = [4+nc][N] (YOLOv8 default), "anchor" = [N][4+nc].
  function decode(data, nc, N, S, scoreThr, iouThr, layout) {
    const at = (c, i) => (layout === "anchor" ? data[i * (4 + nc) + c] : data[c * N + i]);
    const cand = [];
    for (let i = 0; i < N; i++) {
      let best = 0, score = 0;
      for (let c = 0; c < nc; c++) { const s = at(4 + c, i); if (s > score) { score = s; best = c; } }
      if (score < scoreThr) continue;
      cand.push({ cx: at(0, i), cy: at(1, i), w: at(2, i), h: at(3, i), score, cls: best });
    }
    // Some exports give 0..1 coordinates, others pixels; handle both.
    const norm = cand.length > 0 && cand.every(c => c.cx + c.w / 2 <= 1.5 && c.cy + c.h / 2 <= 1.5);
    const k = norm ? S : 1;
    const boxes = cand.map(c => ({
      x1: (c.cx - c.w / 2) * k, y1: (c.cy - c.h / 2) * k,
      x2: (c.cx + c.w / 2) * k, y2: (c.cy + c.h / 2) * k, score: c.score, cls: c.cls
    }));
    return nms(boxes, iouThr);
  }

  const api = { iou, nms, decode };
  if (typeof module !== "undefined") module.exports = api; else root.Detect = api;
})(typeof self !== "undefined" ? self : this);
