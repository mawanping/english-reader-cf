// ── Device ID & Unlock Code ──
function getDeviceId() {
  let id = localStorage.getItem("er_device_id");
  if (!id) {
    id = "d" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("er_device_id", id);
  }
  return id;
}
const DEVICE_ID = getDeviceId();

function getUnlockCode() {
  return localStorage.getItem("er_unlock_code") || "";
}
function setUnlockCode(code) {
  localStorage.setItem("er_unlock_code", code);
}

// ── State ──
const state = {
  article: null,
  exercises: null,
  currentTab: "article",
  selectedWordBank: null,
  usage: { remaining: 3, limit: 3, unlimited: false },
};

// ── DOM refs ──
const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

const dom = {
  wordInput: $("#wordInput"),
  levelSelect: $("#levelSelect"),
  btnGenerate: $("#btnGenerate"),
  btnGenerateEx: $("#btnGenerateEx"),
  btnPdf: $("#btnPdf"),
  btnWord: $("#btnWord"),
  loading: $("#loadingOverlay"),
  loadingText: $("#loadingText"),
  tabBar: $("#tabBar"),
  errorBox: $("#errorBox"),
  usageBar: $("#usageBar"),
  remainingCount: $("#remainingCount"),
  btnUnlock: $("#btnUnlock"),
  unlockModal: $("#unlockModal"),
  unlockInput: $("#unlockInput"),
  unlockError: $("#unlockError"),
  viewArticle: $("#viewArticle"),
  articleTitle: $("#articleTitle"),
  articleContent: $("#articleContent"),
  phraseList: $("#phraseList"),
  viewWGF: $("#viewWordGapFill"),
  wgfTitle: $("#wgfTitle"),
  wgfInstructions: $("#wgfInstructions"),
  wgfWordBank: $("#wgfWordBank"),
  wgfPassage: $("#wgfPassage"),
  wgfResult: $("#wgfResult"),
  viewCloze: $("#viewCloze"),
  clozeTitle: $("#clozeTitle"),
  clozePassage: $("#clozePassage"),
  clozeResult: $("#clozeResult"),
  viewSCF: $("#viewSevenChooseFive"),
  scfTitle: $("#scfTitle"),
  scfInstructions: $("#scfInstructions"),
  scfPassage: $("#scfPassage"),
  scfOptions: $("#scfOptions"),
  scfResult: $("#scfResult"),
  viewReading: $("#viewReading"),
  rcTitle: $("#rcTitle"),
  rcQuestions: $("#rcQuestions"),
  rcResult: $("#rcResult"),
};

// ── Helpers ──
function parseWords(raw) {
  return raw.split(/[,，\s\n\r]+/).map((w) => w.trim()).filter((w) => w.length > 0);
}
function showLoading(text) { dom.loadingText.textContent = text; dom.loading.classList.remove("hidden"); }
function hideLoading() { dom.loading.classList.add("hidden"); }
function showError(msg) { dom.errorBox.innerHTML = msg; dom.errorBox.classList.remove("hidden"); }
function hideError() { dom.errorBox.classList.add("hidden"); }
function escapeHtml(str) {
  const d = document.createElement("div"); d.textContent = str; return d.innerHTML;
}

// ── Usage UI ──
function updateUsageUI(usage) {
  if (usage) {
    state.usage = usage;
  }
  const { remaining, limit, unlimited } = state.usage;

  if (unlimited) {
    dom.remainingCount.textContent = "无限";
    dom.usageBar.classList.remove("limit-reached");
    dom.btnUnlock.textContent = "已解锁";
    dom.btnUnlock.classList.add("unlimited");
  } else if (remaining <= 0) {
    dom.remainingCount.textContent = "0";
    dom.usageBar.classList.add("limit-reached");
    dom.btnUnlock.textContent = "获取更多次数";
  } else {
    dom.remainingCount.textContent = remaining;
    dom.usageBar.classList.remove("limit-reached");
    dom.btnUnlock.textContent = "输入解锁码";
    dom.btnUnlock.classList.remove("unlimited");
  }
}

// ── Unlock Modal ──
dom.btnUnlock.addEventListener("click", () => {
  if (state.usage.unlimited) return;
  dom.unlockModal.classList.remove("hidden");
  dom.unlockInput.value = "";
  dom.unlockError.classList.add("hidden");
});

$("#btnUnlockCancel").addEventListener("click", () => {
  dom.unlockModal.classList.add("hidden");
});

$("#btnUnlockSubmit").addEventListener("click", () => {
  const code = dom.unlockInput.value.trim();
  if (!code) { dom.unlockError.textContent = "请输入解锁码"; dom.unlockError.classList.remove("hidden"); return; }
  // Save locally and try
  setUnlockCode(code);
  // We'll verify on next API call
  state.usage = { ...state.usage, unlimited: true, remaining: Infinity };
  updateUsageUI();
  dom.unlockModal.classList.add("hidden");
  showError("解锁码已保存。如果无效，生成时会提示。");
  setTimeout(hideError, 3000);
});

// ── API calls ──
async function apiCall(endpoint, body) {
  const payload = { ...body, deviceId: DEVICE_ID, unlockCode: getUnlockCode() };
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();

  if (!res.ok) {
    if (data.limitReached) {
      // Usage exhausted
      state.usage = { remaining: 0, limit: data.limit || 3, unlimited: false };
      updateUsageUI();
      showError(`免费次数已用完（共${data.limit}次）。如需继续使用，请联系 <b>QQ邮箱: 1834109164@qq.com</b> 或 <b>微信: mwp565</b> 获取解锁码。`);
    }
    throw new Error(data.error || "请求失败");
  }

  // Update usage from response
  if (data.usage) {
    state.usage = data.usage;
    updateUsageUI();
  }
  return data;
}

async function generateArticle(words, level) {
  return apiCall("/api/generate-article", { words, level });
}
async function generateExercises(article, words, level) {
  return apiCall("/api/generate-exercises", { article, words, level });
}

// ── Article rendering ──
function renderArticle(data) {
  state.article = data;
  dom.articleTitle.textContent = data.title;

  let html = "";
  data.paragraphs.forEach((para, pi) => {
    const phraseSpans = [];
    para.phrases.forEach((ph) => {
      const idx = para.text.indexOf(ph.text);
      if (idx >= 0) phraseSpans.push({ start: idx, end: idx + ph.text.length, phrase: ph });
    });
    phraseSpans.sort((a, b) => a.start - b.start || b.end - a.end);

    let lastIdx = 0;
    const parts = [];
    phraseSpans.forEach((sp) => {
      if (sp.start < lastIdx) return;
      if (sp.start > lastIdx) parts.push(escapeHtml(para.text.slice(lastIdx, sp.start)));
      parts.push(`<span class="phrase-highlight" data-phrase-id="p${pi}-${sp.phrase.text}" title="${escapeHtml(sp.phrase.chinese)}">${escapeHtml(sp.phrase.text)}</span>`);
      lastIdx = sp.end;
    });
    if (lastIdx < para.text.length) parts.push(escapeHtml(para.text.slice(lastIdx)));
    html += `<p>${parts.join("")}</p>`;
  });
  dom.articleContent.innerHTML = html;

  // Sidebar
  const allPhrases = [];
  data.paragraphs.forEach((para, pi) => {
    para.phrases.forEach((ph) => {
      if (!allPhrases.find((p) => p.text === ph.text)) allPhrases.push({ ...ph, paraIdx: pi });
    });
  });
  dom.phraseList.innerHTML = allPhrases
    .map((ph) => `<li onclick="scrollToPhrase('p${ph.paraIdx}-${ph.text}')"><div class="ph-en">${escapeHtml(ph.text)}</div><div class="ph-zh">${escapeHtml(ph.chinese)}</div>${ph.note ? `<div class="ph-note">${escapeHtml(ph.note)}</div>` : ""}</li>`)
    .join("");

  showView("article");
}

function scrollToPhrase(id) {
  const el = document.querySelector(`[data-phrase-id="${id}"]`);
  if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.style.background = "#ffeaa7"; setTimeout(() => (el.style.background = ""), 2000); }
}

// ── Exercise rendering ──
function renderWordGapFill(data) {
  const wgf = data.wordGapFill;
  dom.wgfTitle.textContent = wgf.title;
  dom.wgfInstructions.textContent = wgf.instructions;
  dom.wgfWordBank.innerHTML = wgf.wordBank.map((w, i) => `<span class="wb-word" data-word="${escapeHtml(w)}" data-idx="${i}" onclick="selectWordBank(this, '${escapeHtml(w)}')">${escapeHtml(w)}</span>`).join("");
  dom.wgfPassage.innerHTML = wgf.passage.replace(/\((\d+)\)/g, (_, num) => {
    const ans = escapeHtml(wgf.answers[num] || "");
    return `<span class="gap" data-gap="${num}" data-answer="${ans}" onclick="clickGap(this)" id="wgf-gap-${num}">______</span>`;
  });
  dom.wgfResult.classList.add("hidden");
  state.selectedWordBank = null;
}

function selectWordBank(el, word) {
  $$(".wb-word.selected").forEach((e) => e.classList.remove("selected"));
  if (state.selectedWordBank === word) { state.selectedWordBank = null; return; }
  el.classList.add("selected");
  state.selectedWordBank = word;
}

function clickGap(el) {
  if (!state.selectedWordBank) return;
  const current = el.textContent;
  if (current !== "______") {
    const prevEl = document.querySelector(`.wb-word[data-word="${escapeHtml(current)}"]`);
    if (prevEl) prevEl.classList.remove("used");
  }
  el.textContent = state.selectedWordBank;
  el.classList.add("filled");
  const selEl = document.querySelector(".wb-word.selected");
  if (selEl) { selEl.classList.add("used"); selEl.classList.remove("selected"); }
  state.selectedWordBank = null;
}

function renderCloze(data) {
  const cloze = data.cloze;
  dom.clozeTitle.textContent = cloze.title;
  let passageHtml = cloze.passage;
  cloze.questions.forEach((q) => {
    const selectHtml = `<span class="cloze-q"><select class="cloze-select" data-cloze="${q.num}" data-answer="${escapeHtml(q.answer)}"><option value="">—</option>${q.options.map((opt) => `<option value="${opt}">${opt}</option>`).join("")}</select></span>`;
    passageHtml = passageHtml.replace(`(${q.num})`, selectHtml);
  });
  dom.clozePassage.innerHTML = passageHtml;
  dom.clozeResult.classList.add("hidden");
}

function renderSevenChooseFive(data) {
  const scf = data.sevenChooseFive;
  dom.scfTitle.textContent = scf.title;
  dom.scfInstructions.textContent = scf.instructions;
  let passageHtml = scf.passage;
  Object.keys(scf.answers).forEach((label) => {
    const selectHtml = `<span class="cloze-q"><select class="scf-select" data-scf="${label}" data-answer="${scf.answers[label]}"><option value="">—</option>${scf.options.map((opt) => `<option value="${opt.label}">${opt.label}</option>`).join("")}</select></span>`;
    passageHtml = passageHtml.replace(`(${label})`, selectHtml);
  });
  dom.scfPassage.innerHTML = passageHtml;
  dom.scfOptions.innerHTML = scf.options.map((opt) => `<div class="scf-opt"><span class="opt-label">${opt.label}.</span>${escapeHtml(opt.text)}</div>`).join("");
  dom.scfResult.classList.add("hidden");
}

function renderReading(data) {
  const rc = data.readingComprehension;
  dom.rcTitle.textContent = rc.title;
  dom.rcQuestions.innerHTML = rc.questions.map((q) => `
    <div class="rc-question">
      <div class="q-header">${q.num}. ${escapeHtml(q.question)}<span class="q-type">${escapeHtml(q.type)}</span></div>
      ${q.options.map((opt) => `<label><input type="radio" name="rc-${q.num}" value="${opt}" data-rc="${q.num}" data-answer="${escapeHtml(q.answer)}"> ${opt}</label>`).join("")}
    </div>`).join("");
  dom.rcResult.classList.add("hidden");
}

// ── Answer checking ──
function checkAnswers(type) {
  if (type === "wordGapFill") {
    let correct = 0, total = 0;
    $$("#wgfPassage .gap").forEach((gap) => {
      total++;
      if (gap.textContent.trim() === gap.dataset.answer) { gap.classList.add("correct"); correct++; }
      else { gap.classList.add("wrong"); gap.textContent = gap.textContent + " ✗(" + gap.dataset.answer + ")"; }
    });
    dom.wgfResult.innerHTML = `<span class="correct-count">正确 ${correct}/${total}</span>`; dom.wgfResult.classList.remove("hidden");
  }
  if (type === "cloze") {
    let correct = 0, total = 0;
    $$(".cloze-select").forEach((sel) => {
      total++;
      if (sel.value === sel.dataset.answer) { sel.style.color = "var(--green)"; sel.style.fontWeight = "700"; correct++; }
      else if (sel.value) sel.style.color = "#c0392b";
    });
    dom.clozeResult.innerHTML = `<span class="correct-count">正确 ${correct}/${total}</span>`; dom.clozeResult.classList.remove("hidden");
  }
  if (type === "sevenChooseFive") {
    let correct = 0, total = 0;
    $$(".scf-select").forEach((sel) => {
      total++;
      if (sel.value === sel.dataset.answer) { sel.style.color = "var(--green)"; sel.style.fontWeight = "700"; correct++; }
      else if (sel.value) sel.style.color = "#c0392b";
    });
    dom.scfResult.innerHTML = `<span class="correct-count">正确 ${correct}/${total}</span>`; dom.scfResult.classList.remove("hidden");
  }
  if (type === "reading") {
    let correct = 0, total = 0;
    $$(".rc-question").forEach((q) => {
      total++;
      const checked = q.querySelector("input[type='radio']:checked");
      const answer = q.querySelector("input[type='radio']")?.dataset.answer;
      if (checked && checked.value === answer) correct++;
      else if (checked) q.style.borderLeft = "3px solid #c0392b";
    });
    dom.rcResult.innerHTML = `<span class="correct-count">正确 ${correct}/${total}</span>`; dom.rcResult.classList.remove("hidden");
  }
}

// ── View switching ──
function showView(tab) {
  state.currentTab = tab;
  $$(".tab-btn").forEach((btn) => btn.classList.toggle("active", btn.dataset.tab === tab));
  dom.viewArticle.classList.toggle("hidden", tab !== "article");
  dom.viewWGF.classList.toggle("hidden", tab !== "wordGapFill");
  dom.viewCloze.classList.toggle("hidden", tab !== "cloze");
  dom.viewSCF.classList.toggle("hidden", tab !== "sevenChooseFive");
  dom.viewReading.classList.toggle("hidden", tab !== "reading");
}

// ── Export ──
function exportPdf() { window.print(); }
function exportWord() {
  let content = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"></head><body>`;
  if (state.article) {
    content += `<h1>${escapeHtml(state.article.title)}</h1>`;
    state.article.paragraphs.forEach((p) => { content += `<p>${escapeHtml(p.text)}</p>`; });
  }
  content += `</body></html>`;
  const blob = new Blob(["﻿" + content], { type: "application/msword" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob);
  a.download = (state.article?.title || "reading") + ".doc"; document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Event handlers ──
dom.btnGenerate.addEventListener("click", async () => {
  const raw = dom.wordInput.value.trim();
  if (!raw) return showError("请输入至少一个单词");
  const words = parseWords(raw);
  if (words.length === 0) return showError("请输入至少一个单词");
  hideError();
  showLoading("正在生成文章...");
  dom.btnGenerate.disabled = true;
  try {
    const data = await generateArticle(words, dom.levelSelect.value);
    renderArticle(data);
    dom.tabBar.classList.remove("hidden");
    dom.btnPdf.disabled = false;
    dom.btnWord.disabled = false;
    dom.btnGenerateEx.disabled = false;
    state.exercises = null;
    showView("article");
  } catch (err) {
    // Error already shown by apiCall for limit-reached case
    if (!err.message.includes("次数已用完")) showError("生成失败：" + err.message);
  } finally { hideLoading(); dom.btnGenerate.disabled = false; }
});

dom.btnGenerateEx.addEventListener("click", async () => {
  if (!state.article) return;
  hideError();
  showLoading("正在生成题目...");
  dom.btnGenerateEx.disabled = true;
  try {
    const data = await generateExercises(state.article, parseWords(dom.wordInput.value.trim()), dom.levelSelect.value);
    state.exercises = data;
    if (data.wordGapFill) renderWordGapFill(data);
    if (data.cloze) renderCloze(data);
    if (data.sevenChooseFive) renderSevenChooseFive(data);
    if (data.readingComprehension) renderReading(data);
    showView("article");
  } catch (err) {
    if (!err.message.includes("次数已用完")) showError("题目生成失败：" + err.message);
  } finally { hideLoading(); dom.btnGenerateEx.disabled = false; }
});

dom.tabBar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  if (!state.exercises && btn.dataset.tab !== "article") { showError("请先生成题目"); return; }
  hideError(); showView(btn.dataset.tab);
});

document.addEventListener("click", (e) => {
  if (e.target.classList.contains("btn-check")) checkAnswers(e.target.dataset.ex);
});

dom.btnPdf.addEventListener("click", exportPdf);
dom.btnWord.addEventListener("click", exportWord);

// ── Init ──
hideError();
updateUsageUI();
// Check for saved unlock code
if (getUnlockCode()) {
  // Assume unlocked until server says otherwise
  state.usage = { remaining: Infinity, limit: 3, unlimited: true };
  updateUsageUI();
}
