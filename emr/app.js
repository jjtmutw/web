const translations = {
  "zh-Hant": {
    appTitle: "多國語健康記錄",
    eyebrow: "個人健康記錄",
    langLabel: "語言",
    themeLabel: "風格",
    heroKicker: "健康資訊摘要",
    heroTitle: "隨身攜帶的多語醫療資訊卡",
    heroDescription:
      "可翻頁檢視基本資料、病史、過敏史、家族史、手術史與用藥史，方便跨國就醫與照護溝通。",
    sectionKicker: "章節",
    prev: "上一頁",
    next: "下一頁",
    qrTitle: "醫療連結 QR Code",
    qrLabel: "網址",
    qrHint: "可輸入個人醫療頁面、雲端病歷或聯絡頁網址，右側會即時生成 QR Code。",
    qrAlt: "健康記錄網址 QR Code",
    pages: [
      { key: "basic", title: "基本資料", description: "身份、聯絡方式與緊急聯絡人。" },
      { key: "history", title: "主要病史", description: "重大慢性病、近期狀況與追蹤摘要。" },
      { key: "allergies", title: "過敏史", description: "藥物、食物與環境過敏反應。" },
      { key: "family", title: "家族史", description: "父母與手足的重要家族疾病背景。" },
      { key: "surgery", title: "手術史", description: "曾接受的手術與侵入性處置紀錄。" },
      { key: "medication", title: "用藥史", description: "目前固定用藥與必要備註。" }
    ],
    themes: { mint: "淡綠健康", rose: "柔粉照護", sand: "淡咖療癒" },
    summaryBadges: [
      { label: "主要語言", value: "五語切換" },
      { label: "顯示模式", value: "翻頁卡冊" },
      { label: "風格主題", value: "3 種色系" },
      { label: "測試資料", value: "可替換 JSON" }
    ],
    fields: {
      fullName: "姓名",
      preferredName: "英文姓名",
      birthDate: "出生日期",
      bloodType: "血型",
      gender: "性別",
      heightCm: "身高",
      weightKg: "體重",
      nationality: "國籍",
      idNumber: "證件號碼",
      phone: "電話",
      email: "電子郵件",
      address: "地址",
      emergencyName: "緊急聯絡人",
      emergencyRelation: "關係",
      emergencyPhone: "緊急聯絡電話",
      insurance: "保險資訊",
      primaryDoctor: "主要醫師",
      hospital: "常用醫院",
      note: "備註"
    },
    cards: { profile: "個人檔案", contact: "聯絡資訊", emergency: "緊急聯絡", care: "照護資訊", list: "紀錄列表", tags: "重點標記" }
  },
  en: {
    appTitle: "Multilingual Health Record",
    eyebrow: "Personal Health Record",
    langLabel: "Language",
    themeLabel: "Theme",
    heroKicker: "Health Snapshot",
    heroTitle: "A portable medical profile for everyday care",
    heroDescription:
      "Flip through personal details, medical history, allergies, family history, surgeries, and medications in multiple languages.",
    sectionKicker: "Section",
    prev: "Previous",
    next: "Next",
    qrTitle: "Medical Link QR Code",
    qrLabel: "URL",
    qrHint: "Enter a personal care page, cloud record, or contact link and a QR code will update instantly.",
    qrAlt: "Health record URL QR code",
    pages: [
      { key: "basic", title: "Basic Profile", description: "Identity, contact details, and emergency contact." },
      { key: "history", title: "Medical History", description: "Chronic conditions and recent follow-up notes." },
      { key: "allergies", title: "Allergies", description: "Drug, food, and environmental reactions." },
      { key: "family", title: "Family History", description: "Relevant conditions among close relatives." },
      { key: "surgery", title: "Surgical History", description: "Past procedures and interventions." },
      { key: "medication", title: "Medication History", description: "Current medicines and instructions." }
    ],
    themes: { mint: "Mint Care", rose: "Soft Rose", sand: "Warm Sand" },
    summaryBadges: [
      { label: "Languages", value: "5 modes" },
      { label: "Viewing", value: "Page flip layout" },
      { label: "Themes", value: "3 palettes" },
      { label: "Dataset", value: "JSON driven" }
    ],
    fields: {
      fullName: "Full name",
      preferredName: "English name",
      birthDate: "Date of birth",
      bloodType: "Blood type",
      gender: "Gender",
      heightCm: "Height",
      weightKg: "Weight",
      nationality: "Nationality",
      idNumber: "ID number",
      phone: "Phone",
      email: "Email",
      address: "Address",
      emergencyName: "Emergency contact",
      emergencyRelation: "Relationship",
      emergencyPhone: "Emergency phone",
      insurance: "Insurance",
      primaryDoctor: "Primary physician",
      hospital: "Preferred hospital",
      note: "Note"
    },
    cards: { profile: "Profile", contact: "Contact", emergency: "Emergency", care: "Care info", list: "Records", tags: "Highlights" }
  },
  ja: {
    appTitle: "多言語ヘルスレコード",
    eyebrow: "個人健康記録",
    langLabel: "言語",
    themeLabel: "テーマ",
    heroKicker: "健康サマリー",
    heroTitle: "持ち歩ける多言語医療プロフィール",
    heroDescription:
      "基本情報、既往歴、アレルギー歴、家族歴、手術歴、服薬情報をページ切替で見やすく確認できます。",
    sectionKicker: "セクション",
    prev: "前へ",
    next: "次へ",
    qrTitle: "医療リンク QR コード",
    qrLabel: "URL",
    qrHint: "個人医療ページ、クラウド記録、連絡先ページのURLを入力すると、右側にQRコードが生成されます。",
    qrAlt: "健康記録URLのQRコード",
    pages: [
      { key: "basic", title: "基本情報", description: "本人情報、連絡先、緊急連絡先。" },
      { key: "history", title: "既往歴", description: "慢性疾患と最近の経過。" },
      { key: "allergies", title: "アレルギー歴", description: "薬剤、食品、環境アレルギー。" },
      { key: "family", title: "家族歴", description: "近親者の主要な病歴。" },
      { key: "surgery", title: "手術歴", description: "過去の手術や処置。" },
      { key: "medication", title: "服薬歴", description: "現在の服薬内容と注意事項。" }
    ],
    themes: { mint: "ミント", rose: "ローズ", sand: "サンド" },
    summaryBadges: [
      { label: "言語", value: "5 言語対応" },
      { label: "表示", value: "ページ切替" },
      { label: "テーマ", value: "3 スタイル" },
      { label: "データ", value: "JSON 管理" }
    ],
    fields: {
      fullName: "氏名",
      preferredName: "英字氏名",
      birthDate: "生年月日",
      bloodType: "血液型",
      gender: "性別",
      heightCm: "身長",
      weightKg: "体重",
      nationality: "国籍",
      idNumber: "ID番号",
      phone: "電話",
      email: "メール",
      address: "住所",
      emergencyName: "緊急連絡先",
      emergencyRelation: "続柄",
      emergencyPhone: "緊急電話",
      insurance: "保険情報",
      primaryDoctor: "主治医",
      hospital: "利用病院",
      note: "備考"
    },
    cards: { profile: "プロフィール", contact: "連絡先", emergency: "緊急連絡", care: "診療情報", list: "記録一覧", tags: "重要項目" }
  },
  ko: {
    appTitle: "다국어 건강 기록",
    eyebrow: "개인 건강 기록",
    langLabel: "언어",
    themeLabel: "테마",
    heroKicker: "건강 요약",
    heroTitle: "휴대 가능한 다국어 의료 프로필",
    heroDescription:
      "기본 정보, 병력, 알레르기, 가족력, 수술력, 복용 약물을 페이지 방식으로 빠르게 확인할 수 있습니다.",
    sectionKicker: "섹션",
    prev: "이전",
    next: "다음",
    qrTitle: "의료 링크 QR 코드",
    qrLabel: "URL",
    qrHint: "개인 의료 페이지, 클라우드 기록, 연락처 링크를 입력하면 오른쪽 QR 코드가 즉시 갱신됩니다.",
    qrAlt: "건강 기록 URL QR 코드",
    pages: [
      { key: "basic", title: "기본 정보", description: "신원, 연락처, 비상 연락처." },
      { key: "history", title: "주요 병력", description: "만성 질환과 최근 추적 경과." },
      { key: "allergies", title: "알레르기", description: "약물, 음식, 환경 반응." },
      { key: "family", title: "가족력", description: "가까운 가족의 주요 질환." },
      { key: "surgery", title: "수술력", description: "과거 수술 및 시술 기록." },
      { key: "medication", title: "복약 이력", description: "현재 복용약과 지침." }
    ],
    themes: { mint: "민트", rose: "로즈", sand: "샌드" },
    summaryBadges: [
      { label: "언어", value: "5개 언어" },
      { label: "레이아웃", value: "페이지 전환" },
      { label: "테마", value: "3가지 팔레트" },
      { label: "데이터", value: "JSON 기반" }
    ],
    fields: {
      fullName: "이름",
      preferredName: "영문 이름",
      birthDate: "생년월일",
      bloodType: "혈액형",
      gender: "성별",
      heightCm: "키",
      weightKg: "몸무게",
      nationality: "국적",
      idNumber: "신분 번호",
      phone: "전화",
      email: "이메일",
      address: "주소",
      emergencyName: "비상 연락처",
      emergencyRelation: "관계",
      emergencyPhone: "비상 전화",
      insurance: "보험 정보",
      primaryDoctor: "주치의",
      hospital: "주 이용 병원",
      note: "메모"
    },
    cards: { profile: "프로필", contact: "연락처", emergency: "비상 연락", care: "진료 정보", list: "기록 목록", tags: "중요 표시" }
  },
  vi: {
    appTitle: "Hồ sơ sức khỏe đa ngôn ngữ",
    eyebrow: "Hồ sơ sức khỏe cá nhân",
    langLabel: "Ngôn ngữ",
    themeLabel: "Phong cách",
    heroKicker: "Tóm tắt sức khỏe",
    heroTitle: "Hồ sơ y tế đa ngôn ngữ mang theo mọi lúc",
    heroDescription:
      "Xem theo từng trang các thông tin cá nhân, bệnh sử, dị ứng, tiền sử gia đình, phẫu thuật và thuốc đang dùng.",
    sectionKicker: "Mục",
    prev: "Trước",
    next: "Tiếp",
    qrTitle: "Mã QR liên kết y tế",
    qrLabel: "URL",
    qrHint: "Nhập liên kết hồ sơ y tế, trang chăm sóc hoặc trang liên hệ để tạo QR Code ngay bên phải.",
    qrAlt: "Mã QR URL hồ sơ sức khỏe",
    pages: [
      { key: "basic", title: "Thông tin cơ bản", description: "Danh tính, liên hệ và người liên lạc khẩn cấp." },
      { key: "history", title: "Bệnh sử", description: "Bệnh mạn tính và ghi chú theo dõi gần đây." },
      { key: "allergies", title: "Dị ứng", description: "Dị ứng thuốc, thực phẩm và môi trường." },
      { key: "family", title: "Tiền sử gia đình", description: "Các bệnh quan trọng trong gia đình." },
      { key: "surgery", title: "Tiền sử phẫu thuật", description: "Phẫu thuật và thủ thuật trước đây." },
      { key: "medication", title: "Lịch sử dùng thuốc", description: "Thuốc hiện tại và hướng dẫn sử dụng." }
    ],
    themes: { mint: "Xanh sức khỏe", rose: "Hồng nhẹ", sand: "Nâu nhạt" },
    summaryBadges: [
      { label: "Ngôn ngữ", value: "5 lựa chọn" },
      { label: "Giao diện", value: "Lật trang" },
      { label: "Màu sắc", value: "3 chủ đề" },
      { label: "Dữ liệu", value: "Tách JSON" }
    ],
    fields: {
      fullName: "Họ tên",
      preferredName: "Tên tiếng Anh",
      birthDate: "Ngày sinh",
      bloodType: "Nhóm máu",
      gender: "Giới tính",
      heightCm: "Chiều cao",
      weightKg: "Cân nặng",
      nationality: "Quốc tịch",
      idNumber: "Số giấy tờ",
      phone: "Điện thoại",
      email: "Email",
      address: "Địa chỉ",
      emergencyName: "Liên hệ khẩn cấp",
      emergencyRelation: "Quan hệ",
      emergencyPhone: "SĐT khẩn cấp",
      insurance: "Bảo hiểm",
      primaryDoctor: "Bác sĩ chính",
      hospital: "Bệnh viện thường dùng",
      note: "Ghi chú"
    },
    cards: { profile: "Hồ sơ", contact: "Liên hệ", emergency: "Khẩn cấp", care: "Thông tin chăm sóc", list: "Danh sách", tags: "Điểm nổi bật" }
  }
};

const state = { language: "zh-Hant", theme: "mint", pageIndex: 0, data: null };

const els = {
  appTitle: document.querySelector("#appTitle"),
  eyebrow: document.querySelector("#eyebrow"),
  langLabel: document.querySelector("#langLabel"),
  themeLabel: document.querySelector("#themeLabel"),
  heroKicker: document.querySelector("#heroKicker"),
  heroTitle: document.querySelector("#heroTitle"),
  heroDescription: document.querySelector("#heroDescription"),
  sectionKicker: document.querySelector("#sectionKicker"),
  sectionTitle: document.querySelector("#sectionTitle"),
  pageIndicator: document.querySelector("#pageIndicator"),
  pageList: document.querySelector("#pageList"),
  recordPage: document.querySelector("#recordPage"),
  languageSelect: document.querySelector("#languageSelect"),
  themeSelect: document.querySelector("#themeSelect"),
  prevButton: document.querySelector("#prevButton"),
  nextButton: document.querySelector("#nextButton"),
  summaryBadges: document.querySelector("#summaryBadges")
};

const languageNames = {
  "zh-Hant": "繁體中文",
  en: "English",
  ja: "日本語",
  ko: "한국어",
  vi: "Tiếng Việt"
};

init();

function init() {
  state.data = window.profileData;
  setupSelectors();
  setupEvents();
  render();
}

function setupSelectors() {
  Object.entries(languageNames).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    els.languageSelect.append(option);
  });

  Object.entries(translations["zh-Hant"].themes).forEach(([value, label]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    els.themeSelect.append(option);
  });

  els.languageSelect.value = state.language;
  els.themeSelect.value = state.theme;
}

function setupEvents() {
  els.languageSelect.addEventListener("change", (event) => {
    state.language = event.target.value;
    render();
  });

  els.themeSelect.addEventListener("change", (event) => {
    state.theme = event.target.value;
    document.body.dataset.theme = state.theme;
    renderThemeOptions();
  });

  els.prevButton.addEventListener("click", () => {
    state.pageIndex = (state.pageIndex - 1 + currentPages().length) % currentPages().length;
    renderPageArea();
  });

  els.nextButton.addEventListener("click", () => {
    state.pageIndex = (state.pageIndex + 1) % currentPages().length;
    renderPageArea();
  });
}

function render() {
  document.documentElement.lang = state.language;
  document.body.dataset.theme = state.theme;
  renderLabels();
  renderThemeOptions();
  renderSummaryBadges();
  renderPageList();
  renderPageArea();
}

function renderLabels() {
  const t = currentT();
  els.appTitle.textContent = t.appTitle;
  els.eyebrow.textContent = t.eyebrow;
  els.langLabel.textContent = t.langLabel;
  els.themeLabel.textContent = t.themeLabel;
  els.heroKicker.textContent = t.heroKicker;
  els.heroTitle.textContent = t.heroTitle;
  els.heroDescription.textContent = t.heroDescription;
  els.sectionKicker.textContent = t.sectionKicker;
  els.prevButton.textContent = t.prev;
  els.nextButton.textContent = t.next;
}

function renderThemeOptions() {
  const t = currentT();
  Array.from(els.themeSelect.options).forEach((option) => {
    option.textContent = t.themes[option.value];
  });
}

function renderSummaryBadges() {
  const t = currentT();
  els.summaryBadges.innerHTML = "";
  t.summaryBadges.forEach((badge) => {
    const item = document.createElement("div");
    item.className = "summary-badge";
    item.innerHTML = `<p class="chip-label">${badge.label}</p><strong>${badge.value}</strong>`;
    els.summaryBadges.append(item);
  });
}

function renderPageList() {
  const t = currentT();
  els.pageList.innerHTML = "";

  t.pages.forEach((page, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `page-tab${index === state.pageIndex ? " active" : ""}`;
    button.innerHTML = `
      <span class="page-tab-index">${String(index + 1).padStart(2, "0")}</span>
      <span class="page-tab-title">${page.title}</span>
      <span class="page-tab-description">${page.description}</span>
    `;
    button.addEventListener("click", () => {
      state.pageIndex = index;
      renderPageArea();
      renderPageList();
    });
    els.pageList.append(button);
  });
}

function renderPageArea() {
  const pages = currentPages();
  const page = pages[state.pageIndex];
  els.sectionTitle.textContent = page.title;
  els.pageIndicator.textContent = `${state.pageIndex + 1} / ${pages.length}`;
  renderPageList();
  els.recordPage.innerHTML = page.renderer();
  if (page.key === "medication") {
    attachQrHandlers();
  }
}

function currentPages() {
  const t = currentT();
  const d = localizedData();
  const c = t.cards;
  const f = t.fields;

  return [
    {
      ...t.pages[0],
      renderer: () => `
        <section class="section-grid">
          <div class="content-card">
            <p class="eyebrow">${c.profile}</p>
            <h4>${t.pages[0].title}</h4>
            ${renderKvList([
              [f.fullName, d.basic.fullName],
              [f.preferredName, d.basic.preferredName],
              [f.birthDate, d.basic.birthDate],
              [f.gender, d.basic.gender],
              [f.bloodType, d.basic.bloodType],
              [f.nationality, d.basic.nationality]
            ])}
          </div>
          <div class="content-card">
            <p class="eyebrow">${c.profile}</p>
            <h4>${c.tags}</h4>
            ${renderChipRow([
              `${f.heightCm}: ${d.basic.heightCm}`,
              `${f.weightKg}: ${d.basic.weightKg}`,
              `${f.idNumber}: ${d.basic.idNumber}`
            ])}
          </div>
          <div class="content-card">
            <p class="eyebrow">${c.contact}</p>
            <h4>${c.contact}</h4>
            ${renderKvList([
              [f.phone, d.contact.phone],
              [f.email, d.contact.email],
              [f.address, d.contact.address]
            ])}
          </div>
          <div class="content-card">
            <p class="eyebrow">${c.emergency}</p>
            <h4>${c.emergency}</h4>
            ${renderKvList([
              [f.emergencyName, d.emergency.name],
              [f.emergencyRelation, d.emergency.relation],
              [f.emergencyPhone, d.emergency.phone]
            ])}
          </div>
          <div class="content-card full">
            <p class="eyebrow">${c.care}</p>
            <h4>${c.care}</h4>
            ${renderKvList([
              [f.insurance, d.care.insurance],
              [f.primaryDoctor, d.care.primaryDoctor],
              [f.hospital, d.care.hospital],
              [f.note, d.care.note]
            ])}
          </div>
        </section>
      `
    },
    { ...t.pages[1], renderer: () => renderHistorySection(d.medicalHistory) },
    { ...t.pages[2], renderer: () => renderHistorySection(d.allergies) },
    { ...t.pages[3], renderer: () => renderHistorySection(d.familyHistory) },
    { ...t.pages[4], renderer: () => renderHistorySection(d.surgicalHistory) },
    {
      ...t.pages[5],
      renderer: () => `
        ${renderHistorySection(d.medicationHistory)}
        <div class="content-card full">
          <p class="eyebrow">QR Code</p>
          <h4>${t.qrTitle}</h4>
          <div class="qr-block">
            <div class="qr-form">
              <label for="qrUrlInput">${t.qrLabel}</label>
              <input
                id="qrUrlInput"
                class="qr-input"
                type="url"
                value="https://example.com/health-record/annie-chen"
                placeholder="https://example.com/..."
              />
              <p class="qr-note">${t.qrHint}</p>
            </div>
            <div class="qr-preview">
              <img id="qrImage" alt="${t.qrAlt}" />
              <strong id="qrCaption">QR</strong>
            </div>
          </div>
        </div>
      `
    }
  ];
}

function renderHistorySection(items) {
  if (!items.length) {
    return `<div class="empty-state">No data</div>`;
  }

  return `
    <div class="content-card full">
      <p class="eyebrow">${currentT().cards.list}</p>
      <h4>${currentPages()[state.pageIndex].title}</h4>
      <ul class="history-list">
        ${items
          .map(
            (item) => `
          <li>
            <div class="history-title">
              <strong>${item.title}</strong>
              <span class="history-tag">${item.period}</span>
            </div>
            <div class="history-body">${item.details}</div>
          </li>
        `
          )
          .join("")}
      </ul>
    </div>
  `;
}

function renderKvList(items) {
  return `
    <ul class="kv-list">
      ${items
        .map(
          ([label, value]) => `
        <li>
          <span class="item-label">${label}</span>
          <span class="item-value">${value}</span>
        </li>
      `
        )
        .join("")}
    </ul>
  `;
}

function renderChipRow(items) {
  return `<div class="chip-row">${items
    .map((item) => `<span class="chip">${item}</span>`)
    .join("")}</div>`;
}

function attachQrHandlers() {
  const input = document.querySelector("#qrUrlInput");
  const image = document.querySelector("#qrImage");
  const caption = document.querySelector("#qrCaption");
  if (!input || !image || !caption) {
    return;
  }

  const update = () => {
    const value = input.value.trim() || "https://example.com/health-record/annie-chen";
    image.src = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(value)}`;
    caption.textContent = value.replace(/^https?:\/\//, "");
  };

  input.addEventListener("input", update);
  update();
}

function currentT() {
  return translations[state.language];
}

function localizedData() {
  const lang = state.language;
  const data = state.data;
  const pick = (value) => (typeof value === "string" ? value : value[lang] || value.en);

  return {
    basic: {
      fullName: pick(data.basic.fullName),
      preferredName: data.basic.preferredName,
      birthDate: data.basic.birthDate,
      bloodType: data.basic.bloodType,
      gender: pick(data.basic.gender),
      heightCm: `${data.basic.heightCm} cm`,
      weightKg: `${data.basic.weightKg} kg`,
      nationality: pick(data.basic.nationality),
      idNumber: data.basic.idNumber
    },
    contact: {
      phone: data.contact.phone,
      email: data.contact.email,
      address: pick(data.contact.address)
    },
    emergency: {
      name: pick(data.emergency.name),
      relation: pick(data.emergency.relation),
      phone: data.emergency.phone
    },
    care: {
      insurance: pick(data.care.insurance),
      primaryDoctor: pick(data.care.primaryDoctor),
      hospital: pick(data.care.hospital),
      note: pick(data.care.note)
    },
    medicalHistory: data.medicalHistory.map(localizeItem),
    allergies: data.allergies.map(localizeItem),
    familyHistory: data.familyHistory.map(localizeItem),
    surgicalHistory: data.surgicalHistory.map(localizeItem),
    medicationHistory: data.medicationHistory.map(localizeItem)
  };

  function localizeItem(item) {
    return {
      title: pick(item.title),
      period: pick(item.period),
      details: pick(item.details)
    };
  }
}
