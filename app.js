<script>
// ============ FieldFlow core ============

// simple CSV parser (no quoted commas in our file)
function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines.shift().split(',').map(h => h.trim());
  return lines.map(line => {
    const cols = line.split(',').map(c => c.trim());
    const obj = {};
    headers.forEach((h, i) => obj[h] = cols[i] ?? '');
    return obj;
  });
}

const FieldFlow = {
  _registryLoaded: false,
  _wells: [],         // raw list from CSV
  _byField: {},       // { "Dixon": [well objects...] }
  _byWellName: {},    // { "Cory 1": [well objects across fields] }
  _byKey: {},         // { "Dixon|Cory 1": wellObj }
  _attendants: ["T. Cherry","T. Ressler"],

  async init() {
    if (this._registryLoaded) return;
    try {
      const res = await fetch('wells_master.csv', {cache: 'no-store'});
      if (!res.ok) throw new Error('wells_master.csv not found');
      const csv = await res.text();
      const rows = parseCSV(csv);
      // sanitize + index
      this._wells = rows.map(r => ({
        igs_id: (r.igs_id || '').trim(),
        well_name: (r.well_name || '').trim(),
        field: (r.field || '').trim(),
        orifice_size: parseFloat(r.orifice_size || '0') || 0,
        is_obs: (r.is_obs || 'N').toUpperCase().startsWith('Y')
      }));
      this._byField = {};
      this._byWellName = {};
      this._byKey = {};
      this._wells.forEach(w => {
        if (!this._byField[w.field]) this._byField[w.field] = [];
        this._byField[w.field].push(w);
        if (!this._byWellName[w.well_name]) this._byWellName[w.well_name] = [];
        this._byWellName[w.well_name].push(w);
        this._byKey[`${w.field}|${w.well_name}`] = w;
      });
      this._registryLoaded = true;
      console.log('[FieldFlow] wells registry loaded:', this._wells.length);
    } catch (e) {
      console.error('[FieldFlow] Failed to load registry', e);
    }
  },

  attendants() { return this._attendants.slice(); },

  wellsForField(field) {
    return (this._byField[field] || []).map(w => w.well_name);
  },

  getWell(field, well_name) {
    return this._byKey[`${field}|${well_name}`] || null;
  },

  resolveWellId(field, well_name) {
    const w = this.getWell(field, well_name);
    return w ? w.igs_id : '';
  },

  resolveOrifice(field, well_name) {
    const w = this.getWell(field, well_name);
    return w ? (w.orifice_size || 0) : 0;
  },

  // ---------- storage helpers ----------
  _get(key) {
    try { return JSON.parse(localStorage.getItem(key) || '[]'); }
    catch { return []; }
  },
  _set(key, arr) {
    localStorage.setItem(key, JSON.stringify(arr));
  },
  _push(key, obj) {
    const arr = this._get(key);
    arr.push(obj);
    this._set(key, arr);
  },

  // ---------- SAVE functions (auto adds well_id) ----------
  saveDailyPressure(p) {
    const well_id = this.resolveWellId(p.field, p.well);
    const record = {
      type: 'daily_pressure',
      date: p.date,
      field: p.field,
      well: p.well,
      well_id,
      attendant: p.attendant || '',
      upstream: +p.upstream || 0,
      downstream: +p.downstream || 0,
      differential: +p.differential || 0,
      dpH2O: +p.dpH2O || 0,
      orifice: +p.orifice || this.resolveOrifice(p.field, p.well) || 0,
      mcfhr: +p.mcfhr || 0,
      notes: p.notes || '',
      ts: new Date().toISOString()
    };
    this._push('ff_daily_pressure', record);
    return record;
  },

  saveAnnual(p) {
    const well_id = this.resolveWellId(p.field, p.well);
    const record = {
      type: 'annual',
      date: p.date,
      field: p.field,
      well: p.well,
      well_id,
      attendant: p.attendant || '',
      valve_ok: p.valve_ok ?? null,     // true/false
      leak: p.leak ?? null,             // true/false
      leak_type: p.leak_type || '',     // '', 'internal','external','both'
      notes: p.notes || '',
      ts: new Date().toISOString()
    };
    this._push('ff_annual', record);
    return record;
  },

  saveShutIn(p) {
    const well_id = this.resolveWellId(p.field, p.well);
    const record = {
      type: 'shut_in',
      date: p.date,
      field: p.field,
      well: p.well,
      well_id,
      attendant: p.attendant || '',
      string: p.string || 'Tubing',     // 'Tubing' | 'Annulus'
      day: +p.day || 1,
      tempF: +p.tempF || 0,
      psi: +p.psi || 0,
      notes: p.notes || '',
      ts: new Date().toISOString()
    };
    this._push('ff_shut_in', record);
    return record;
  },

  saveOBS(p) {
    const well_id = this.resolveWellId(p.field, p.well);
    const record = {
      type: 'obs',
      date: p.date,
      field: p.field,
      well: p.well,
      well_id,
      attendant: p.attendant || '',
      tubing_psi: +p.tubing_psi || 0,
      annulus_psi: +p.annulus_psi || 0,
      surface_psi: +p.surface_psi || 0,
      blowdown_min: +p.blowdown_min || 0,
      on_water: p.on_water ? 'Y' : 'N',
      remarks: p.remarks || '',
      ts: new Date().toISOString()
    };
    this._push('ff_obs', record);
    return record;
  },

  saveWellStatus(p) {
    const well_id = this.resolveWellId(p.field, p.well);
    const record = {
      type: 'well_status',
      date: p.date,
      field: p.field,
      well: p.well,
      well_id,
      attendant: p.attendant || '',
      status: p.status || '',           // e.g. Online/Offline/Maint
      notes: p.notes || '',
      ts: new Date().toISOString()
    };
    this._push('ff_well_status', record);
    return record;
  },

  saveDailyActivity(p) {
    const record = {
      type: 'daily_activity',
      date: p.date,
      attendant: p.attendant || '',
      remarks: p.remarks || '',
      signature: p.signature || '',
      entries: p.entries || [], // array of strings
      ts: new Date().toISOString()
    };
    this._push('ff_daily_activity', record);
    return record;
  },

  // ---------- EXPORT HELPERS (CSV) ----------
  _downloadCSV(filename, rows) {
    const csv = rows.join('\n');
    const blob = new Blob([csv], {type: 'text/csv'});
    const url = URL.createObjectURL(blob);
    const a = Object.assign(document.createElement('a'), {href: url, download: filename});
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },

  exportDailyPressureCSV() {
    const data = this._get('ff_daily_pressure');
    const header = [
      'date','field','well','well_id','attendant',
      'upstream','downstream','differential','dpH2O','orifice','mcfhr','notes','ts'
    ].join(',');
    const rows = data.map(r => [
      r.date, r.field, r.well, r.well_id, r.attendant,
      r.upstream, r.downstream, r.differential, r.dpH2O, r.orifice, r.mcfhr,
      JSON.stringify(r.notes || ''), r.ts
    ].join(','));
    this._downloadCSV(`daily_pressure_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  },

  exportAnnualCSV() {
    const data = this._get('ff_annual');
    const header = ['date','field','well','well_id','attendant','valve_ok','leak','leak_type','notes','ts'].join(',');
    const rows = data.map(r => [
      r.date, r.field, r.well, r.well_id, r.attendant,
      r.valve_ok, r.leak, r.leak_type, JSON.stringify(r.notes || ''), r.ts
    ].join(','));
    this._downloadCSV(`annuals_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  },

  exportShutInCSV() {
    const data = this._get('ff_shut_in');
    const header = ['date','field','well','well_id','attendant','string','day','tempF','psi','notes','ts'].join(',');
    const rows = data.map(r => [
      r.date, r.field, r.well, r.well_id, r.attendant,
      r.string, r.day, r.tempF, r.psi, JSON.stringify(r.notes || ''), r.ts
    ].join(','));
    this._downloadCSV(`shut_in_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  },

  exportOBSCsv() {
    const data = this._get('ff_obs');
    const header = ['date','field','well','well_id','attendant','tubing_psi','annulus_psi','surface_psi','blowdown_min','on_water','remarks','ts'].join(',');
    const rows = data.map(r => [
      r.date, r.field, r.well, r.well_id, r.attendant,
      r.tubing_psi, r.annulus_psi, r.surface_psi, r.blowdown_min, r.on_water,
      JSON.stringify(r.remarks || ''), r.ts
    ].join(','));
    this._downloadCSV(`obs_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  },

  exportWellStatusCSV() {
    const data = this._get('ff_well_status');
    const header = ['date','field','well','well_id','attendant','status','notes','ts'].join(',');
    const rows = data.map(r => [
      r.date, r.field, r.well, r.well_id, r.attendant, r.status, JSON.stringify(r.notes || ''), r.ts
    ].join(','));
    this._downloadCSV(`well_status_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  },

  exportDailyActivityCSV() {
    const data = this._get('ff_daily_activity');
    const header = ['date','attendant','remarks','signature','entries','ts'].join(',');
    const rows = data.map(r => [
      r.date, r.attendant, JSON.stringify(r.remarks || ''), JSON.stringify(r.signature || ''),
      JSON.stringify(r.entries || []), r.ts
    ].join(','));
    this._downloadCSV(`daily_activity_${new Date().toISOString().slice(0,10)}.csv`, [header, ...rows]);
  }
};

// kick off registry load asap
FieldFlow.init();
window.FieldFlow = FieldFlow;
</script>
<script>
// --- Add below your other FieldFlow methods ---

// simple ISO date guard
function FF_parseISO(d){ try { return d ? new Date(d) : null; } catch { return null; } }

FieldFlow.exportAnnualCSVAll = function(){
  return this.exportAnnualCSV(); // existing function exports all
};

FieldFlow.exportAnnualCSVRange = function(opts = {}){
  const from = FF_parseISO(opts.from);
  const to   = FF_parseISO(opts.to ? opts.to + 'T23:59:59' : null);
  const fieldFilter = (opts.field || '').trim();

  const data = this._get('ff_annual');
  const rows = data.filter(r=>{
    if (fieldFilter && r.field !== fieldFilter) return false;
    const d = FF_parseISO(r.date) || FF_parseISO(r.ts);
    if (from && (!d || d < from)) return false;
    if (to   && (!d || d > to))   return false;
    return true;
  });

  const header = ['date','field','well','well_id','attendant','valve_ok','leak','leak_type','notes','ts'].join(',');
  const body = rows.map(r => [
    r.date, r.field, r.well, r.well_id, r.attendant,
    r.valve_ok, r.leak, r.leak_type, JSON.stringify(r.notes||''), r.ts
  ].join(','));

  const csv = [header].concat(body).join('\n');
  const filename = `annuals_${(opts.from||'all')}_to_${(opts.to||'all')}.csv`;
  // reuse downloader
  const blob = new Blob([csv], {type:'text/csv'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  setTimeout(()=>URL.revokeObjectURL(url), 1000);
};
</script>
