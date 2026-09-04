/* ==========================================================
   price-filter.js — Earth Property (TEP)
   Reusable price-range filter panel (presets + custom range)
   Drop this file next to translations.js / lang.js and include:
   <script src="price-filter.js"></script>
   ========================================================== */

(function () {

  // ---------- 1. PRESET RANGES ----------
  // "rentLike": Rent, PG, CommercialRent — monthly amounts
  // "saleLike": Sell, Plot, Commercial, RentSell(sell side) — one-time amounts
  const PRICE_PRESETS = {
    rentLike: [
      { label: "Under ₹8,000",         min: 0,     max: 8000 },
      { label: "₹8,000 – ₹12,000",     min: 8000,  max: 12000 },
      { label: "₹12,000 – ₹18,000",    min: 12000, max: 18000 },
      { label: "₹18,000 – ₹25,000",    min: 18000, max: 25000 },
      { label: "Above ₹25,000",        min: 25000, max: null }
    ],
    saleLike: [
      { label: "Under ₹5 Lac",         min: 0,       max: 500000 },
      { label: "₹5 Lac – ₹10 Lac",     min: 500000,  max: 1000000 },
      { label: "₹10 Lac – ₹15 Lac",    min: 1000000, max: 1500000 },
      { label: "₹15 Lac – ₹25 Lac",    min: 1500000, max: 2500000 },
      { label: "₹25 Lac – ₹50 Lac",    min: 2500000, max: 5000000 },
      { label: "₹50 Lac – ₹1 Cr",      min: 5000000, max: 10000000 },
      { label: "Above ₹1 Cr",          min: 10000000, max: null }
    ]
  };

  // Which purpose values use which preset list.
  // NOTE: "RentSell" / "CommercialRentSell" listings have BOTH sellPrice & rentPrice.
  // Pass the correct category string yourself when opening the filter —
  // e.g. if your homepage "Rent" button also includes RentSell listings,
  // open with category 'rentLike' and filter on the `rentPrice` field on the city page.
  const CATEGORY_MAP = {
    Rent: "rentLike",
    PG: "rentLike",
    CommercialRent: "rentLike",
    Sell: "saleLike",
    Plot: "saleLike",
    CommercialSell: "saleLike",
    RentSell: "saleLike",            // caller decides sellPrice vs rentPrice field
    CommercialRentSell: "saleLike"
  };

  // ---------- 2. STYLES (injected once) ----------
  function injectStyles() {
    if (document.getElementById("pf-styles")) return;
    const css = `
    .pf-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9500;display:none;align-items:flex-end;justify-content:center;}
    .pf-overlay.open{display:flex;}
    .pf-sheet{background:#fff;width:100%;max-width:480px;border-radius:20px 20px 0 0;padding:18px 18px 22px;box-shadow:0 -6px 24px rgba(0,0,0,0.25);animation:pfSlideUp 0.25s ease;max-height:80vh;overflow-y:auto;box-sizing:border-box;}
    @keyframes pfSlideUp{from{transform:translateY(100%);}to{transform:translateY(0);}}
    .pf-handle{width:40px;height:4px;background:#ddd;border-radius:4px;margin:0 auto 14px;}
    .pf-title{font-size:16px;font-weight:700;color:#2e7d32;margin-bottom:4px;display:flex;align-items:center;justify-content:space-between;}
    .pf-title .pf-close{cursor:pointer;color:#999;font-size:20px;padding:4px 8px;}
    .pf-sub{font-size:12px;color:#888;margin-bottom:14px;}
    .pf-option{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1.5px solid #e0e0e0;border-radius:12px;margin-bottom:8px;cursor:pointer;font-size:14px;font-weight:600;color:#333;transition:0.15s;}
    .pf-option:active{transform:scale(0.98);}
    .pf-option.selected{border-color:#2e7d32;background:#e8f5e9;color:#2e7d32;}
    .pf-radio{width:18px;height:18px;border-radius:50%;border:2px solid #ccc;flex-shrink:0;display:flex;align-items:center;justify-content:center;}
    .pf-option.selected .pf-radio{border-color:#2e7d32;}
    .pf-option.selected .pf-radio::after{content:'';width:10px;height:10px;border-radius:50%;background:#2e7d32;}
    .pf-custom-box{display:none;gap:10px;margin:10px 0 4px;}
    .pf-custom-box.open{display:flex;}
    .pf-custom-box input{flex:1;padding:11px;border:1.5px solid #ddd;border-radius:10px;font-size:13px;box-sizing:border-box;}
    .pf-apply{width:100%;padding:14px;background:#2e7d32;color:#fff;border:none;border-radius:12px;font-size:15px;font-weight:700;margin-top:14px;cursor:pointer;}
    .pf-apply:disabled{background:#aaa;}
    .pf-clear{width:100%;padding:10px;background:none;border:none;color:#d32f2f;font-size:13px;font-weight:600;margin-top:8px;cursor:pointer;}
    `;
    const style = document.createElement("style");
    style.id = "pf-styles";
    style.textContent = css;
    document.head.appendChild(style);
  }

  // ---------- 3. BUILD PANEL DOM (once) ----------
  let overlayEl, selectedRange = null, activeCallback = null;

  function buildPanel() {
    if (document.getElementById("pfOverlay")) return;
    const wrap = document.createElement("div");
    wrap.className = "pf-overlay";
    wrap.id = "pfOverlay";
    wrap.innerHTML = `
      <div class="pf-sheet">
        <div class="pf-handle"></div>
        <div class="pf-title">
          <span id="pfTitle">Select Price Range</span>
          <span class="pf-close" id="pfCloseBtn">&times;</span>
        </div>
        <div class="pf-sub">Tap a range, or enter your own below</div>
        <div id="pfOptionsList"></div>
        <div class="pf-option" id="pfCustomToggle">
          <div class="pf-radio"></div>
          <span>Custom Range</span>
        </div>
        <div class="pf-custom-box" id="pfCustomBox">
          <input type="number" id="pfCustomMin" placeholder="Min ₹" min="0">
          <input type="number" id="pfCustomMax" placeholder="Max ₹" min="0">
        </div>
        <button class="pf-apply" id="pfApplyBtn" disabled>Apply Filter</button>
        <button class="pf-clear" id="pfClearBtn">Clear Selection</button>
      </div>
    `;
    document.body.appendChild(wrap);
    overlayEl = wrap;

    document.getElementById("pfCloseBtn").onclick = closePanel;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) closePanel(); });

    document.getElementById("pfCustomToggle").onclick = function () {
      selectedRange = { custom: true };
      highlightSelection(this);
      document.getElementById("pfCustomBox").classList.add("open");
      validateApply();
    };

    document.getElementById("pfCustomMin").addEventListener("input", validateApply);
    document.getElementById("pfCustomMax").addEventListener("input", validateApply);

    document.getElementById("pfApplyBtn").onclick = applySelection;
    document.getElementById("pfClearBtn").onclick = function () {
      selectedRange = null;
      if (activeCallback) activeCallback(null); // null = no price filter
      closePanel();
    };
  }

  function highlightSelection(el) {
    document.querySelectorAll(".pf-option").forEach(o => o.classList.remove("selected"));
    el.classList.add("selected");
    if (el.id !== "pfCustomToggle") {
      document.getElementById("pfCustomBox").classList.remove("open");
    }
  }

  function validateApply() {
    const btn = document.getElementById("pfApplyBtn");
    if (!selectedRange) { btn.disabled = true; return; }
    if (selectedRange.custom) {
      const min = document.getElementById("pfCustomMin").value;
      const max = document.getElementById("pfCustomMax").value;
      btn.disabled = !(min !== "" && max !== "" && Number(min) >= 0 && Number(max) > Number(min));
    } else {
      btn.disabled = false;
    }
  }

  function applySelection() {
    let result;
    if (selectedRange.custom) {
      result = {
        min: Number(document.getElementById("pfCustomMin").value),
        max: Number(document.getElementById("pfCustomMax").value)
      };
    } else {
      result = { min: selectedRange.min, max: selectedRange.max };
    }
    if (activeCallback) activeCallback(result);
    closePanel();
  }

  function closePanel() {
    overlayEl.classList.remove("open");
  }

  // ---------- 4. PUBLIC API ----------
  // PriceFilter.open(purposeValue, callback)
  //   purposeValue: 'Rent' | 'PG' | 'Sell' | 'Plot' | 'CommercialRent' | 'CommercialSell' | 'RentSell' | 'CommercialRentSell'
  //   callback(range): range = {min, max} on Apply, or null if user clears
  //   max === null means "no upper limit" (open-ended, e.g. "Above ₹25,000")
  window.PriceFilter = {
    open: function (purposeValue, callback) {
      injectStyles();
      buildPanel();
      const category = CATEGORY_MAP[purposeValue] || "saleLike";
      const presets = PRICE_PRESETS[category];

      activeCallback = callback;
      selectedRange = null;

      document.getElementById("pfTitle").textContent =
        (category === "rentLike" ? "Monthly Rent Range" : "Price Range");

      const list = document.getElementById("pfOptionsList");
      list.innerHTML = presets.map((p, i) => `
        <div class="pf-option" data-i="${i}">
          <div class="pf-radio"></div>
          <span>${p.label}</span>
        </div>
      `).join("");

      list.querySelectorAll(".pf-option").forEach(el => {
        el.onclick = function () {
          const idx = Number(this.dataset.i);
          selectedRange = presets[idx];
          highlightSelection(this);
          validateApply();
        };
      });

      document.getElementById("pfCustomMin").value = "";
      document.getElementById("pfCustomMax").value = "";
      document.getElementById("pfCustomBox").classList.remove("open");
      document.getElementById("pfApplyBtn").disabled = true;

      overlayEl.classList.add("open");
    }
  };

  // ---------- 5. FIRESTORE QUERY HELPER (use on city pages) ----------
  // Usage:
  //   let q = db.collection('properties').where('city','==','Kochi');
  //   q = PriceFilter.applyToQuery(q, 'price', minMaxObj);
  //   Firestore rule: only ONE field can have a range (>=, <=) filter combined
  //   with orderBy on a different field unless you orderBy the same field first.
  window.PriceFilter.applyToQuery = function (query, fieldName, range) {
    if (!range) return query; // no filter
    if (typeof range.min === "number") {
      query = query.where(fieldName, ">=", range.min);
    }
    if (typeof range.max === "number" && range.max !== null) {
      query = query.where(fieldName, "<=", range.max);
    }
    return query;
  };

})();
