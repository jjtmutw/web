// app.js (offline-friendly, reads from data.js)
const $ = (id) => document.getElementById(id);

function detectLang() {
  const saved = localStorage.getItem("tmed_lang");
  if (saved && window.I18N && I18N[saved]) return saved;

  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("ja")) return "ja";
  if (nav.startsWith("ko")) return "ko";
  return "en";
}

function setText(id, text) {
  const el = $(id);
  if (el) el.textContent = text ?? "—";
}

function applyI18n(lang) {
  const t = (window.I18N && I18N[lang]) ? I18N[lang] : (I18N?.en || {});

  setText("ui_title", t.ui_title);
  setText("ui_sub", t.ui_sub);

  setText("sec_emergency", t.sec_emergency);
  setText("sec_ident", t.sec_ident);
  setText("sec_meds", t.sec_meds);
  setText("sec_history", t.sec_history);
  setText("sec_tests", t.sec_tests);
  setText("sec_qr", t.sec_qr);
  setText("sec_contact", t.sec_contact);
  setText("sec_ins", t.sec_ins);
  setText("sec_files", t.sec_files);

  setText("ui_qr_hint", t.ui_qr_hint);
  setText("ui_files_hint", t.ui_files_hint);
  setText("ui_privacy", t.ui_privacy);

  setText("lbl_allergies", t.lbl_allergies);
  setText("lbl_conditions", t.lbl_conditions);
  setText("hint_meds", t.hint_meds);

  $("btnPrint").textContent = t.btnPrint;
  $("btnReload").textContent = t.btnReload;

  return t;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (m) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  }[m]));
}

function pill(label, value) {
  const span = document.createElement("span");
  span.className = "pill";
  span.innerHTML = `${escapeHtml(label)}: <strong>${escapeHtml(value ?? "—")}</strong>`;
  return span;
}

function renderKvs(container, items) {
  container.innerHTML = "";
  for (const [k, v] of items) {
    const kEl = document.createElement("div");
    kEl.className = "k";
    kEl.textContent = k;

    const vEl = document.createElement("div");
    vEl.className = "v";
    vEl.textContent = v ?? "—";

    container.appendChild(kEl);
    container.appendChild(vEl);
  }
}

function renderMedTable(container, t, meds) {
  if (!Array.isArray(meds) || meds.length === 0) {
    container.innerHTML = `<div class="muted">—</div>`;
    return;
  }

  const table = document.createElement("table");
  table.innerHTML = `
    <thead>
      <tr>
        <th>${escapeHtml(t.t_med_generic)}</th>
        <th>${escapeHtml(t.t_med_brand)}</th>
        <th>${escapeHtml(t.t_med_dose)}</th>
        <th>${escapeHtml(t.t_med_freq)}</th>
        <th>${escapeHtml(t.t_med_for)}</th>
      </tr>
    </thead>
    <tbody></tbody>
  `;
  const tb = table.querySelector("tbody");

  meds.forEach(m => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(m.generic)}</td>
      <td>${escapeHtml(m.brand || "")}</td>
      <td>${escapeHtml(m.dose)}</td>
      <td class="mono">${escapeHtml(m.frequency)}</td>
      <td>${escapeHtml(m.indication)}</td>
    `;
    tb.appendChild(tr);
  });

  container.innerHTML = "";
  container.appendChild(table);
}

function renderFiles(container, files) {
  container.innerHTML = "";
  if (!Array.isArray(files) || files.length === 0) {
    container.innerHTML = `<div class="muted">—</div>`;
    return;
  }
  const ul = document.createElement("div");
  ul.style.display = "flex";
  ul.style.flexDirection = "column";
  ul.style.gap = "8px";

  for (const f of files) {
    const a = document.createElement("a");
    a.className = "btn";
    a.href = f.url;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = f.label || f.url;
    ul.appendChild(a);
  }
  container.appendChild(ul);
}

function renderQr(url) {
  $("pageUrl").textContent = url;

  const q = $("qrcode");
  q.innerHTML = "";

  // If file:// and QR library blocked, just show the URL text.
  if (typeof QRCode === "undefined") {
    q.innerHTML = `<div class="small muted">QR library not loaded.</div>`;
    return;
  }

  // eslint-disable-next-line no-undef
  new QRCode(q, {
    text: url,
    width: 200,
    height: 200,
    correctLevel: QRCode.CorrectLevel.M
  });
}

function formatTestList(tests) {
  if (!Array.isArray(tests) || tests.length === 0) return "—";
  return tests.map(x => `${x.name}: ${x.value || "—"} (${x.date || "—"})`).join("; ");
}

function getDataOrThrow() {
  if (!window.TRAVEL_MED_DATA) {
    throw new Error("data.js not loaded. Please ensure <script src='data.js'></script> is included before app.js");
  }
  return window.TRAVEL_MED_DATA;
}

function initUI() {
  const lang = detectLang();
  $("langSelect").value = lang;

  $("langSelect").addEventListener("change", async (e) => {
    localStorage.setItem("tmed_lang", e.target.value);
    await boot();
  });

  $("btnPrint").addEventListener("click", () => window.print());
  $("btnReload").addEventListener("click", async () => await boot());

  // show current page URL + QR
  const url = location.href;
  renderQr(url);
}

async function boot() {
  const lang = $("langSelect")?.value || detectLang();
  const t = applyI18n(lang);

  let data;
  try {
    data = getDataOrThrow();
  } catch (err) {
    alert(err.message);
    return;
  }

  const p = data.person || {};

  // Photo
  const photo = $("profilePhoto");
  if (photo) {
    if (p.photo_path) {
      photo.src = p.photo_path;
      photo.style.display = "block";
    } else {
      photo.style.display = "none";
    }
  }

  // Header / hero
  setText("p_name", p.full_name);

  const hero = $("heroPills");
  hero.innerHTML = "";
  hero.appendChild(pill(t.k_dob, p.dob));
  hero.appendChild(pill(t.k_blood, p.blood_type || "—"));
  hero.appendChild(pill(t.k_passport, p.passport_no));
  hero.appendChild(pill(t.k_nationality, p.nationality));
  hero.appendChild(pill(t.k_sex, p.sex));
  hero.appendChild(pill(t.k_language, p.preferred_language));

  const em = data.emergency || {};
  setText("p_allergies", (em.allergies || []).join("\n") || "—");
  setText("p_conditions", (em.major_conditions || []).join("\n") || "—");

  // Identification
  renderKvs($("identKvs"), [
    [t.k_full_name, p.full_name],
    [t.k_dob, p.dob],
    [t.k_passport, p.passport_no],
    [t.k_nationality, p.nationality],
    [t.k_blood, p.blood_type || "—"],
    [t.k_sex, p.sex],
    [t.k_language, p.preferred_language]
  ]);

  // Medications
  renderMedTable($("medTableWrap"), t, data.medications || []);

  // Travel critical + History
  const tc = data.travel_critical || {};
  const dnr = tc.dnr || {};
  const anti = tc.antithrombotic || {};
  const ckd = tc.ckd || {};
  const dm = tc.diabetes_control || {};
  const vax = Array.isArray(tc.vaccines)
    ? tc.vaccines.map(v => `${v.name}${v.date ? " (" + v.date + ")" : ""}`).join("; ")
    : "—";

  const h = data.history || {};
  renderKvs($("historyKvs"), [
    [t.k_dnr, `${dnr.status || "—"}${dnr.note ? " — " + dnr.note : ""}`],
    [t.k_anticoag, `Anticoagulants: ${(anti.anticoagulants || ["—"]).join(", ")}; Antiplatelets: ${(anti.antiplatelets || ["—"]).join(", ")}`],
    [t.k_ckd, `${ckd.has_ckd || "—"}${ckd.stage ? " / Stage " + ckd.stage : ""}${ckd.egfr ? " / eGFR " + ckd.egfr : ""}`],
    [t.k_diabetes_control, `HbA1c: ${dm.latest_hba1c || "—"} (${dm.hba1c_date || "—"}); ${dm.hypoglycemia_risk_note || ""}`],
    [t.k_vaccines, vax],

    [t.k_surgeries, (tc.major_surgeries || h.surgeries || []).join("; ") || "—"],
    [t.k_implants, (h.implants_devices || []).join("; ") || "—"],
    [t.k_chronic, (h.chronic_history || []).join("; ") || "—"],
    [t.k_notes, (h.important_notes || []).join("; ") || "—"]
  ]);

  // Tests
  const tests = data.tests || [];
  renderKvs($("testsKvs"), [
    [t.k_tests, formatTestList(tests)]
  ]);

  // Contact
  const c = data.contact || {};
  renderKvs($("contactKvs"), [
    [t.k_primary_physician, c.primary_physician],
    [t.k_contact_name, c.emergency_contact_name],
    [t.k_contact_relation, c.emergency_contact_relation],
    [t.k_contact_phone, c.emergency_contact_phone]
  ]);

  // Insurance
  const ins = data.insurance || {};
  renderKvs($("insKvs"), [
    [t.k_ins_company, ins.company],
    [t.k_ins_policy, ins.policy_no],
    [t.k_ins_hotline, ins.international_hotline]
  ]);

  // Attachments
  renderFiles($("filesList"), data.attachments || []);

  // Stamp
  const last = data.meta?.last_updated || "—";
  $("lastUpdated").textContent = `Last updated: ${last}`;
}

document.addEventListener("DOMContentLoaded", async () => {
  initUI();
  await boot();
});
