/* ============================================================
   睇譜小遊戲 · Note Reading Game
   Treble (G) clef + Bass (F) clef · random questions
   ============================================================ */
(function () {
  "use strict";

  /* ---------- music data ---------- */
  // Position "p" = diagram step from the TOP staff line (0 = top line, 10 = bottom line)
  // y = 40 + p*14 ; staff lines sit at p = 2,4,6,8,10
  var TREBLE_POS = { "E4": 10, "F4": 9, "G4": 8, "A4": 7, "B4": 6, "C5": 5, "D5": 4, "E5": 3, "F5": 2, "G5": 1, "A5": 0 };
  var BASS_POS   = { "G2": 10, "A2": 9, "B2": 8, "C3": 7, "D3": 6, "E3": 5, "F3": 4, "G3": 3, "A3": 2, "B3": 1, "C4": 0 };

  var SOLFEGE = { C: "Do", D: "Re", E: "Mi", F: "Fa", G: "Sol", A: "La", B: "Ti" };
  var LETTERS = ["C", "D", "E", "F", "G", "A", "B"];

  // Build note lists
  function octaveOf(n) { return parseInt(n.replace(/[A-G]/, ""), 10); }
  function letterOf(n) { return n[0]; }

  var TREBLE_NOTES = Object.keys(TREBLE_POS).map(function (n) {
    return { clef: "treble", name: n, letter: letterOf(n), octave: octaveOf(n), p: TREBLE_POS[n] };
  });
  var BASS_NOTES = Object.keys(BASS_POS).map(function (n) {
    return { clef: "bass", name: n, letter: letterOf(n), octave: octaveOf(n), p: BASS_POS[n] };
  });

  // MIDI number for playback
  var SEMITONE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midiOf(n) {
    var letter = letterOf(n), oct = octaveOf(n);
    return (oct + 1) * 12 + SEMITONE[letter];
  }

  /* ---------- audio ---------- */
  var actx = null;
  function audioCtx() {
    if (!actx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (AC) actx = new AC();
    }
    return actx;
  }
  function playNote(name) {
    var ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    var midi = midiOf(name);
    var freq = 440 * Math.pow(2, (midi - 69) / 12);
    var now = ctx.currentTime;

    // master output
    var master = ctx.createGain();
    master.gain.value = 0.0;
    master.connect(ctx.destination);

    // gentle lowpass for a warm "piano-ish" tone
    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = Math.min(6000, freq * 8 + 900);
    lp.connect(master);

    // partials: (harmonic multiplier, gain)
    var partials = [[1, 0.55], [2, 0.22], [3, 0.10], [4, 0.05]];
    var oscs = [];
    partials.forEach(function (pt) {
      var o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq * pt[0];
      var g = ctx.createGain();
      g.gain.value = pt[1];
      o.connect(g); g.connect(lp);
      o.start(now);
      o.stop(now + 1.9);
      oscs.push(o);
    });

    // amplitude envelope: soft attack, long decay
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.9, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.45, now + 0.22);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);
    // fade the filter a touch over time
    lp.frequency.setValueAtTime(lp.frequency.value, now);
    lp.frequency.exponentialRampToValueAtTime(Math.max(700, freq * 3), now + 1.2);
  }

  // short pleasant/unpleasant feedback tones (correct / wrong)
  function feedbackTone(kind) {
    var ctx = audioCtx();
    if (!ctx) return;
    if (ctx.state === "suspended") ctx.resume();
    var now = ctx.currentTime;
    var tones = kind === "correct" ? [523.25, 783.99] : [311.13, 207.65]; // C5+G5 / Eb4+Ab3
    tones.forEach(function (f, i) {
      var o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === "correct" ? "sine" : "triangle";
      o.frequency.value = f;
      var t0 = now + i * 0.11;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + (kind === "correct" ? 0.24 : 0.34));
      o.connect(g); g.connect(ctx.destination);
      o.start(t0); o.stop(t0 + (kind === "correct" ? 0.3 : 0.4));
    });
  }

  /* ---------- SVG staff rendering (grand staff: treble + bass) ---------- */
  var SVGNS = "http://www.w3.org/2000/svg";
  var STAFF_X1 = 34, STAFF_X2 = 300;
  var NOTE_X = 250;
  var STEP = 11;              // vertical px per diatonic step (line spacing = 2*STEP)
  var TREBLE_BASE = 30;       // y of p=0 on the treble staff
  var BASS_BASE = TREBLE_BASE + 12 * STEP; // middle C aligns perfectly (treble p=12 == bass p=0)

  function el(tag, attrs) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function staffLineY(base, p) { return base + p * STEP; }

  function renderStaff(svg, clef, noteName) {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    // soft halo behind the active staff (drawn first so lines/clefs sit on top)
    var activeBase = clef === "treble" ? TREBLE_BASE : BASS_BASE;
    var hlTop = staffLineY(activeBase, 1.4);
    var hlBot = staffLineY(activeBase, 10.6);
    svg.appendChild(el("rect", {
      x: STAFF_X1 - 4, y: hlTop, width: (STAFF_X2 - STAFF_X1) + 8, height: hlBot - hlTop,
      fill: clef === "treble" ? "rgba(79,124,255,0.06)" : "rgba(160,107,255,0.08)",
      rx: 8
    }));

    // grand-staff bracket: left barline spanning both staves + a curly brace
    var gTop = staffLineY(TREBLE_BASE, 2);
    var gBot = staffLineY(BASS_BASE, 10);
    svg.appendChild(el("line", {
      x1: STAFF_X1, y1: gTop, x2: STAFF_X1, y2: gBot,
      stroke: "#7c879f", "stroke-width": 1.8, "stroke-linecap": "round"
    }));
    var xb = 26, mid = (gTop + gBot) / 2, ex = STAFF_X1 - 1;
    var bracePath = "M " + ex + " " + gTop +
      " C " + (xb + 7) + " " + gTop + " " + (xb + 3) + " " + (gTop + 34) + " " + (xb + 3) + " " + (gTop + 54) +
      " C " + (xb + 3) + " " + (mid - 15) + " " + (xb - 3) + " " + (mid - 4) + " " + (xb - 10) + " " + mid +
      " C " + (xb - 3) + " " + (mid + 4) + " " + (xb + 3) + " " + (mid + 15) + " " + (xb + 3) + " " + (mid + 54) +
      " C " + (xb + 3) + " " + (gBot - 34) + " " + (xb + 7) + " " + gBot + " " + ex + " " + gBot;
    svg.appendChild(el("path", {
      d: bracePath, fill: "none", stroke: "#7c879f",
      "stroke-width": 1.7, "stroke-linecap": "round", "stroke-linejoin": "round"
    }));

    // --- draw both five-line staves ---
    function drawStaffLines(base) {
      for (var p = 2; p <= 10; p += 2) {
        var ly = staffLineY(base, p);
        svg.appendChild(el("line", {
          x1: STAFF_X1, y1: ly, x2: STAFF_X2, y2: ly,
          stroke: "#98a1b8", "stroke-width": 1.3, "stroke-linecap": "round"
        }));
      }
    }
    drawStaffLines(TREBLE_BASE);
    drawStaffLines(BASS_BASE);

    // --- treble clef (G) : curl sits on the G4 line = p=8 ---
    var tImg = el("image", { preserveAspectRatio: "xMidYMid meet", href: "assets/glyph_treble.png" });
    var tH = 122, tCurlY = staffLineY(TREBLE_BASE, 8); // G4 line
    tImg.setAttribute("x", 36);
    tImg.setAttribute("y", (tCurlY - 0.72 * tH).toFixed(1));
    tImg.setAttribute("height", tH);
    tImg.setAttribute("width", (tH * 294 / 605).toFixed(1));
    svg.appendChild(tImg);

    // --- bass clef (F) : two dots straddle the F3 line = p=4 ---
    var bImg = el("image", { preserveAspectRatio: "xMidYMid meet", href: "assets/glyph_bass.png" });
    var bH = 92, bFY = staffLineY(BASS_BASE, 4); // F3 line
    bImg.setAttribute("x", 36);
    bImg.setAttribute("y", (bFY - 0.5 * bH).toFixed(1));
    bImg.setAttribute("height", bH);
    bImg.setAttribute("width", (bH * 318 / 324).toFixed(1));
    svg.appendChild(bImg);

    // --- which staff does the note live on ---
    var p, y;
    if (clef === "treble") { p = TREBLE_POS[noteName]; y = staffLineY(TREBLE_BASE, p); }
    else { p = BASS_POS[noteName]; y = staffLineY(BASS_BASE, p); }

    // --- ledger lines (only when the note is beyond the staff) ---
    function ledger(x, yy) {
      svg.appendChild(el("line", {
        x1: x - 20, y1: yy, x2: x + 20, y2: yy,
        stroke: "#98a1b8", "stroke-width": 1.4, "stroke-linecap": "round"
      }));
    }
    if (clef === "treble" && p <= 0) ledger(NOTE_X, y);      // A5 (and above)
    if (clef === "bass" && p <= 0) ledger(NOTE_X, y);        // middle C (and above)

    // --- stem ---
    var stemUp = p >= 6;         // notes at/below the middle line get an up-stem
    var rx = 10.5;
    if (stemUp) {
      svg.appendChild(el("line", {
        x1: NOTE_X + rx, y1: y - 1, x2: NOTE_X + rx, y2: y - 30,
        stroke: "#26314a", "stroke-width": 2.6, "stroke-linecap": "round"
      }));
    } else {
      svg.appendChild(el("line", {
        x1: NOTE_X - rx, y1: y + 1, x2: NOTE_X - rx, y2: y + 30,
        stroke: "#26314a", "stroke-width": 2.6, "stroke-linecap": "round"
      }));
    }

    // --- note head ---
    svg.appendChild(el("ellipse", {
      cx: NOTE_X, cy: y, rx: rx, ry: 7.8,
      fill: "#26314a",
      transform: "rotate(-18 " + NOTE_X + " " + y + ")"
    }));
  }

  /* ---------- state ---------- */
  var state = {
    clefChoice: null,
    total: 10,
    questions: [],
    idx: 0,
    correct: 0,
    answered: false
  };

  var CUM_KEY = "noteGameCumulative";

  function getCum() {
    var v = parseInt(localStorage.getItem(CUM_KEY) || "0", 10);
    return isNaN(v) ? 0 : v;
  }
  function setCum(v) {
    localStorage.setItem(CUM_KEY, String(v));
  }

  /* ---------- DOM ---------- */
  var $ = function (id) { return document.getElementById(id); };
  var startScreen = $("startScreen"), gameScreen = $("gameScreen"), resultScreen = $("resultScreen");
  var staffSvg = $("staffSvg"), clefBadge = $("clefBadge");
  var optionsEl = $("options"), feedbackEl = $("feedback"), nextWrap = $("nextWrap");
  var askEl = $("askText");
  var winOverlay = $("winOverlay"), winConfetti = $("winConfetti"), winSub = $("winSub");

  /* ---------- correct-answer celebration ---------- */
  var CHEERS = ["好叻呀！", "犀利！", "答啱喇！", "好嘢！", "繼續加油！"];
  var celebrateTimer = null, hideTimer = null;
  function celebrate() {
    clearTimeout(celebrateTimer); clearTimeout(hideTimer);
    winSub.textContent = CHEERS[Math.floor(Math.random() * CHEERS.length)];
    winConfetti.innerHTML = "";
    var glyphs = ["⭐", "✨", "🎵", "🌟", "💛", "🎶", "💫"];
    for (var i = 0; i < 16; i++) {
      var s = document.createElement("span");
      s.textContent = glyphs[i % glyphs.length];
      s.style.left = (4 + Math.random() * 92) + "%";
      s.style.animationDelay = (Math.random() * 0.5).toFixed(2) + "s";
      s.style.animationDuration = (1.1 + Math.random() * 0.9).toFixed(2) + "s";
      s.style.fontSize = (14 + Math.random() * 16).toFixed(0) + "px";
      winConfetti.appendChild(s);
    }
    winOverlay.classList.add("show");
    winOverlay.setAttribute("aria-hidden", "false");
    hideTimer = setTimeout(hideCelebration, 1700);
  }
  function hideCelebration() {
    winOverlay.classList.remove("show");
    winOverlay.setAttribute("aria-hidden", "true");
  }

  /* ---------- start screen selection ---------- */
  var selectedClef = null, selectedCount = null;

  function refreshStartBtn() {
    $("startBtn").disabled = !(selectedClef && selectedCount);
  }

  document.querySelectorAll(".clef-card").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".clef-card").forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
      selectedClef = btn.dataset.clef;
      refreshStartBtn();
    });
  });
  document.querySelectorAll(".count-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      document.querySelectorAll(".count-btn").forEach(function (b) { b.classList.remove("selected"); });
      btn.classList.add("selected");
      selectedCount = parseInt(btn.dataset.count, 10);
      refreshStartBtn();
    });
  });

  $("resetTotalBtn").addEventListener("click", function () {
    var n = getCum();
    if (n > 0 && window.confirm("確定要清除累積分數（" + n + " 題）嗎？")) {
      setCum(0);
      updateCumDisplays();
    }
  });

  function updateCumDisplays() {
    var n = getCum();
    $("cumScore").textContent = n;
    if ($("cumScore2")) $("cumScore2").textContent = n;
  }

  /* ---------- game generation ---------- */
  function shuffled(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function generateQuestions(clefChoice, count) {
    var pool = [];
    if (clefChoice === "treble") pool = TREBLE_NOTES;
    else if (clefChoice === "bass") pool = BASS_NOTES;
    else pool = TREBLE_NOTES.concat(BASS_NOTES);

    var qs = [];
    var lastKey = null;
    for (var i = 0; i < count; i++) {
      var note;
      var guard = 0;
      do {
        note = pool[Math.floor(Math.random() * pool.length)];
        guard++;
      } while (note.clef + note.name === lastKey && guard < 30);
      lastKey = note.clef + note.name;

      // options: all 7 letters (A–G), shuffled
      var opts = shuffled(LETTERS);

      qs.push({
        clef: note.clef,
        name: note.name,
        letter: note.letter,
        octave: note.octave,
        options: opts
      });
    }
    return qs;
  }

  /* ---------- render question ---------- */
  function renderQuestion() {
    state.answered = false;
    var q = state.questions[state.idx];

    // HUD
    $("qCounter").textContent = "第 " + (state.idx + 1) + " / " + state.total + " 題";
    $("liveScore").textContent = state.correct;
    var pct = (state.idx / state.total) * 100;
    $("progressBar").style.width = pct + "%";

    // clef badge
    clefBadge.textContent = q.clef === "treble" ? "🎼 高音譜號 · G Clef（上面）" : "🎼 低音譜號 · F Clef（下面）";
    clefBadge.className = "clef-badge" + (q.clef === "bass" ? " bass" : "");

    // staff
    renderStaff(staffSvg, q.clef, q.name);

    askEl.textContent = "呢粒音叫咩名？";
    feedbackEl.textContent = "";
    feedbackEl.className = "feedback";
    nextWrap.innerHTML = "";

    // options
    optionsEl.innerHTML = "";
    q.options.forEach(function (L) {
      var b = document.createElement("button");
      b.className = "opt-btn";
      b.dataset.letter = L;
      b.innerHTML = '<span class="opt-letter">' + L + '</span><span class="opt-solfege">' + SOLFEGE[L] + '</span>';
      b.addEventListener("click", function () { onAnswer(L, b); });
      optionsEl.appendChild(b);
    });
  }

  /* ---------- answering ---------- */
  function onAnswer(chosen, btn) {
    if (state.answered) return;
    state.answered = true;
    var q = state.questions[state.idx];

    // NOTE: the pitch only plays when she taps 🔊 聽個音.
    // Answering only gives a short success / error sound cue.

    // disable all option buttons
    optionsEl.querySelectorAll(".opt-btn").forEach(function (b) { b.disabled = true; });

    if (chosen === q.letter) {
      // correct
      btn.classList.add("correct");
      state.correct++;
      feedbackTone("correct");
      $("liveScore").textContent = state.correct;
      setCum(getCum() + 1);
      updateCumDisplays();
      feedbackEl.className = "feedback good";
      feedbackEl.innerHTML = "✅ 答啱喇！呢粒係 <b>" + q.letter + q.octave + "</b>（" + SOLFEGE[q.letter] + "）";
      $("progressBar").style.width = ((state.idx + 1) / state.total) * 100 + "%";
      // celebrate with the picture, then auto-advance
      celebrate();
      setTimeout(nextQuestion, 1650);
    } else {
      // wrong
      btn.classList.add("wrong");
      feedbackTone("wrong");
      // reveal correct
      optionsEl.querySelectorAll(".opt-btn").forEach(function (b) {
        if (b.dataset.letter === q.letter) b.classList.add("reveal");
      });
      feedbackEl.className = "feedback bad";
      feedbackEl.innerHTML = "❌ 答錯喇～ 正確答案係 <b>" + q.letter + q.octave + "</b>（" + SOLFEGE[q.letter] + "）";
      $("progressBar").style.width = ((state.idx + 1) / state.total) * 100 + "%";
      showNextButton();
    }
  }

  function showNextButton() {
    nextWrap.innerHTML = "";
    var b = document.createElement("button");
    b.className = "next-btn";
    var last = state.idx >= state.total - 1;
    b.textContent = last ? "睇成績 🏁" : "下一題 ▶";
    b.addEventListener("click", nextQuestion);
    nextWrap.appendChild(b);
  }

  function nextQuestion() {
    hideCelebration();
    state.idx++;
    if (state.idx >= state.total) {
      showResult();
    } else {
      renderQuestion();
    }
  }

  /* ---------- result ---------- */
  function showResult() {
    var total = state.total, correct = state.correct;
    var pct = Math.round((correct / total) * 100);
    $("resultScore").textContent = correct + " / " + total;
    $("resultPct").textContent = pct + "%";

    var stars, title, emoji;
    if (pct >= 90) { stars = "⭐⭐⭐"; title = "太犀利喇！"; emoji = "🏆"; }
    else if (pct >= 70) { stars = "⭐⭐"; title = "好嘢！做得好！"; emoji = "🎉"; }
    else if (pct >= 50) { stars = "⭐"; title = "唔錯，繼續努力！"; emoji = "👍"; }
    else { stars = "🌱"; title = "再練吓就得啦！"; emoji = "💪"; }

    $("resultStars").textContent = stars;
    $("resultTitle").textContent = title;
    $("resultEmoji").textContent = emoji;
    updateCumDisplays();

    showScreen("resultScreen");
  }

  /* ---------- screen switching ---------- */
  function showScreen(id) {
    [startScreen, gameScreen, resultScreen].forEach(function (s) { s.classList.remove("active"); });
    $(id).classList.add("active");
    window.scrollTo(0, 0);
  }

  /* ---------- start / replay ---------- */
  function startGame() {
    hideCelebration();
    state.clefChoice = selectedClef;
    state.total = selectedCount;
    state.questions = generateQuestions(selectedClef, selectedCount);
    state.idx = 0;
    state.correct = 0;
    // warm audio on gesture
    var c = audioCtx(); if (c && c.state === "suspended") c.resume();
    showScreen("gameScreen");
    renderQuestion();
  }

  $("startBtn").addEventListener("click", startGame);

  $("playBtn").addEventListener("click", function () {
    var q = state.questions[state.idx];
    if (q) playNote(q.name);
  });

  $("quitBtn").addEventListener("click", function () {
    if (window.confirm("確定要結束今次遊戲嗎？")) {
      hideCelebration();
      showScreen("startScreen");
      updateCumDisplays();
    }
  });

  $("againBtn").addEventListener("click", startGame);
  $("changeBtn").addEventListener("click", function () {
    showScreen("startScreen");
    updateCumDisplays();
  });

  /* ---------- lock zoom on phones: block PINCH only ---------- */
  // Double-tap zoom is already prevented by `touch-action: pan-x pan-y` in CSS.
  // We only guard pinch here — and we let quick repeated taps through so buttons stay responsive.
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("gesturechange", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("gestureend", function (e) { e.preventDefault(); }, { passive: false });
  document.addEventListener("touchmove", function (e) {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });

  /* ---------- init ---------- */
  updateCumDisplays();
})();
