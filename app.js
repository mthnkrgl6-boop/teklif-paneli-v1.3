(() => {
  const STORAGE_KEY = "teklif-paneli-state-v1";
  const defaultState = {
    priceLists: {
      plastic: [],
      metal: [],
      radiator: []
    },
    priceMeta: {},
    requests: [],
    demand: [],
    notes: "",
    discounts: {
      plastic: 0,
      metal: 0,
      radiator: 0
    },
    vatRate: 20
  };

  let state = structuredClone(defaultState);

  const priceTableBodies = {
    plastic: document.querySelector("tbody.price-table[data-type='plastic']"),
    metal: document.querySelector("tbody.price-table[data-type='metal']"),
    radiator: document.querySelector("tbody.price-table[data-type='radiator']")
  };

  const requestTable = document.getElementById("requestTable");
  const demandTable = document.getElementById("demandTable");
  const offerTable = document.getElementById("offerTable");
  const subtotalCell = document.getElementById("subtotalCell");
  const vatCell = document.getElementById("vatCell");
  const totalCell = document.getElementById("totalCell");

  const requestSelect = document.getElementById("requestSelect");
  const categorySelect = document.getElementById("categorySelect");
  const productSelect = document.getElementById("productSelect");
  const quantityInput = document.getElementById("quantityInput");
  const notesArea = document.getElementById("requestNotes");
  const discountInputs = {
    plastic: document.getElementById("plasticDiscount"),
    metal: document.getElementById("metalDiscount"),
    radiator: document.getElementById("radiatorDiscount")
  };
  const vatInput = document.getElementById("vatRate");

  function structuredClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        state = structuredClone(defaultState);
        return;
      }
      const parsed = JSON.parse(raw);
      state = {
        ...structuredClone(defaultState),
        ...parsed,
        priceLists: {
          ...structuredClone(defaultState.priceLists),
          ...(parsed.priceLists || {})
        },
        discounts: {
          ...structuredClone(defaultState.discounts),
          ...(parsed.discounts || {})
        }
      };
    } catch (error) {
      console.error("Veri yüklenirken hata oluştu", error);
      state = structuredClone(defaultState);
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function formatCurrency(value) {
    if (!Number.isFinite(value)) return "-";
    return new Intl.NumberFormat("tr-TR", {
      style: "currency",
      currency: "TRY"
    }).format(value);
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(1)}%`;
  }

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "-";
    const units = ["B", "KB", "MB", "GB"];
    let size = bytes;
    let unit = units.shift();
    while (size >= 1024 && units.length) {
      size /= 1024;
      unit = units.shift();
    }
    return `${size.toFixed(size >= 10 || unit === "B" ? 0 : 1)} ${unit}`;
  }

  function parseNumber(value) {
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
    if (typeof value !== "string") return NaN;
    const trimmed = value.trim().replace(/[₺tryTRY\s]/g, "");
    if (!trimmed) return NaN;
    const hasComma = trimmed.includes(",");
    const hasDot = trimmed.includes(".");
    let normalised = trimmed;
    if (hasComma && hasDot) {
      normalised = trimmed.replace(/\./g, "").replace(/,/g, ".");
    } else if (hasComma && !hasDot) {
      normalised = trimmed.replace(/,/g, ".");
    }
    const result = Number(normalised);
    return Number.isFinite(result) ? result : NaN;
  }

  function detectPrice(row) {
    const preferredKeys = [
      "Birim Fiyatı",
      "BirimFiyatı",
      "Birim Fiyat",
      "Birim fiyat",
      "Fiyat",
      "BirimFiyat",
      "Unit Price",
      "UnitPrice",
      "Price",
      "Fiyat (TL)",
      "Net Fiyat",
      "Satış Fiyatı"
    ];
    for (const key of preferredKeys) {
      if (key in row) {
        const parsed = parseNumber(row[key]);
        if (!Number.isNaN(parsed)) return parsed;
      }
    }
    for (const key of Object.keys(row)) {
      const value = row[key];
      if (value === null || value === undefined) continue;
      const parsed = parseNumber(value);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
    return NaN;
  }

  function detectName(row, fallback) {
    const nameKeys = [
      "Ürün",
      "Ürün Adı",
      "Urun",
      "Urun Adı",
      "Ürün Kodu",
      "Malzeme",
      "Stok Adı",
      "Stok",
      "Product",
      "Name",
      "Description",
      "Açıklama"
    ];
    for (const key of nameKeys) {
      if (row[key]) {
        return String(row[key]);
      }
    }
    const firstKey = Object.keys(row)[0];
    if (firstKey) {
      return String(row[firstKey]);
    }
    return fallback;
  }

  function detectDescription(row) {
    const keys = ["Açıklama", "Description", "Detay", "Özellik", "Notes"];
    for (const key of keys) {
      if (row[key]) return String(row[key]);
    }
    return "";
  }

  function detectUnit(row) {
    const keys = ["Birim", "Unit", "Ölçü", "Measure"];
    for (const key of keys) {
      if (row[key]) return String(row[key]);
    }
    return "Adet";
  }

  function generateId(prefix) {
    return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
  }

  function parsePriceList(type, rows) {
    const items = [];
    rows.forEach((row, index) => {
      const unitPrice = detectPrice(row);
      if (Number.isNaN(unitPrice)) return;
      const name = detectName(row, `${type} ürün ${index + 1}`);
      const description = detectDescription(row);
      const unit = detectUnit(row);
      items.push({
        id: generateId(type),
        category: type,
        name,
        description,
        unit,
        unitPrice,
        source: row
      });
    });
    return items;
  }

  function readFileAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(file);
    });
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  }

  async function handlePriceUpload(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const type = form.dataset.type;
    const input = form.querySelector(".price-upload-input");
    if (!input.files.length) return;
    const file = input.files[0];
    try {
      const buffer = await readFileAsArrayBuffer(file);
      const workbook = XLSX.read(buffer, { type: "array" });
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });
      const parsed = parsePriceList(type, rows);
      if (!parsed.length) {
        alert("Listede okunabilir ürün bulunamadı. Lütfen sütun başlıklarını kontrol edin.");
        return;
      }
      state.priceLists[type] = parsed;
      state.priceMeta[type] = {
        fileName: file.name,
        uploadedAt: new Date().toISOString()
      };
      saveState();
      renderPriceTables();
      updateProductOptions();
      alert(`${file.name} listesi başarıyla yüklendi (${parsed.length} satır).`);
    } catch (error) {
      console.error("Fiyat listesi okunamadı", error);
      alert("Fiyat listesi okunurken bir hata oluştu. Dosya formatını kontrol edin.");
    } finally {
      form.reset();
    }
  }

  async function handleRequestUpload(event) {
    event.preventDefault();
    const input = document.getElementById("requestFile");
    if (!input.files.length) return;
    const now = new Date().toISOString();
    for (const file of Array.from(input.files)) {
      try {
        let dataUrl = null;
        if (file.size <= 2 * 1024 * 1024) {
          dataUrl = await readFileAsDataUrl(file);
        }
        state.requests.push({
          id: generateId("request"),
          name: file.name,
          size: file.size,
          type: file.type,
          uploadedAt: now,
          dataUrl
        });
      } catch (error) {
        console.error("Belge okunamadı", error);
      }
    }
    saveState();
    renderRequests();
    updateRequestOptions();
    alert(`${input.files.length} belge kaydedildi.`);
    event.currentTarget.reset();
  }

  function updateRequestOptions() {
    requestSelect.innerHTML = "";
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Talep belgesi seçin (opsiyonel)";
    requestSelect.appendChild(placeholder);
    state.requests.forEach((req) => {
      const option = document.createElement("option");
      option.value = req.id;
      option.textContent = req.name;
      requestSelect.appendChild(option);
    });
  }

  function updateProductOptions() {
    const category = categorySelect.value;
    productSelect.innerHTML = "";
    if (!category || !state.priceLists[category].length) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = category ? "Fiyat listesi boş" : "Önce kategori seçin";
      productSelect.appendChild(option);
      productSelect.disabled = true;
      return;
    }
    productSelect.disabled = false;
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "Ürün seçin";
    productSelect.appendChild(placeholder);
    state.priceLists[category].forEach((item) => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.name} (${formatCurrency(item.unitPrice)})`;
      productSelect.appendChild(option);
    });
  }

  function renderPriceTables() {
    ("plastic,metal,radiator".split(",")).forEach((category) => {
      const tbody = priceTableBodies[category];
      tbody.innerHTML = "";
      const items = state.priceLists[category] || [];
      if (!items.length) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.textContent = "Henüz veri yok";
        cell.classList.add("muted");
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("tr");
        row.innerHTML = `
          <td>${item.name}</td>
          <td>${item.description || "-"}</td>
          <td>${item.unit || "Adet"}</td>
          <td>${formatCurrency(item.unitPrice)}</td>
        `;
        tbody.appendChild(row);
      });
    });
  }

  function countDemandForRequest(requestId) {
    return state.demand.filter((item) => item.requestId === requestId).length;
  }

  function renderRequests() {
    requestTable.innerHTML = "";
    if (!state.requests.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 4;
      cell.textContent = "Kayıtlı talep belgesi yok.";
      row.appendChild(cell);
      requestTable.appendChild(row);
      return;
    }
    state.requests.forEach((req) => {
      const row = document.createElement("tr");
      const linked = countDemandForRequest(req.id);
      const date = req.uploadedAt
        ? new Intl.DateTimeFormat("tr-TR", {
            dateStyle: "short",
            timeStyle: "short"
          }).format(new Date(req.uploadedAt))
        : "-";
      const noteText = linked
        ? `${linked} kalem talebe dönüştürüldü.`
        : "Talep listesine aktarılmayı bekliyor.";
      const downloadHtml = req.dataUrl
        ? `<a class="btn" download="${req.name}" href="${req.dataUrl}">İndir</a>`
        : "Önizleme yok";
      row.innerHTML = `
        <td>
          <strong>${req.name}</strong><br /><span class="muted">${req.type || "Dosya"}</span>
        </td>
        <td>${formatBytes(req.size)}</td>
        <td>${date}</td>
        <td>${noteText}<br />${downloadHtml}</td>
      `;
      requestTable.appendChild(row);
    });
    notesArea.value = state.notes || "";
  }

  function renderDemandTable() {
    demandTable.innerHTML = "";
    if (!state.demand.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 7;
      cell.textContent = "Henüz talep eklenmedi.";
      row.appendChild(cell);
      demandTable.appendChild(row);
      return;
    }
    state.demand.forEach((item) => {
      const requestLabel = item.requestId
        ? (state.requests.find((r) => r.id === item.requestId)?.name || "Belge bulunamadı")
        : "Belirtilmedi";
      const row = document.createElement("tr");
      row.dataset.id = item.id;
      row.innerHTML = `
        <td>${requestLabel}</td>
        <td>${labelForCategory(item.category)}</td>
        <td>${item.productName}</td>
        <td><input type="number" min="1" value="${item.quantity}" class="quantity-input" data-id="${item.id}" /></td>
        <td>${item.unit || "Adet"}</td>
        <td>${formatCurrency(item.unitPrice)}</td>
        <td><button class="btn danger" data-action="remove" data-id="${item.id}">Sil</button></td>
      `;
      demandTable.appendChild(row);
    });
  }

  function labelForCategory(category) {
    switch (category) {
      case "plastic":
        return "Plastik";
      case "metal":
        return "Metal";
      case "radiator":
        return "Radyatör";
      default:
        return category;
    }
  }

  function renderOfferTable() {
    offerTable.innerHTML = "";
    if (!state.demand.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 8;
      cell.textContent = "Teklif listesi boş.";
      row.appendChild(cell);
      offerTable.appendChild(row);
      subtotalCell.textContent = formatCurrency(0);
      vatCell.textContent = formatCurrency(0);
      totalCell.textContent = formatCurrency(0);
      return;
    }
    let subtotal = 0;
    let vatTotal = 0;
    const vatRate = Number(state.vatRate || 0) / 100;
    state.demand.forEach((item) => {
      const discountRate = Number(state.discounts[item.category] || 0);
      const discountedUnit = item.unitPrice * (1 - discountRate / 100);
      const lineSubtotal = discountedUnit * item.quantity;
      const lineVat = lineSubtotal * vatRate;
      const lineTotal = lineSubtotal + lineVat;
      subtotal += lineSubtotal;
      vatTotal += lineVat;
      const row = document.createElement("tr");
      row.innerHTML = `
        <td>${labelForCategory(item.category)}</td>
        <td>${item.productName}</td>
        <td>${item.quantity}</td>
        <td>${formatCurrency(item.unitPrice)}</td>
        <td>${formatPercent(discountRate)}</td>
        <td>${formatCurrency(discountedUnit)}</td>
        <td>${formatCurrency(discountedUnit * (1 + vatRate))}</td>
        <td>${formatCurrency(lineTotal)}</td>
      `;
      offerTable.appendChild(row);
    });
    subtotalCell.textContent = formatCurrency(subtotal);
    vatCell.textContent = formatCurrency(vatTotal);
    totalCell.textContent = formatCurrency(subtotal + vatTotal);
  }

  function handleDemandSubmit(event) {
    event.preventDefault();
    const category = categorySelect.value;
    const productId = productSelect.value;
    const quantity = Number(quantityInput.value || 0);
    if (!category) {
      alert("Lütfen kategori seçin.");
      return;
    }
    if (!productId) {
      alert("Lütfen ürün seçin.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
      alert("Adet 1 veya daha büyük olmalıdır.");
      return;
    }
    const product = state.priceLists[category].find((item) => item.id === productId);
    if (!product) {
      alert("Seçilen ürün bulunamadı.");
      return;
    }
    state.demand.push({
      id: generateId("demand"),
      requestId: requestSelect.value || null,
      category,
      productId,
      productName: product.name,
      unit: product.unit,
      unitPrice: product.unitPrice,
      quantity
    });
    saveState();
    renderDemandTable();
    renderOfferTable();
    renderRequests();
    event.currentTarget.reset();
    productSelect.disabled = true;
  }

  function handleDemandTableInput(event) {
    if (event.target.matches("input.quantity-input")) {
      const id = event.target.dataset.id;
      const quantity = Number(event.target.value);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        event.target.value = 1;
        return;
      }
      const item = state.demand.find((entry) => entry.id === id);
      if (item) {
        item.quantity = quantity;
        saveState();
        renderOfferTable();
        renderRequests();
      }
    }
  }

  function handleDemandTableClick(event) {
    if (event.target.matches("button[data-action='remove']")) {
      const id = event.target.dataset.id;
      state.demand = state.demand.filter((item) => item.id !== id);
      saveState();
      renderDemandTable();
      renderOfferTable();
      renderRequests();
    }
  }

  function handleDiscountChange(event) {
    const field = event.target.id.replace("Discount", "").toLowerCase();
    const value = Number(event.target.value || 0);
    if (field in state.discounts) {
      state.discounts[field] = Math.min(Math.max(value, 0), 100);
      event.target.value = state.discounts[field];
      saveState();
      renderOfferTable();
    }
  }

  function handleVatChange(event) {
    const value = Number(event.target.value || 0);
    state.vatRate = Math.min(Math.max(value, 0), 100);
    event.target.value = state.vatRate;
    saveState();
    renderOfferTable();
  }

  function handleNotesChange(event) {
    state.notes = event.target.value;
    saveState();
  }

  function exportOffer() {
    if (!state.demand.length) {
      alert("Dışa aktarılacak teklif satırı bulunmuyor.");
      return;
    }
    const vatRate = Number(state.vatRate || 0) / 100;
    const rows = state.demand.map((item) => {
      const discountRate = Number(state.discounts[item.category] || 0);
      const discountedUnit = item.unitPrice * (1 - discountRate / 100);
      const lineSubtotal = discountedUnit * item.quantity;
      const lineVat = lineSubtotal * vatRate;
      const lineTotal = lineSubtotal + lineVat;
      return {
        Kategori: labelForCategory(item.category),
        Ürün: item.productName,
        Adet: item.quantity,
        Birim: item.unit,
        "Birim Fiyatı": item.unitPrice,
        "İskonto (%)": discountRate,
        "İskontolu Birim": discountedUnit,
        "KDV Dahil Birim": discountedUnit * (1 + vatRate),
        "Satır Toplamı": lineTotal
      };
    });
    const subtotal = rows.reduce((sum, row) => sum + row["İskontolu Birim"] * row["Adet"], 0);
    const vatTotal = subtotal * vatRate;
    const wb = XLSX.utils.book_new();
    const header = [
      [
        "Kategori",
        "Ürün",
        "Adet",
        "Birim",
        "Birim Fiyatı",
        "İskonto (%)",
        "İskontolu Birim",
        "KDV Dahil Birim",
        "Satır Toplamı"
      ]
    ];
    const dataRows = rows.map((row) => [
      row.Kategori,
      row.Ürün,
      row.Adet,
      row.Birim,
      row["Birim Fiyatı"],
      row["İskonto (%)"],
      row["İskontolu Birim"],
      row["KDV Dahil Birim"],
      row["Satır Toplamı"]
    ]);
    const summary = [
      [],
      ["Ara Toplam", "", "", "", "", "", subtotal],
      ["KDV", "", "", "", "", "", vatTotal],
      ["Genel Toplam", "", "", "", "", "", subtotal + vatTotal]
    ];
    const ws = XLSX.utils.aoa_to_sheet([...header, ...dataRows, ...summary]);
    XLSX.utils.book_append_sheet(wb, ws, "Teklif");
    XLSX.writeFile(wb, "teklif_listesi.xlsx");
  }

  function clearAllData() {
    if (!confirm("Tüm verileri silmek istediğinize emin misiniz?")) {
      return;
    }
    state = structuredClone(defaultState);
    saveState();
    renderAll();
  }

  function renderAll() {
    renderPriceTables();
    renderRequests();
    renderDemandTable();
    renderOfferTable();
    updateProductOptions();
    updateRequestOptions();
    notesArea.value = state.notes || "";
    discountInputs.plastic.value = state.discounts.plastic;
    discountInputs.metal.value = state.discounts.metal;
    discountInputs.radiator.value = state.discounts.radiator;
    vatInput.value = state.vatRate;
  }

  function init() {
    loadState();
    renderAll();
    document
      .querySelectorAll("form.upload-form[data-type]")
      .forEach((form) => form.addEventListener("submit", handlePriceUpload));
    document
      .getElementById("request-upload-form")
      .addEventListener("submit", handleRequestUpload);
    categorySelect.addEventListener("change", updateProductOptions);
    document.getElementById("demand-form").addEventListener("submit", handleDemandSubmit);
    demandTable.addEventListener("input", handleDemandTableInput);
    demandTable.addEventListener("click", handleDemandTableClick);
    Object.values(discountInputs).forEach((input) => input.addEventListener("input", handleDiscountChange));
    vatInput.addEventListener("input", handleVatChange);
    notesArea.addEventListener("input", handleNotesChange);
    document.getElementById("exportOffer").addEventListener("click", exportOffer);
    document.getElementById("clearAll").addEventListener("click", clearAllData);
  }

  document.addEventListener("DOMContentLoaded", init);
})();
