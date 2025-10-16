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

  function normalisePriceItem(item, category) {
    if (!item || typeof item !== "object") return null;
    const normalised = {
      ...item,
      category: item.category || category,
      name: String(item.name || "").trim(),
      description: String(item.description || "").trim(),
      code: String(item.code || "").trim(),
      unit: item.unit || "Adet"
    };
    normalised.id = item.id || generateId(category || "item");
    const price = Number(item.unitPrice);
    normalised.unitPrice = Number.isFinite(price) ? price : 0;
    const aliases = Array.isArray(item.aliases) ? item.aliases : [];
    const aliasSet = new Set();
    aliases.forEach((alias) => {
      if (typeof alias === "string" && alias.trim()) {
        aliasSet.add(alias.trim());
      }
    });
    if (normalised.name) aliasSet.add(normalised.name);
    if (normalised.description) aliasSet.add(normalised.description);
    if (normalised.code) aliasSet.add(normalised.code);
    normalised.aliases = Array.from(aliasSet).slice(0, 12);
    return normalised;
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
      state.requests = (state.requests || []).map((req) => ({
        ...req,
        extractedProducts: Array.isArray(req && req.extractedProducts) ? req.extractedProducts : [],
        extractionNote: typeof (req && req.extractionNote) === "string" ? req.extractionNote : ""
      }));
      state.requests.forEach((req) => {
        req.extractedProducts = req.extractedProducts.map((product) => ({
          ...product,
          productName: String(product.productName || "").trim(),
          productCode: String(product.productCode || "").trim(),
          category: product.category || ""
        }));
      });
      Object.keys(state.priceLists).forEach((category) => {
        const list = Array.isArray(state.priceLists[category]) ? state.priceLists[category] : [];
        state.priceLists[category] = list
          .map((item) => normalisePriceItem(item, category))
          .filter(Boolean);
      });
      state.demand = (state.demand || []).map((item) => {
        const quantity = Number(item.quantity);
        const unitPrice = Number(item.unitPrice);
        return {
          ...item,
          productName: String(item.productName || "").trim(),
          productCode: String(item.productCode || "").trim(),
          unit: item.unit || "Adet",
          unitPrice: Number.isFinite(unitPrice) ? unitPrice : 0,
          quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1
        };
      });
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

  function looksLikeSku(value) {
    if (value === null || value === undefined) return false;
    const text = String(value).trim();
    if (!text) return false;
    if (/\s/.test(text)) return false;
    if (text.length <= 3) return true;
    const hasDigit = /\d/.test(text);
    const hasLetter = /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(text);
    if (!hasLetter && hasDigit) return true;
    if (hasDigit && hasLetter) {
      const letterCount = (text.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) || []).length;
      if (letterCount <= 3) return true;
      if (/^[A-ZÇĞİÖŞÜ0-9_.\-]+$/.test(text)) return true;
    }
    if (!hasDigit && /^[A-ZÇĞİÖŞÜ]{2,4}$/.test(text)) return true;
    return false;
  }

  function normaliseKey(key) {
    return String(key || "")
      .toLocaleLowerCase("tr-TR")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isCodeKey(key) {
    const lower = normaliseKey(key);
    if (!lower) return false;
    return ["kod", "ürün kod", "urun kod", "stok kod", "product code", "item code", "sku", "malzeme kod"].some(
      (token) => lower.includes(token)
    );
  }

  function detectCode(row) {
    if (!row || typeof row !== "object") return "";
    let codeCandidate = "";
    Object.entries(row).forEach(([key, value]) => {
      if (codeCandidate) return;
      if (!isCodeKey(key)) return;
      const text = String(value || "").trim();
      if (!text) return;
      if (looksLikeSku(text) || text.length <= 32) {
        codeCandidate = text;
      }
    });
    if (codeCandidate) return codeCandidate;
    for (const value of Object.values(row)) {
      const text = String(value || "").trim();
      if (!text) continue;
      if (looksLikeSku(text)) {
        return text;
      }
    }
    return "";
  }

  function detectName(row, fallback, existingCode = "") {
    if (!row || typeof row !== "object") return fallback;
    const preferredNameKeys = [
      "Ürün",
      "Ürün Adı",
      "Urun",
      "Urun Adı",
      "Ürün İsmi",
      "Product Name",
      "Product",
      "Malzeme",
      "Stok Adı",
      "Stok",
      "Name"
    ];
    let candidate = null;
    let codeCandidate = null;
    const seen = new Set();
    const codeNormalised = String(existingCode || "").trim().toLocaleLowerCase("tr-TR");
    const consider = (key) => {
      if (!key || seen.has(key)) return;
      seen.add(key);
      if (isCodeKey(key)) return;
      if (!(key in row)) return;
      const value = row[key];
      if (value === null || value === undefined) return;
      const text = String(value).trim();
      if (!text) return;
      if (codeNormalised && text.trim().toLocaleLowerCase("tr-TR") === codeNormalised) return;
      if (!looksLikeSku(text)) {
        if (!candidate) {
          candidate = text;
        }
      } else if (!codeCandidate) {
        codeCandidate = text;
      }
    };

    preferredNameKeys.forEach(consider);

    if (candidate) return candidate;

    const description = detectDescription(row, "", existingCode);
    if (description) return description;

    const additionalKeys = [
      "Description",
      "Ürün Açıklaması",
      "Ürün Açiklaması",
      "Urun Açıklaması",
      "Urun Aciklamasi",
      "Açıklama",
      "Aciklama"
    ];

    additionalKeys.forEach(consider);
    if (candidate) return candidate;

    if (codeCandidate) return codeCandidate;

    for (const value of Object.values(row)) {
      const text = String(value || "").trim();
      if (!text) continue;
      if (codeNormalised && text.trim().toLocaleLowerCase("tr-TR") === codeNormalised) continue;
      if (!looksLikeSku(text)) return text;
      if (!codeCandidate) codeCandidate = text;
    }

    return codeCandidate || fallback;
  }

  function detectDescription(row, fallback = "", existingCode = "") {
    const keys = [
      "Açıklama",
      "Aciklama",
      "Ürün Açıklaması",
      "Ürün Açiklaması",
      "Urun Açıklaması",
      "Urun Aciklamasi",
      "Description",
      "Detay",
      "Özellik",
      "Notes"
    ];
    for (const key of keys) {
      if (!row || !(key in row)) continue;
      if (isCodeKey(key)) continue;
      const text = String(row[key] || "").trim();
      if (!text) continue;
      if (existingCode && text.toLocaleLowerCase("tr-TR") === existingCode.toLocaleLowerCase("tr-TR")) continue;
      if (looksLikeSku(text)) continue;
      return text;
    }
    if (fallback && !looksLikeSku(fallback)) {
      return fallback;
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

  function shouldIncludeAlias(value) {
    if (value === null || value === undefined) return false;
    if (typeof value === "number") return false;
    const text = String(value).trim();
    if (!text) return false;
    if (text.length <= 2) return false;
    const numericCandidate = parseNumber(text);
    return Number.isNaN(numericCandidate);
  }

  function collectAliasesFromRow(row, name, description, code) {
    const aliases = new Set();
    if (name) aliases.add(String(name));
    if (description) aliases.add(String(description));
    if (code) aliases.add(String(code));
    Object.values(row || {}).forEach((value) => {
      if (shouldIncludeAlias(value)) {
        aliases.add(String(value).trim());
      }
    });
    return Array.from(aliases).slice(0, 12);
  }

  function generateId(prefix) {
    return `${prefix}-${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
  }

  function parsePriceList(type, rows) {
    const items = [];
    rows.forEach((row, index) => {
      const unitPrice = detectPrice(row);
      if (Number.isNaN(unitPrice)) return;
      const fallbackName = `${type} ürün ${index + 1}`;
      const code = detectCode(row);
      const detectedName = detectName(row, fallbackName, code);
      const rawDescription = detectDescription(row, "", code);
      let name = (detectedName || "").trim() || fallbackName;
      let description = (rawDescription || "").trim();
      const originalName = name;
      if (looksLikeSku(name) && description && !looksLikeSku(description)) {
        const code = name;
        name = description;
        description = code;
      } else if (!description && looksLikeSku(name)) {
        description = name;
      }
      if (description && description.trim() === name.trim()) {
        description = "";
      }
      if (description && looksLikeSku(description)) {
        description = "";
      }
      if (!description && looksLikeSku(originalName) && !looksLikeSku(name)) {
        description = originalName;
      }
      const unit = detectUnit(row);
      const aliases = collectAliasesFromRow(row, name, description, code);
      items.push({
        id: generateId(type),
        category: type,
        name,
        description,
        code,
        unit,
        unitPrice,
        source: row,
        aliases
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

  function readFileAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsText(file);
    });
  }

  function normaliseForMatch(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .toLocaleLowerCase("tr-TR")
      .replace(/[^a-z0-9ğüşöçıİ]+/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function gatherItemAliases(item) {
    if (Array.isArray(item.aliases) && item.aliases.length) {
      return item.aliases;
    }
    const aliases = new Set();
    if (item.name) aliases.add(item.name);
    if (item.description) aliases.add(item.description);
    if (item.code) aliases.add(item.code);
    if (item.source) {
      Object.values(item.source).forEach((value) => {
        if (shouldIncludeAlias(value)) {
          aliases.add(String(value).trim());
        }
      });
    }
    return Array.from(aliases);
  }

  function matchProductByName(candidate) {
    const candidateNormalised = normaliseForMatch(candidate);
    if (!candidateNormalised) return null;
    let bestMatch = null;
    Object.keys(state.priceLists).forEach((category) => {
      state.priceLists[category].forEach((item) => {
        const aliases = gatherItemAliases(item);
        aliases.forEach((alias) => {
          const aliasNormalised = normaliseForMatch(alias);
          if (!aliasNormalised) return;
          if (
            candidateNormalised === aliasNormalised ||
            candidateNormalised.includes(aliasNormalised) ||
            aliasNormalised.includes(candidateNormalised)
          ) {
            const score = aliasNormalised.length;
            if (!bestMatch || score > bestMatch.score) {
              bestMatch = { item, score };
            }
          }
        });
      });
    });
    return bestMatch ? bestMatch.item : null;
  }

  function detectQuantity(row) {
    if (!row || typeof row !== "object") return null;
    const preferredKeys = [
      "Adet",
      "Adedi",
      "Adet Sayısı",
      "Miktar",
      "Mıktar",
      "Miktarı",
      "Qty",
      "Quantity",
      "Quantity Requested"
    ];
    for (const key of preferredKeys) {
      if (key in row) {
        const value = parseNumber(row[key]);
        if (Number.isFinite(value) && value > 0) {
          return value;
        }
      }
    }
    for (const [key, value] of Object.entries(row)) {
      const lowerKey = key.toLocaleLowerCase("tr-TR");
      if (lowerKey.includes("adet") || lowerKey.includes("miktar") || lowerKey.includes("qty")) {
        const parsed = parseNumber(value);
        if (Number.isFinite(parsed) && parsed > 0) {
          return parsed;
        }
      }
    }
    return null;
  }

  function detectQuantityFromLine(line) {
    if (!line) return null;
    const adetMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(adet|pcs|paket|kutu|kg|mt|metre|set|takım|pair)/i);
    if (adetMatch) {
      const value = parseNumber(adetMatch[1]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    const xMatch = line.match(/(?:x|×|\*)\s*(\d{1,4})/i);
    if (xMatch) {
      const value = parseNumber(xMatch[1]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    const leadingMatch = line.match(/^(\d{1,4})\b/);
    if (leadingMatch) {
      const value = parseNumber(leadingMatch[1]);
      if (Number.isFinite(value) && value > 0) {
        return value;
      }
    }
    return null;
  }

  function sanitiseQuantity(value) {
    if (value === null || value === undefined) return 1;
    const numeric = typeof value === "string" ? parseNumber(value) : Number(value);
    if (!Number.isFinite(numeric) || numeric <= 0) return 1;
    return Math.max(1, Math.round(numeric));
  }

  function dedupeMatches(matches) {
    const map = new Map();
    matches.forEach((match) => {
      if (!match || !match.item) return;
      const key = match.item.id;
      const quantity = sanitiseQuantity(match.quantity);
      if (!map.has(key)) {
        map.set(key, { ...match, quantity });
      } else {
        const existing = map.get(key);
        if (quantity > existing.quantity) {
          existing.quantity = quantity;
        }
      }
    });
    return Array.from(map.values());
  }

  function extractMatchesFromWorkbook(workbook) {
    if (!workbook) return [];
    const matches = [];
    workbook.SheetNames.forEach((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      rows.forEach((row) => {
        const code = detectCode(row);
        const candidateName = detectName(row, undefined, code);
        if (!candidateName) return;
        const product = matchProductByName(candidateName);
        if (!product) return;
        const quantity =
          detectQuantity(row) || detectQuantityFromLine(Object.values(row).join(" ")) || 1;
        matches.push({
          item: product,
          quantity,
          source: candidateName
        });
      });
    });
    return matches;
  }

  function findMatchesInText(text) {
    if (!text) return [];
    const matches = [];
    const seenLines = new Set();
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .forEach((line) => {
        if (seenLines.has(line)) return;
        seenLines.add(line);
        const product = matchProductByName(line);
        if (product) {
          matches.push({
            item: product,
            quantity: detectQuantityFromLine(line) || 1,
            source: line
          });
        }
      });
    if (matches.length) {
      return matches;
    }
    const normalisedText = ` ${normaliseForMatch(text)} `;
    if (!normalisedText.trim()) return [];
    const fallbackMatches = [];
    Object.keys(state.priceLists).forEach((category) => {
      state.priceLists[category].forEach((item) => {
        gatherItemAliases(item).forEach((alias) => {
          const aliasNormalised = normaliseForMatch(alias);
          if (!aliasNormalised) return;
          if (normalisedText.includes(` ${aliasNormalised} `)) {
            fallbackMatches.push({
              item,
              quantity: 1,
              source: alias
            });
          }
        });
      });
    });
    return fallbackMatches;
  }

  function applyMatchesToDemand(requestId, matches) {
    const normalisedMatches = dedupeMatches(matches);
    let added = 0;
    let updated = 0;
    normalisedMatches.forEach((match) => {
      const existing = state.demand.find(
        (item) => item.requestId === requestId && item.productId === match.item.id
      );
      if (existing) {
        existing.productName = match.item.name;
        existing.productCode = match.item.code;
        existing.unit = match.item.unit;
        existing.unitPrice = match.item.unitPrice;
        if (match.quantity > existing.quantity) {
          existing.quantity = match.quantity;
          updated += 1;
        }
        return;
      }
      state.demand.push({
        id: generateId("demand"),
        requestId,
        category: match.item.category,
        productId: match.item.id,
        productName: match.item.name,
        productCode: match.item.code,
        unit: match.item.unit,
        unitPrice: match.item.unitPrice,
        quantity: match.quantity
      });
      added += 1;
    });
    return { added, updated, total: matches.length, normalisedMatches };
  }

  function hasAnyPriceList() {
    return Object.values(state.priceLists).some((list) => Array.isArray(list) && list.length);
  }

  function getFileExtension(fileName) {
    const parts = String(fileName || "").split(".");
    if (parts.length <= 1) return "";
    return parts.pop().toLowerCase();
  }

  async function extractTextFromPdf(buffer) {
    if (!window.pdfjsLib || !pdfjsLib.getDocument) {
      return { text: "", note: "PDF analiz kütüphanesi yüklenemedi." };
    }
    try {
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      let text = "";
      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        const pageText = content.items.map((item) => item.str || "").join(" ");
        text += `${pageText}\n`;
      }
      return { text, note: "" };
    } catch (error) {
      console.error("PDF metni çıkarılamadı", error);
      return { text: "", note: "PDF metni okunamadı." };
    }
  }

  async function extractTextFromImage(file) {
    if (!window.Tesseract || !Tesseract.recognize) {
      return { text: "", note: "Görüntüden metin çıkarma desteği bulunmuyor." };
    }
    try {
      const result = await Tesseract.recognize(file, "tur+eng");
      const text = result?.data?.text || "";
      return { text, note: "" };
    } catch (error) {
      console.error("Görüntü metni çıkarılamadı", error);
      return { text: "", note: "Görüntüden metin okunamadı." };
    }
  }

  async function autoExtractFromRequestFile(file, requestRecord) {
    if (!hasAnyPriceList()) {
      return {
        extractedProducts: [],
        extractionNote: "Fiyat listesi olmadan otomatik çıkarım yapılamıyor.",
        addedCount: 0
      };
    }

    const extension = getFileExtension(file.name);
    let matches = [];
    let extractionNote = "";
    try {
      if (["xlsx", "xls"].includes(extension)) {
        const buffer = await readFileAsArrayBuffer(file);
        const workbook = XLSX.read(buffer, { type: "array" });
        matches = extractMatchesFromWorkbook(workbook);
      } else if (extension === "csv") {
        const text = await readFileAsText(file);
        const workbook = XLSX.read(text, { type: "string" });
        matches = extractMatchesFromWorkbook(workbook);
      } else if (extension === "pdf") {
        const buffer = await readFileAsArrayBuffer(file);
        const { text, note } = await extractTextFromPdf(buffer);
        if (!text) {
          extractionNote = note || "PDF metni okunamadı.";
        }
        matches = text ? findMatchesInText(text) : [];
      } else if (file.type && file.type.startsWith("image/")) {
        const { text, note } = await extractTextFromImage(file);
        if (!text) {
          extractionNote = note || "Görüntüden metin okunamadı.";
        }
        matches = text ? findMatchesInText(text) : [];
      } else if (file.type && file.type.startsWith("text/")) {
        const text = await readFileAsText(file);
        matches = text ? findMatchesInText(text) : [];
      } else {
        const text = await readFileAsText(file).catch(() => "");
        matches = text ? findMatchesInText(text) : [];
        if (!matches.length && !text) {
          extractionNote = "Dosya formatı otomatik çıkartma için desteklenmiyor.";
        }
      }
    } catch (error) {
      console.error("Talep belgesi işlenirken hata oluştu", error);
      return {
        extractedProducts: [],
        extractionNote: "Belge işlenirken hata oluştu. Ürün çıkarılamadı.",
        addedCount: 0
      };
    }

    if (!matches.length) {
      return {
        extractedProducts: [],
        extractionNote: extractionNote || "Belgeden ürün eşleştirilemedi.",
        addedCount: 0
      };
    }

    const result = applyMatchesToDemand(requestRecord.id, matches);
    const extractedProducts = result.normalisedMatches.map((match) => ({
      productId: match.item.id,
      productName: match.item.name,
      productCode: match.item.code,
      category: match.item.category,
      quantity: match.quantity
    }));

    let note = extractionNote;
    if (result.added) {
      note = `${result.added} ürün otomatik olarak talep listesine eklendi.`;
    } else if (result.updated) {
      note = "Var olan talep kalemleri belgeye göre güncellendi.";
    } else if (!note) {
      note = "Eşleşen ürünler zaten talep listesinde yer alıyor.";
    }

    return {
      extractedProducts,
      extractionNote: note,
      addedCount: result.added
    };
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
      const parsed = parsePriceList(type, rows).map((item) => normalisePriceItem(item, type)).filter(Boolean);
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
    const files = Array.from(input.files || []);
    if (!files.length) return;
    const now = new Date().toISOString();
    let totalAutoAdded = 0;
    const createdRequests = [];
    for (const file of files) {
      const requestRecord = {
        id: generateId("request"),
        name: file.name,
        size: file.size,
        type: file.type,
        uploadedAt: now,
        dataUrl: null,
        extractedProducts: [],
        extractionNote: ""
      };
      try {
        if (file.size <= 2 * 1024 * 1024) {
          requestRecord.dataUrl = await readFileAsDataUrl(file);
        }
      } catch (error) {
        console.error("Belge önizlemesi hazırlanamadı", error);
      }
      const extraction = await autoExtractFromRequestFile(file, requestRecord);
      requestRecord.extractedProducts = extraction.extractedProducts;
      requestRecord.extractionNote = extraction.extractionNote;
      totalAutoAdded += extraction.addedCount || 0;
      state.requests.push(requestRecord);
      createdRequests.push(requestRecord);
    }
    saveState();
    renderRequests();
    renderDemandTable();
    renderOfferTable();
    updateRequestOptions();
    const messageParts = [`${createdRequests.length} belge kaydedildi.`];
    if (totalAutoAdded) {
      messageParts.push(`${totalAutoAdded} ürün otomatik eklendi.`);
    }
    alert(messageParts.join(" "));
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
      const nameWithCode = item.code ? `${item.name} • ${item.code}` : item.name;
      option.textContent = `${nameWithCode} (${formatCurrency(item.unitPrice)})`;
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
        cell.colSpan = 6;
        cell.textContent = "Henüz veri yok";
        cell.classList.add("muted");
        row.appendChild(cell);
        tbody.appendChild(row);
        return;
      }
      items.forEach((item) => {
        const row = document.createElement("tr");
        row.dataset.id = item.id;
        row.dataset.category = category;
        row.innerHTML = `
          <td>${item.name || "-"}</td>
          <td>${item.code || "-"}</td>
          <td>${item.description || "-"}</td>
          <td>${item.unit || "Adet"}</td>
          <td>${formatCurrency(item.unitPrice)}</td>
          <td class="actions-cell">
            <div class="table-actions">
              <button class="btn small" type="button" data-action="edit-price" data-id="${item.id}" data-category="${category}">Düzenle</button>
              <button class="btn danger small" type="button" data-action="delete-price" data-id="${item.id}" data-category="${category}">Sil</button>
            </div>
          </td>
        `;
        tbody.appendChild(row);
      });
    });
  }

  function getPriceItem(category, itemId) {
    const list = state.priceLists[category] || [];
    return list.find((item) => item.id === itemId) || null;
  }

  function syncDemandWithProduct(product) {
    let updated = false;
    state.demand.forEach((line) => {
      if (line.productId === product.id) {
        line.productName = product.name;
        line.productCode = product.code;
        line.unit = product.unit;
        line.unitPrice = product.unitPrice;
        line.category = product.category;
        updated = true;
      }
    });
    return updated;
  }

  function updateRequestExtractedProducts(product) {
    state.requests.forEach((req) => {
      if (!Array.isArray(req.extractedProducts)) return;
      req.extractedProducts.forEach((extracted) => {
        if (extracted.productId === product.id) {
          extracted.productName = product.name;
          extracted.productCode = product.code;
          extracted.category = product.category;
        }
      });
    });
  }

  function removeProductFromRequests(productId) {
    state.requests.forEach((req) => {
      if (!Array.isArray(req.extractedProducts)) return;
      req.extractedProducts = req.extractedProducts.filter((item) => item.productId !== productId);
    });
  }

  function removeProductFromDemand(productId) {
    const before = state.demand.length;
    state.demand = state.demand.filter((item) => item.productId !== productId);
    return before - state.demand.length;
  }

  function openPriceEditModal(category, itemId) {
    const item = getPriceItem(category, itemId);
    if (!item) return;
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    const card = document.createElement("div");
    card.className = "modal-card";
    const title = document.createElement("h3");
    title.textContent = "Ürünü Düzenle";
    const form = document.createElement("form");

    const createInput = (labelText, name, options = {}) => {
      const wrapper = document.createElement("label");
      wrapper.textContent = labelText;
      const input = document.createElement("input");
      input.name = name;
      input.value = options.value || "";
      if (options.type) input.type = options.type;
      if (options.step) input.step = options.step;
      if (options.min !== undefined) input.min = options.min;
      if (options.required) input.required = true;
      wrapper.appendChild(input);
      return { wrapper, input };
    };

    const nameField = createInput("Ürün Adı", "name", { value: item.name || "", required: true });
    const codeField = createInput("Ürün Kodu", "code", { value: item.code || "" });
    const descriptionField = createInput("Ürün Açıklaması", "description", { value: item.description || "" });
    const unitField = createInput("Birim", "unit", { value: item.unit || "Adet" });
    const priceField = createInput("Birim Fiyatı (TL)", "unitPrice", {
      value: item.unitPrice != null ? String(item.unitPrice) : "",
      type: "number",
      step: "0.01",
      min: "0"
    });

    [nameField.wrapper, codeField.wrapper, descriptionField.wrapper, unitField.wrapper, priceField.wrapper].forEach((element) => {
      form.appendChild(element);
    });

    const actions = document.createElement("div");
    actions.className = "modal-actions";
    const cancelButton = document.createElement("button");
    cancelButton.type = "button";
    cancelButton.className = "btn ghost";
    cancelButton.textContent = "Vazgeç";
    const saveButton = document.createElement("button");
    saveButton.type = "submit";
    saveButton.className = "btn primary";
    saveButton.textContent = "Kaydet";
    actions.appendChild(cancelButton);
    actions.appendChild(saveButton);
    form.appendChild(actions);

    card.appendChild(title);
    card.appendChild(form);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add("visible"));
    nameField.input.focus();

    const close = () => {
      overlay.classList.remove("visible");
      setTimeout(() => overlay.remove(), 200);
    };

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        close();
      }
    });
    cancelButton.addEventListener("click", close);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const name = String(formData.get("name") || "").trim();
      const code = String(formData.get("code") || "").trim();
      const description = String(formData.get("description") || "").trim();
      const unit = String(formData.get("unit") || "Adet").trim() || "Adet";
      const unitPriceValue = parseNumber(formData.get("unitPrice"));
      if (!name) {
        alert("Ürün adı boş bırakılamaz.");
        nameField.input.focus();
        return;
      }
      if (Number.isNaN(unitPriceValue) || unitPriceValue < 0) {
        alert("Geçerli bir birim fiyat girin.");
        priceField.input.focus();
        return;
      }
      item.name = name;
      item.description = description;
      item.code = code;
      item.unit = unit;
      item.unitPrice = unitPriceValue;
      const aliasSet = new Set(Array.isArray(item.aliases) ? item.aliases : []);
      if (name) aliasSet.add(name);
      if (description) aliasSet.add(description);
      if (code) aliasSet.add(code);
      item.aliases = Array.from(aliasSet).slice(0, 12);
      const demandUpdated = syncDemandWithProduct(item);
      updateRequestExtractedProducts(item);
      saveState();
      renderPriceTables();
      renderDemandTable();
      renderOfferTable();
      renderRequests();
      updateProductOptions();
      close();
      if (demandUpdated) {
        alert("Ürün ve ilgili talep kalemleri güncellendi.");
      } else {
        alert("Ürün bilgileri güncellendi.");
      }
    });
  }

  function deletePriceItem(category, itemId) {
    const list = state.priceLists[category] || [];
    const index = list.findIndex((item) => item.id === itemId);
    if (index === -1) return;
    const item = list[index];
    const confirmation = confirm(
      `${item.name} ürününü ${labelForCategory(category)} listesinden silmek istediğinize emin misiniz?`
    );
    if (!confirmation) return;
    list.splice(index, 1);
    const removedDemand = removeProductFromDemand(itemId);
    removeProductFromRequests(itemId);
    saveState();
    renderPriceTables();
    renderDemandTable();
    renderOfferTable();
    renderRequests();
    updateProductOptions();
    const messageParts = ["Ürün listeden silindi."];
    if (removedDemand) {
      messageParts.push(`${removedDemand} talep kalemi kaldırıldı.`);
    }
    alert(messageParts.join(" "));
  }

  function clearPriceList(category) {
    const list = state.priceLists[category] || [];
    if (!list.length) {
      alert("Liste zaten boş.");
      return;
    }
    const confirmation = confirm(
      `${labelForCategory(category)} fiyat listesindeki ${list.length} ürünün tamamını silmek istediğinize emin misiniz?`
    );
    if (!confirmation) return;
    const removedIds = new Set(list.map((item) => item.id));
    state.priceLists[category] = [];
    delete state.priceMeta[category];
    state.demand = state.demand.filter((item) => !removedIds.has(item.productId));
    state.requests.forEach((req) => {
      if (!Array.isArray(req.extractedProducts)) return;
      req.extractedProducts = req.extractedProducts.filter((product) => !removedIds.has(product.productId));
    });
    saveState();
    renderPriceTables();
    renderDemandTable();
    renderOfferTable();
    renderRequests();
    updateProductOptions();
    alert(`${labelForCategory(category)} fiyat listesi temizlendi.`);
  }

  function handlePriceTableClick(event) {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const action = button.dataset.action;
    const category = button.dataset.category;
    const itemId = button.dataset.id;
    if (!category || !itemId) return;
    if (action === "edit-price") {
      openPriceEditModal(category, itemId);
    } else if (action === "delete-price") {
      deletePriceItem(category, itemId);
    }
  }

  function handleClearPriceList(event) {
    event.preventDefault();
    const category = event.currentTarget.dataset.type;
    if (!category) return;
    clearPriceList(category);
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

      const documentCell = document.createElement("td");
      documentCell.innerHTML = `
        <strong>${req.name}</strong><br /><span class="muted">${req.type || "Dosya"}</span>
      `;

      const sizeCell = document.createElement("td");
      sizeCell.textContent = formatBytes(req.size);

      const dateCell = document.createElement("td");
      dateCell.textContent = date;

      const noteCell = document.createElement("td");
      const extractionMessage = req.extractionNote;
      const statusMessage = linked
        ? `${linked} kalem talebe dönüştürüldü.`
        : "Talep listesine aktarılmayı bekliyor.";

      [extractionMessage, statusMessage]
        .filter(Boolean)
        .forEach((text) => {
          const paragraph = document.createElement("p");
          paragraph.textContent = text;
          noteCell.appendChild(paragraph);
        });

      if (Array.isArray(req.extractedProducts) && req.extractedProducts.length) {
        const listTitle = document.createElement("p");
        listTitle.textContent = "Çıkarılan ürünler:";
        noteCell.appendChild(listTitle);
        const list = document.createElement("ul");
        list.className = "match-list";
        req.extractedProducts.forEach((product) => {
          const item = document.createElement("li");
          const quantityText = product.quantity && product.quantity !== 1 ? ` × ${product.quantity}` : "";
          const codeText = product.productCode ? ` (${product.productCode})` : "";
          item.textContent = `${labelForCategory(product.category)} - ${product.productName}${codeText}${quantityText}`;
          list.appendChild(item);
        });
        noteCell.appendChild(list);
      }

      const downloadWrapper = document.createElement("p");
      if (req.dataUrl) {
        const link = document.createElement("a");
        link.className = "btn";
        link.download = req.name;
        link.href = req.dataUrl;
        link.textContent = "İndir";
        downloadWrapper.appendChild(link);
      } else {
        downloadWrapper.textContent = "Önizleme yok";
      }
      noteCell.appendChild(downloadWrapper);

      row.appendChild(documentCell);
      row.appendChild(sizeCell);
      row.appendChild(dateCell);
      row.appendChild(noteCell);
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
        <td>
          <div class="table-product">
            <span class="product-name">${item.productName || "-"}</span>
            ${item.productCode ? `<span class="product-code">${item.productCode}</span>` : ""}
          </div>
        </td>
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
        <td>
          <div class="table-product">
            <span class="product-name">${item.productName || "-"}</span>
            ${item.productCode ? `<span class="product-code">${item.productCode}</span>` : ""}
          </div>
        </td>
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
      productCode: product.code,
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
        "Ürün Kodu": item.productCode || "",
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
        "Ürün Kodu",
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
      row["Ürün Kodu"],
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
      ["Ara Toplam", "", "", "", "", "", "", "", "", subtotal],
      ["KDV", "", "", "", "", "", "", "", "", vatTotal],
      ["Genel Toplam", "", "", "", "", "", "", "", "", subtotal + vatTotal]
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
      .querySelectorAll(".clear-price-list")
      .forEach((button) => button.addEventListener("click", handleClearPriceList));
    Object.values(priceTableBodies).forEach((tbody) => {
      tbody.addEventListener("click", handlePriceTableClick);
    });
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
