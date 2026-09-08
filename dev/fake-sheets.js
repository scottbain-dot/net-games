// Minimal in-memory stand-in for the Google Apps Script services that Code.gs
// uses (SpreadsheetApp, CacheService, LockService, Session, ...). Lets the
// real server code run in a browser preview or under Node for tests.
// Not a complete emulation — only what Code.gs calls.
(function (g) {
  'use strict';
  const isEmpty = v => v === '' || v === null || v === undefined;

  class Range {
    constructor(sheet, r, c, nr, nc) { this.sheet = sheet; this.r = r; this.c = c; this.nr = nr; this.nc = nc; }
    getValues() {
      const out = [];
      for (let i = 0; i < this.nr; i++) {
        const row = this.sheet.rows[this.r - 1 + i] || [];
        const line = [];
        for (let j = 0; j < this.nc; j++) { const v = row[this.c - 1 + j]; line.push(isEmpty(v) ? '' : v); }
        out.push(line);
      }
      return out;
    }
    getValue() { return this.getValues()[0][0]; }
    setValues(vals) {
      if (vals.length !== this.nr || vals[0].length !== this.nc) throw new Error(`setValues size mismatch: range ${this.nr}x${this.nc}, data ${vals.length}x${vals[0] && vals[0].length}`);
      for (let i = 0; i < this.nr; i++) {
        while (this.sheet.rows.length < this.r + i) this.sheet.rows.push([]);
        const row = this.sheet.rows[this.r - 1 + i];
        for (let j = 0; j < this.nc; j++) row[this.c - 1 + j] = vals[i][j];
      }
      this.sheet.book._touch();
      return this;
    }
    setValue(v) { return this.setValues([[v]]); }
    setFontWeight() { return this; }
    setNumberFormat() { return this; }
  }
  class Sheet {
    constructor(book, name) { this.book = book; this.name = name; this.rows = []; }
    getName() { return this.name; }
    setName(n) { this.name = n; return this; }
    getLastRow() { let last = 0; this.rows.forEach((row, i) => { if (row.some(v => !isEmpty(v))) last = i + 1; }); return last; }
    getLastColumn() { let last = 0; this.rows.forEach(row => { row.forEach((v, j) => { if (!isEmpty(v)) last = Math.max(last, j + 1); }); }); return last; }
    getMaxRows() { return Math.max(1000, this.rows.length); }
    getRange(r, c, nr, nc) {
      if (typeof r === 'string') { // 'C:C' style
        const col = r.split(':')[0].toUpperCase().charCodeAt(0) - 64;
        return new Range(this, 1, col, this.getMaxRows(), 1);
      }
      return new Range(this, r, c, nr === undefined ? 1 : nr, nc === undefined ? 1 : nc);
    }
    getDataRange() { return new Range(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
    setFrozenRows() { return this; }
    autoResizeColumns() { return this; }
    clear() { this.rows = []; this.book._touch(); return this; }
    deleteRow(r) { this.rows.splice(r - 1, 1); this.book._touch(); }
    copyTo(book) { const s = book.insertSheet('Copy of ' + this.name); s.rows = JSON.parse(JSON.stringify(this.rows)); return s; }
  }
  class Book {
    constructor() { this.sheets = [new Sheet(this, 'Sheet1')]; this.active = this.sheets[0]; this.onChange = null; }
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; }
    insertSheet(n) { const s = new Sheet(this, n); this.sheets.push(s); this._touch(); return s; }
    getSheets() { return this.sheets.slice(); }
    setActiveSheet(s) { this.active = s; return s; }
    moveActiveSheet(pos) { const i = this.sheets.indexOf(this.active); if (i === -1) return; this.sheets.splice(i, 1); this.sheets.splice(pos - 1, 0, this.active); }
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); this._touch(); }
    _touch() { if (this.onChange) this.onChange(this); }
    toJSON() { return { sheets: this.sheets.map(s => ({ name: s.name, rows: s.rows })) }; }
    static fromJSON(j) { const b = new Book(); b.sheets = (j.sheets || []).map(x => { const s = new Sheet(b, x.name); s.rows = x.rows; return s; }); if (!b.sheets.length) b.sheets = [new Sheet(b, 'Sheet1')]; b.active = b.sheets[0]; return b; }
  }

  const cache = {};
  const ui = {
    _log: [],
    createMenu(name) { const m = { addItem() { return m; }, addSeparator() { return m; }, addToUi() {} }; return m; },
    alert(msg) { ui._log.push(msg); if (g.console) console.log('[Ui.alert]', msg); },
    showModalDialog(html, title) { ui._log.push(title); }
  };
  const FakeSheets = {
    book: new Book(),
    reset() { FakeSheets.book = new Book(); },
    Book, Sheet, Range, ui,
    user: '', owner: 'teacher@example.edu'
  };

  g.FakeSheets = FakeSheets;
  g.SpreadsheetApp = { getActiveSpreadsheet: () => FakeSheets.book, openById: () => FakeSheets.book, getUi: () => ui };
  g.CacheService = { getScriptCache: () => ({ get: k => (k in cache ? cache[k] : null), put: (k, v) => { cache[k] = v; }, remove: k => { delete cache[k]; } }) };
  g.LockService = { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) };
  g.Session = {
    getActiveUser: () => ({ getEmail: () => FakeSheets.user }),
    getEffectiveUser: () => ({ getEmail: () => FakeSheets.owner }),
    getScriptTimeZone: () => 'Europe/Berlin'
  };
  g.Utilities = { formatDate: (d) => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; } };
  g.Logger = { log: (...a) => { if (g.console) console.log('[Logger]', ...a); } };
  g.ScriptApp = { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/PREVIEW/exec' }) };
  g.HtmlService = {
    createHtmlOutput: () => { const o = { setWidth() { return o; }, setHeight() { return o; } }; return o; },
    createHtmlOutputFromFile: () => ({ getContent: () => '' }),
    createTemplateFromFile: () => ({ evaluate: () => ({ setTitle() { return this; }, addMetaTag() { return this; }, setXFrameOptionsMode() { return this; } }) }),
    XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' }
  };
  g.PropertiesService = { getScriptProperties: () => ({ getProperty: () => null }) };
})(typeof globalThis !== 'undefined' ? globalThis : this);
