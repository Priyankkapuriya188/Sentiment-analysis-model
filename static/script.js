(() => {
  "use strict";

  /* ---------- Elements ---------- */
  const $ = (sel) => document.querySelector(sel);
  const form = $("#review-form");
  const input = $("#review");
  const count = $("#count");
  const analyzeBtn = $("#analyze");
  const btnLabel = analyzeBtn.querySelector(".btn-label");
  const clearBtn = $("#clear");
  const stage = $("#stage");
  const faceWrap = $("#face-wrap");
  const face = $("#face");
  const eyesTrack = $("#eyes-track");
  const mouth = $("#mouth");
  const wordEl = $("#word");
  const noteEl = $("#note");
  const thumb = $("#gauge-thumb");
  const errorEl = $("#error");
  const fx = $("#fx");
  const historySection = $("#history");
  const historyList = $("#history-list");
  const clearHistoryBtn = $("#clear-history");

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const HISTORY_KEY = "mood-reader-history";
  const HISTORY_MAX = 6;

  const SAMPLES = {
    love: "Absolutely love this blender! It crushes ice in seconds, it's surprisingly quiet, and cleanup takes about a minute. Best purchase I've made this year.",
    meh: "The jacket fits fine and the color matches the photos. Nothing special though. Shipping took a week and the zipper feels a little cheap.",
    bad: "Stopped working after two weeks and support never answered my emails. Complete waste of money. I will never order from this company again."
  };

  /* Mouth shapes: a quadratic curve from (120-w, y) to (120+w, y), bending toward cy */
  const MOODS = {
    idle:     { word: "Ready",    note: "Write or paste a review, then press Analyze review.", shape: { w: 34, y: 166, cy: 174 }, pos: 50 },
    thinking: { shape: { w: 20, y: 168, cy: 168 } },
    positive: { word: "Positive", note: "The customer sounds happy.",     shape: { w: 48, y: 154, cy: 214 }, pos: 83.33 },
    neutral:  { word: "Neutral",  note: "The customer sounds undecided.", shape: { w: 38, y: 166, cy: 166 }, pos: 50 },
    negative: { word: "Negative", note: "The customer sounds unhappy.",   shape: { w: 40, y: 182, cy: 126 }, pos: 16.67 }
  };

  /* ---------- Mouth animation ---------- */
  let shape = { ...MOODS.idle.shape };
  let raf = 0;

  const drawMouth = (s) => {
    mouth.setAttribute("d", `M ${120 - s.w} ${s.y} Q 120 ${s.cy} ${120 + s.w} ${s.y}`);
  };

  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = (p) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(p - 1, 3) + c1 * Math.pow(p - 1, 2);
  };

  const morphTo = (target, duration = 750) => {
    cancelAnimationFrame(raf);
    if (reduceMotion) {
      shape = { ...target };
      drawMouth(shape);
      return;
    }
    const from = { ...shape };
    const start = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const e = easeOutBack(p);
      shape = {
        w: lerp(from.w, target.w, e),
        y: lerp(from.y, target.y, e),
        cy: lerp(from.cy, target.cy, e)
      };
      drawMouth(shape);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };

  /* ---------- Gauge ---------- */
  const setThumb = (pct) => { thumb.style.left = pct + "%"; };
  let scanTimer = 0;

  const startScan = () => {
    let right = false;
    setThumb(22);
    scanTimer = setInterval(() => {
      right = !right;
      setThumb(right ? 78 : 22);
    }, 650);
  };
  const stopScan = () => { clearInterval(scanTimer); scanTimer = 0; };

  /* ---------- Eyes and head follow the pointer (one update per frame) ---------- */
  if (!reduceMotion) {
    let px = 0;
    let py = 0;
    let queued = false;

    const applyTrack = () => {
      queued = false;
      const r = face.getBoundingClientRect();
      const dx = px - (r.left + r.width / 2);
      const dy = py - (r.top + r.height / 2);
      const dist = Math.hypot(dx, dy) || 1;
      const k = Math.min(1, dist / 380);
      const ux = dx / dist;
      const uy = dy / dist;
      eyesTrack.style.transform = `translate(${(ux * 11 * k).toFixed(1)}px, ${(uy * 8 * k).toFixed(1)}px)`;
      face.style.transform = `perspective(700px) rotateY(${(ux * 9 * k).toFixed(1)}deg) rotateX(${(-uy * 9 * k).toFixed(1)}deg)`;
    };

    window.addEventListener("pointermove", (e) => {
      px = e.clientX;
      py = e.clientY;
      if (!queued) { queued = true; requestAnimationFrame(applyTrack); }
    }, { passive: true });
  }

  /* ---------- Particle burst ---------- */
  const ctx = fx.getContext("2d");
  let parts = [];
  let fxRaf = 0;

  const PALETTES = {
    positive: ["#2fb67c", "#62e0a8", "#ffd166", "#8ec5ff", "#ffffff"],
    neutral:  ["#f2b531", "#f7ca5c", "#ffffff"],
    negative: ["#e5535b", "#ff8f96", "#7b859b"]
  };

  const sizeFx = () => {
    const r = stage.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    fx.width = Math.round(r.width * dpr);
    fx.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return r;
  };

  const rand = (a, b) => a + Math.random() * (b - a);

  const burst = (mood) => {
    if (reduceMotion || !PALETTES[mood]) return;
    const sr = sizeFx();
    const fr = faceWrap.getBoundingClientRect();
    const ox = fr.left - sr.left + fr.width / 2;
    const oy = fr.top - sr.top + fr.height / 2;
    const colors = PALETTES[mood];
    const pick = () => colors[Math.floor(Math.random() * colors.length)];

    if (mood === "positive") {
      // confetti pops out of the face and falls
      for (let i = 0; i < 45; i++) {
        const a = rand(-Math.PI, 0);
        const s = rand(3, 9);
        parts.push({ x: ox, y: oy - 20, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0.18, drag: 0.985,
          w: rand(5, 10), h: rand(3, 6), rot: rand(0, 6.28), vr: rand(-0.3, 0.3), life: 0, max: rand(70, 110), c: pick(), shape: "rect" });
      }
    } else if (mood === "neutral") {
      // calm ripples of dots drifting outward
      for (let i = 0; i < 20; i++) {
        const a = rand(0, Math.PI * 2);
        const s = rand(1, 3.2);
        parts.push({ x: ox, y: oy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, g: 0, drag: 0.97,
          w: rand(2.5, 5), h: 0, rot: 0, vr: 0, life: 0, max: rand(60, 95), c: pick(), shape: "dot" });
      }
    } else {
      // rain falling across the card
      for (let i = 0; i < 30; i++) {
        parts.push({ x: rand(0, sr.width), y: rand(-80, 0), vx: rand(-0.3, 0.3), vy: rand(3, 6), g: 0.12, drag: 1,
          w: 2.2, h: rand(10, 18), rot: 0, vr: 0, life: 0, max: rand(70, 110), c: pick(), shape: "drop" });
      }
    }
    cancelAnimationFrame(fxRaf);
    fxRaf = requestAnimationFrame(tickFx);
  };

  const tickFx = () => {
    const w = fx.width;
    const h = fx.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.restore();

    parts = parts.filter((p) => p.life < p.max);
    for (const p of parts) {
      p.life++;
      p.vx *= p.drag;
      p.vy = p.vy * p.drag + p.g;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      const t = p.life / p.max;
      ctx.globalAlpha = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
      ctx.fillStyle = p.c;
      if (p.shape === "dot") {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.w, 0, Math.PI * 2);
        ctx.fill();
      } else if (p.shape === "drop") {
        ctx.fillRect(p.x, p.y, p.w, p.h);
      } else {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    if (parts.length) fxRaf = requestAnimationFrame(tickFx);
  };

  /* ---------- Typewriter placeholder ---------- */
  const STATIC_PLACEHOLDER = "Paste a customer review here...";
  const PROMPTS = [
    "The battery lasts all day and the screen is gorgeous.",
    "Arrived late and the box was crushed. Very disappointed.",
    "It does the job. Nothing more, nothing less."
  ];

  if (!reduceMotion) {
    let pi = 0;
    let ci = 0;
    let deleting = false;
    const typeLoop = () => {
      if (input.value || document.activeElement === input) {
        input.placeholder = STATIC_PLACEHOLDER;
        ci = 0;
        deleting = false;
        setTimeout(typeLoop, 800);
        return;
      }
      const full = PROMPTS[pi];
      let delay = 48;
      if (!deleting) {
        ci++;
        if (ci >= full.length) { deleting = true; delay = 1900; }
      } else {
        ci -= 2;
        delay = 16;
        if (ci <= 0) { ci = 0; deleting = false; pi = (pi + 1) % PROMPTS.length; delay = 450; }
      }
      input.placeholder = full.slice(0, Math.max(ci, 0)) || " ";
      setTimeout(typeLoop, delay);
    };
    setTimeout(typeLoop, 1400);
  }

  /* ---------- UI state ---------- */
  const normalizeMood = (label) => {
    const l = String(label).trim().toLowerCase();
    if (l.startsWith("pos")) return "positive";
    if (l.startsWith("neu")) return "neutral";
    if (l.startsWith("neg")) return "negative";
    return null;
  };

  const retrigger = (el, cls) => {
    el.classList.remove(cls);
    void el.offsetWidth; // restart the animation
    el.classList.add(cls);
  };

  const setWord = (word, note) => {
    wordEl.textContent = word;
    noteEl.textContent = note;
    retrigger(wordEl, "swap");
  };

  const clearError = () => { errorEl.hidden = true; errorEl.textContent = ""; };

  const showIdle = () => {
    document.body.dataset.mood = "idle";
    morphTo(MOODS.idle.shape);
    setThumb(MOODS.idle.pos);
    setWord(MOODS.idle.word, MOODS.idle.note);
    clearError();
  };

  const showResult = ({ sentiment }) => {
    const mood = normalizeMood(sentiment);
    clearError();

    if (mood) {
      document.body.dataset.mood = mood;
      morphTo(MOODS[mood].shape);
      setThumb(MOODS[mood].pos);
      setWord(MOODS[mood].word, MOODS[mood].note);
    } else {
      // The model returned a label we don't recognise: show it as-is.
      document.body.dataset.mood = "neutral";
      morphTo(MOODS.neutral.shape);
      setThumb(MOODS.neutral.pos);
      setWord(String(sentiment), "This is the label the model returned.");
    }
    retrigger(faceWrap, "pop");
    burst(mood);
  };

  const showError = (message) => {
    document.body.dataset.mood = "idle";
    morphTo(MOODS.idle.shape);
    setThumb(MOODS.idle.pos);
    setWord("No result", "Fix the problem below and try again.");
    errorEl.textContent = message;
    errorEl.hidden = false;
    errorEl.style.animation = "none";
    void errorEl.offsetWidth;
    errorEl.style.animation = "";
  };

  const setLoading = (on) => {
    stage.classList.toggle("is-thinking", on);
    analyzeBtn.classList.toggle("loading", on);
    analyzeBtn.disabled = on || !input.value.trim();
    input.readOnly = on;
    btnLabel.textContent = on ? "Analyzing" : "Analyze review";
    if (on) {
      clearError();
      morphTo(MOODS.thinking.shape, 400);
      startScan();
    } else {
      stopScan();
    }
  };

  /* ---------- API ---------- */
  const explainError = (status, body) => {
    const detail = body && body.detail;
    if (status === 503) return "The model isn't loaded on the server yet. Check that sentiment_model.pkl is deployed.";
    if (status === 422) {
      if (typeof detail === "string") {
        if (detail.startsWith("No usable")) return "No usable English words found. Try a longer review written in English.";
        return detail;
      }
      if (Array.isArray(detail) && detail[0] && detail[0].msg) {
        return "That review can't be analyzed: " + detail[0].msg + ".";
      }
      return "That review can't be analyzed. Check the text and try again.";
    }
    return "The server returned an error (" + status + "). Try again in a moment.";
  };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const analyze = async (text) => {
    setLoading(true);
    try {
      const request = fetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ review: text })
      });
      // Keep the "thinking" state on screen long enough to read
      const [res] = await Promise.all([request, sleep(850)]);

      let body = null;
      try { body = await res.json(); } catch (_) { /* non-JSON error page */ }

      if (!res.ok) {
        showError(explainError(res.status, body));
        return;
      }
      showResult(body);
      saveHistory({ text, sentiment: body.sentiment });
    } catch (err) {
      showError("Can't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ---------- History (this browser only) ---------- */
  const loadHistory = () => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (_) { return []; }
  };

  const storeHistory = (items) => {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch (_) { /* storage unavailable */ }
  };

  const saveHistory = (entry) => {
    const items = loadHistory().filter((i) => i.text !== entry.text);
    items.unshift(entry);
    const trimmed = items.slice(0, HISTORY_MAX);
    storeHistory(trimmed);
    renderHistory(trimmed);
  };

  const renderHistory = (items = loadHistory()) => {
    historyList.replaceChildren();
    historySection.hidden = items.length === 0;

    items.forEach((item) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      const mood = normalizeMood(item.sentiment) || "other";
      btn.type = "button";
      btn.className = "h-item";
      btn.dataset.mood = mood;

      const dot = document.createElement("span");
      dot.className = "h-dot";
      const text = document.createElement("span");
      text.className = "h-text";
      text.textContent = item.text;
      const label = document.createElement("span");
      label.className = "h-label";
      label.textContent = item.sentiment;

      btn.append(dot, text, label);
      btn.addEventListener("click", () => {
        input.value = item.text;
        syncInput();
        showResult({ sentiment: item.sentiment });
        window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
      });

      li.appendChild(btn);
      historyList.appendChild(li);
    });
  };

  /* ---------- Events ---------- */
  const syncInput = () => {
    count.textContent = `${input.value.length} / 10000`;
    analyzeBtn.disabled = !input.value.trim() || analyzeBtn.classList.contains("loading");
  };

  input.addEventListener("input", syncInput);

  input.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      form.requestSubmit();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || analyzeBtn.classList.contains("loading")) return;
    analyze(text);
  });

  document.querySelectorAll("[data-sample]").forEach((chip) => {
    chip.addEventListener("click", () => {
      input.value = SAMPLES[chip.dataset.sample];
      syncInput();
      input.focus();
      form.requestSubmit();
    });
  });

  clearBtn.addEventListener("click", () => {
    input.value = "";
    syncInput();
    showIdle();
    input.focus();
  });

  clearHistoryBtn.addEventListener("click", () => {
    storeHistory([]);
    renderHistory([]);
  });

  /* ---------- Init ---------- */
  drawMouth(shape);
  setThumb(MOODS.idle.pos);
  syncInput();
  renderHistory();
})();