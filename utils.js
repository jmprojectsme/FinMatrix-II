// =====================================================
// utils.js — Shared Helpers
// =====================================================

window.nowTimestamp = function () {
  const n = new Date();
  return n.toLocaleDateString() + " " + n.toLocaleTimeString([], { hour:"2-digit", minute:"2-digit" });
};

window.formatDate = function (s) {
  if (!s) return "—";
  const [y,m,d] = s.split("-").map(Number);
  if (!y||!m||!d) return s;
  return new Date(y, m-1, d).toLocaleDateString(undefined, { year:"numeric", month:"short", day:"numeric" });
};

window.calcGross = function (rows) {
  return (rows||[]).reduce((s, r) => {
    const net = parseFloat(r.net) || 0;
    return s + net + (r.tax === "VAT" ? net * 0.12 : 0);
  }, 0);
};

// Net only (no VAT) — used for overview cards and chart
window.calcNet = function (rows) {
  return (rows||[]).reduce((s, r) => s + (parseFloat(r.net) || 0), 0);
};

window.createAccountDropdown = function (type, selected) {
  const sel = document.createElement("select");
  sel.className = "account-select";
  sel.innerHTML = `<option value="">— Account —</option>`;

  // Show all 5 COA categories so any account can be selected
  const catLabels = { sales:"Revenue", purchases:"Expenses", assets:"Assets", liabilities:"Liabilities", equity:"Equity" };
  Object.keys(window.COA).forEach(cat => {
    const groups = window.COA[cat] || {};
    Object.keys(groups).forEach(g => {
      const og = document.createElement("optgroup");
      og.label = (catLabels[cat] || cat) + " \u203a " + g;
      groups[g].forEach(acc => {
        const o = document.createElement("option");
        o.value = acc; o.textContent = acc;
        if (acc === selected) o.selected = true;
        og.appendChild(o);
      });
      sel.appendChild(og);
    });
  });

  return sel;
};

window.showInlineError = function (input, msg, isWarn) {
  window.clearInlineError(input);
  input.classList.add(isWarn ? "input-warning" : "input-error");
  const d = document.createElement("div");
  d.className = isWarn ? "validation-warning" : "validation-error";
  d.textContent = msg;
  input.parentNode.appendChild(d);
};

window.clearInlineError = function (input) {
  if (!input) return;
  input.classList.remove("input-error", "input-warning");
  input.parentNode.querySelector(".validation-error,.validation-warning")?.remove();
};

window.isDuplicateRef = function (list, ref, currentIndex) {
  if (!ref) return false;
  const lo = ref.toLowerCase();
  return list.some((x, i) => i !== currentIndex && x.reference?.toLowerCase() === lo);
};

window.statusBadge = function (s) {
  if (s === "VOID")   return `<span class="badge void">VOID</span>`;
  if (s === "POSTED") return `<span class="badge posted">POSTED</span>`;
  return `<span class="badge draft">DRAFT</span>`;
};

window.loadAuditLog = function (type) {
  const isSale = type === "sales";
  const list   = isSale ? window.savedSales : window.savedPurchases;
  const index  = isSale ? window.currentSaleIndex : window.currentPurchaseIndex;
  const prefix = isSale ? "sales" : "purchase";

  const createdEl = document.getElementById(prefix + "CreatedAt");
  const postedEl  = document.getElementById(prefix + "PostedAt");
  const voidedEl  = document.getElementById(prefix + "VoidedAt");
  const statusEl  = document.getElementById(prefix + "RecordStatus");

  if (!createdEl) return;

  if (index === null || !list[index]) {
    createdEl.textContent = "Created: —";
    postedEl?.classList.add("hidden");
    voidedEl?.classList.add("hidden");
    if (statusEl) statusEl.textContent = "New Draft";
    return;
  }

  const rec = list[index];
  createdEl.textContent = "Created: " + (rec.createdAt || "—");
  if (rec.postedAt) { postedEl.textContent = "Posted: " + rec.postedAt; postedEl.classList.remove("hidden"); }
  else              { postedEl?.classList.add("hidden"); }
  if (rec.voidedAt) { voidedEl.textContent = "Voided: " + rec.voidedAt; voidedEl.classList.remove("hidden"); }
  else              { voidedEl?.classList.add("hidden"); }
  if (statusEl) statusEl.textContent = rec.lastEditedStatus || "Draft";
};

window.generateJournalEntries = function (txn, type, paymentMethod) {
  const pm = paymentMethod || txn.paymentMethod || "Credit";

  // Determine the offsetting account based on payment method
  // Sales:     Cash/Bank → debit cash account;  Credit → debit Accounts Receivable
  // Purchases: Cash/Bank → credit cash account; Credit → credit Accounts Payable
  const cashAccount = pm === "Bank" ? "Cash in Bank" : "Cash on Hand";

  const map = {};
  const add = (acc, dr, cr) => {
    if (!map[acc]) map[acc] = { debit:0, credit:0 };
    map[acc].debit  += dr;
    map[acc].credit += cr;
  };

  (txn.rows || []).forEach(r => {
    const net   = parseFloat(r.net) || 0;
    const vat   = r.tax === "VAT" ? +(net * 0.12).toFixed(2) : 0;
    const gross = +(net + vat).toFixed(2);
    const acct  = r.account || (type === "sales" ? "Sales Revenue" : "Miscellaneous Expense");

    if (type === "sales") {
      // Sales entry:
      // DR  Cash/AR          (gross)
      // CR  Revenue account  (net)
      // CR  Output VAT Payable (vat, if applicable)
      const drAcct = pm === "Credit" ? "Accounts Receivable" : cashAccount;
      add(drAcct, gross, 0);
      add(acct, 0, net);
      if (vat > 0) add("Output VAT Payable", 0, vat);
    } else {
      // Purchase entry:
      // DR  Expense account  (net)
      // DR  Input VAT        (vat, if applicable)
      // CR  Cash/AP          (gross)
      const crAcct = pm === "Credit" ? "Accounts Payable" : cashAccount;
      add(acct, net, 0);
      if (vat > 0) add("Input VAT", vat, 0);
      add(crAcct, 0, gross);
    }
  });

  return Object.entries(map).map(([account, v]) => ({ account, debit: v.debit, credit: v.credit }));
};

window.renderJournalEntries = function (entries, tbody) {
  tbody.innerHTML = "";
  let totDr = 0, totCr = 0;
  entries.forEach(e => {
    totDr += e.debit; totCr += e.credit;
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="${e.debit > 0 ? "" : "cr-indent"}">${e.account}</td>
      <td class="num">${e.debit  > 0 ? e.debit.toFixed(2)  : ""}</td>
      <td class="num">${e.credit > 0 ? e.credit.toFixed(2) : ""}</td>`;
    tbody.appendChild(tr);
  });
  const tot = document.createElement("tr");
  tot.className = "j-total";
  tot.innerHTML = `<td><strong>Total</strong></td><td class="num"><strong>${totDr.toFixed(2)}</strong></td><td class="num"><strong>${totCr.toFixed(2)}</strong></td>`;
  tbody.appendChild(tot);
};
