// =====================================================
// db.js — IndexedDB Persistence
// =====================================================
const DB_NAME    = "FinMatrixDB";
const DB_VERSION = 2;
let _db = null;

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains("sales"))     db.createObjectStore("sales",     { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("purchases")) db.createObjectStore("purchases", { keyPath: "id", autoIncrement: true });
      if (!db.objectStoreNames.contains("settings"))  db.createObjectStore("settings",  { keyPath: "key" });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(); };
    req.onerror   = e => reject(e.target.error);
  });
}

function getAll(store) {
  return new Promise((resolve, reject) => {
    const req = _db.transaction(store, "readonly").objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

function putRecord(store, record) {
  return new Promise((resolve, reject) => {
    const req = _db.transaction(store, "readwrite").objectStore(store).put(record);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = e => reject(e.target.error);
  });
}

window.DB = {
  init: async function () {
    await openDB();
    // Load sales
    const sales = await getAll("sales");
    sales.sort((a, b) => a.id - b.id);
    window.savedSales = sales;
    // Load purchases
    const purchases = await getAll("purchases");
    purchases.sort((a, b) => a.id - b.id);
    window.savedPurchases = purchases;
    // Load COA
    await new Promise(resolve => {
      const req = _db.transaction("settings","readonly").objectStore("settings").get("coa");
      req.onsuccess = () => { if (req.result?.value) window.COA = req.result.value; resolve(); };
      req.onerror   = () => resolve();
    });
  },

  saveSale: async function (sale, index) {
    const rec = { ...sale };
    if (index !== null && window.savedSales[index]?.id) rec.id = window.savedSales[index].id;
    const id = await putRecord("sales", rec);
    rec.id = id;
    if (index !== null) window.savedSales[index] = rec;
    else                window.savedSales.push(rec);
    return id;
  },

  updateSale: async function (index) {
    if (window.savedSales[index]?.id) await putRecord("sales", window.savedSales[index]);
  },

  savePurchase: async function (purchase, index) {
    const rec = { ...purchase };
    if (index !== null && window.savedPurchases[index]?.id) rec.id = window.savedPurchases[index].id;
    const id = await putRecord("purchases", rec);
    rec.id = id;
    if (index !== null) window.savedPurchases[index] = rec;
    else                window.savedPurchases.push(rec);
    return id;
  },

  updatePurchase: async function (index) {
    if (window.savedPurchases[index]?.id) await putRecord("purchases", window.savedPurchases[index]);
  },

  saveCOA: async function () {
    await putRecord("settings", { key: "coa", value: window.COA });
  }
};
