/* Helpers for "Untuk nanti" recipe ideas: on-device OCR, recipe-text parsing and
   ingredient recognition. No AI and no server: everything runs in the browser. */
window.IdeaKit = (function () {
  'use strict';

  // ---------- Units ----------
  // Maps what people write to the canonical units used in data/ingredients.json.
  const UNIT_ALIASES = {
    g: ['g', 'gr', 'grm', 'gram', 'gramm'],
    kg: ['kg', 'kilo', 'kilogram'],
    ml: ['ml', 'mili', 'mililiter', 'cc'],
    liter: ['l', 'lt', 'ltr', 'liter', 'litre'],
    sdm: ['sdm', 'sendok makan', 'sendokmakan', 'tbsp'],
    sdt: ['sdt', 'sendok teh', 'sendokteh', 'tsp'],
    butir: ['butir', 'btr', 'btir'],
    siung: ['siung', 'sg', 'siong'],
    buah: ['buah', 'bh', 'biji', 'bj', 'pcs', 'potong', 'ptg'],
    ikat: ['ikat', 'ikt', 'genggam'],
    lembar: ['lembar', 'lbr', 'helai'],
    batang: ['batang', 'btg'],
    cm: ['cm', 'ruas', 'ruas jari'],
    bungkus: ['bungkus', 'bks', 'sachet', 'saset', 'pak', 'pack'],
    ekor: ['ekor', 'ekr'],
    papan: ['papan'],
    tongkol: ['tongkol'],
    gelas: ['gelas', 'cup', 'cangkir'],
    mangkuk: ['mangkuk', 'mangkok']
  };
  const UNIT_LOOKUP = {};
  Object.keys(UNIT_ALIASES).forEach((u) => UNIT_ALIASES[u].forEach((a) => { UNIT_LOOKUP[a] = u; }));
  const UNIT_WORDS = Object.keys(UNIT_LOOKUP).sort((a, b) => b.length - a.length);

  const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  function parseNumber(s) {
    if (!s) return null;
    s = s.trim();
    if (FRACTIONS[s] != null) return FRACTIONS[s];
    let m = s.match(/^(\d+)\s*([½¼¾⅓⅔])$/);
    if (m) return +m[1] + FRACTIONS[m[2]];
    m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    if (m) return +m[1] + (+m[2] / +m[3]);
    m = s.match(/^(\d+)\/(\d+)$/);
    if (m) return +m[1] / +m[2];
    m = s.match(/^(\d+)(?:-\d+)?$/); // "2-3" → 2
    if (m) return +m[1];
    m = s.match(/^\d+[.,]\d+$/);
    if (m) return parseFloat(s.replace(',', '.'));
    return null;
  }

  // ---------- Category guessing ----------
  const KEYWORDS = {
    protein: ['ayam', 'daging', 'sapi', 'kambing', 'bebek', 'ikan', 'udang', 'cumi', 'sotong', 'kepiting', 'kerang', 'telur', 'telor', 'tahu', 'tempe', 'bakso', 'sosis', 'kornet', 'ati', 'ampela', 'iga', 'babat', 'lele', 'nila', 'tongkol', 'tuna', 'salmon', 'dori', 'patin', 'bandeng', 'teri', 'oncom'],
    sayur: ['sayur', 'bayam', 'kangkung', 'sawi', 'pokcoy', 'pakcoy', 'kailan', 'brokoli', 'kol', 'kubis', 'wortel', 'kentang', 'tomat', 'timun', 'mentimun', 'terong', 'labu', 'buncis', 'kacang panjang', 'jagung', 'tauge', 'toge', 'jamur', 'daun singkong', 'daun pepaya', 'pare', 'oyong', 'selada', 'seledri', 'daun bawang', 'kemangi', 'paprika', 'nangka', 'rebung', 'pete', 'petai', 'melinjo', 'kecipir', 'genjer'],
    bumbu: ['bawang', 'cabai', 'cabe', 'rawit', 'garam', 'gula', 'merica', 'lada', 'kunyit', 'jahe', 'lengkuas', 'laos', 'kencur', 'serai', 'sereh', 'salam', 'daun jeruk', 'ketumbar', 'jinten', 'jintan', 'kemiri', 'pala', 'cengkeh', 'kayu manis', 'kapulaga', 'bunga lawang', 'terasi', 'asam', 'jeruk nipis', 'jeruk limau', 'kaldu', 'penyedap', 'micin', 'petis', 'kluwek', 'andaliman']
  };
  function guessCategory(name) {
    const n = ' ' + name.toLowerCase() + ' ';
    // Bumbu first: "bawang", "daun jeruk"… often sit next to protein words ("bumbu ayam")
    for (const cat of ['bumbu', 'protein', 'sayur']) {
      if (KEYWORDS[cat].some((k) => n.includes(' ' + k))) return cat;
    }
    return 'misc';
  }

  // ---------- Vocabulary matching ----------
  let vocabKeys = null;
  function buildVocab(ingredients) {
    vocabKeys = [];
    ingredients.forEach((ing) => {
      const base = ing.name.toLowerCase();
      const parts = new Set([base]);
      base.split(/[\/(]/).forEach((p) => { p = p.replace(/\)/g, '').trim(); if (p.length > 2) parts.add(p); });
      parts.forEach((k) => vocabKeys.push({ key: k, ing }));
    });
    vocabKeys.sort((a, b) => b.key.length - a.key.length);
  }
  // Everyday names → vocabulary id, tried when no full vocabulary name matches.
  const ALIASES = [
    ['dada ayam', 'ayam-fillet'], ['fillet ayam', 'ayam-fillet'], ['paha ayam', 'ayam-potong'], ['sayap ayam', 'sayap-ayam'],
    ['ceker', 'ceker-ayam'], ['ampela', 'ampela-ayam'], ['ati ampela', 'ampela-ayam'], ['ayam', 'ayam-potong'],
    ['daging giling', 'daging-sapi-giling'], ['daging cincang', 'daging-sapi-giling'], ['daging slice', 'daging-sapi-slice'],
    ['daging has', 'daging-sapi'], ['daging sapi', 'daging-sapi'], ['daging', 'daging-sapi'], ['iga', 'iga-sapi'],
    ['telur puyuh', 'telur-puyuh'], ['telur asin', 'telur-asin'], ['telur', 'telur-ayam'],
    ['tahu', 'tahu'], ['tempe', 'tempe'], ['udang', 'udang'], ['cumi', 'cumi'], ['lele', 'ikan-lele'], ['nila', 'ikan-nila'],
    ['cabai merah', 'cabai-merah-keriting'], ['cabai hijau', 'cabai-hijau'], ['cabai rawit', 'cabai-rawit'], ['rawit', 'cabai-rawit'],
    ['bombay', 'bawang-bombay'], ['laos', 'lengkuas'], ['sereh', 'serai'], ['jeruk purut', 'daun-jeruk'],
    ['merica', 'merica'], ['lada', 'merica'], ['penyedap', 'kaldu-bubuk'], ['kaldu', 'kaldu-bubuk'],
    ['kecap', 'kecap-manis'], ['saori', 'saus-tiram'], ['margarin', 'mentega'], ['blue band', 'mentega'],
    ['terigu', 'tepung-terigu'], ['maizena', 'tepung-maizena'], ['sagu', 'tepung-maizena'], ['panir', 'tepung-roti'],
    ['toge', 'tauge'], ['kubis', 'kol'], ['pakcoy', 'pokcoy'], ['sawi', 'sawi-hijau'], ['jagung', 'jagung-manis'], ['labu', 'labu-siam']
  ];
  function matchVocab(name, ingredients) {
    if (!vocabKeys) buildVocab(ingredients);
    const n = ' ' + name.toLowerCase().replace(/\bcabe\b/g, 'cabai').replace(/\btelor\b/g, 'telur').replace(/\s+/g, ' ') + ' ';
    const hit = vocabKeys.find((v) => n.includes(' ' + v.key + ' ') || n.includes(' ' + v.key + ','));
    if (hit) return hit.ing;
    const alias = ALIASES.find(([k]) => n.includes(' ' + k + ' '));
    return alias ? ingredients.find((i) => i.id === alias[1]) || null : null;
  }

  // ---------- Ingredient line ----------
  const unitRe = '(' + UNIT_WORDS.map((w) => w.replace(/ /g, '\\s+')).join('|') + ')\\.?';
  const NUM = '(\\d+\\s*[½¼¾⅓⅔]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+[.,]\\d+|\\d+(?:-\\d+)?|[½¼¾⅓⅔])';
  const LEADING = new RegExp('^' + NUM + '\\s*(?:' + unitRe + '\\s+)?(.+)$', 'i');
  const TRAILING = new RegExp('^(.+?)[\\s,:]+' + NUM + '\\s*(?:' + unitRe + ')?$', 'i');

  /** "500 gr daging sapi, potong dadu" → {name, qty, unit, note, category, vocabId, mergeable, text} */
  function parseIngredientLine(line, ingredients) {
    let text = line.replace(/^[-•*·–]\s*/, '').trim();
    let name = text, qty = null, unit = null;
    let m = text.match(LEADING);
    if (m) {
      qty = parseNumber(m[1]);
      unit = m[2] ? UNIT_LOOKUP[m[2].toLowerCase().replace(/\s+/g, ' ')] || null : null;
      name = m[3];
    } else if ((m = text.match(TRAILING))) {
      name = m[1];
      qty = parseNumber(m[2]);
      unit = m[3] ? UNIT_LOOKUP[m[3].toLowerCase().replace(/\s+/g, ' ')] || null : null;
    }
    let note = '';
    const split = name.match(/^([^,(]+)[,(]\s*(.+?)\)?$/);
    if (split) { name = split[1].trim(); note = split[2].trim(); }
    if (/secukupnya|sckp|sesuai selera/i.test(name)) { note = note || 'secukupnya'; name = name.replace(/\s*(secukupnya|sckp|sesuai selera)\s*/ig, ' ').trim(); }
    name = name.replace(/\s+/g, ' ').trim();
    if (!name) name = text;

    const vocab = matchVocab(name, ingredients);
    let mergeQty = null;
    if (vocab && qty != null) {
      let q = qty, u = unit;
      if (u === 'kg') { q *= 1000; u = 'g'; }
      if (u === 'liter') { q *= 1000; u = 'ml'; }
      if (u === vocab.unit || (!u && ['butir', 'siung', 'buah', 'ekor', 'papan', 'batang', 'lembar', 'tongkol'].includes(vocab.unit))) mergeQty = q;
    }
    const qtyText = qty == null ? (note === 'secukupnya' ? 'secukupnya' : '') : (formatNum(qty) + (unit ? ' ' + unit : ''));
    return {
      text,
      name: name.charAt(0).toUpperCase() + name.slice(1),
      qty: mergeQty,                 // number in the vocabulary unit, or null
      qtyText,                       // what the recipe said, for display
      note: note === 'secukupnya' ? '' : note,
      category: vocab ? vocab.category : guessCategory(name),
      vocabId: vocab ? vocab.id : null   // same shopping row as the catalog ingredient; qty merges only when units match
    };
  }
  function formatNum(n) {
    const map = { 0.5: '½', 0.25: '¼', 0.75: '¾' };
    const w = Math.floor(n), f = Math.round((n - w) * 100) / 100;
    if (map[f]) return (w ? w + ' ' : '') + map[f];
    return String(Math.round(n * 100) / 100).replace('.', ',');
  }

  // ---------- Whole-recipe text (OCR result or pasted from a website) ----------
  const ING_HEAD = /^(bahan[\s-]*bahan|bahan utama|bahan|bumbu halus|bumbu iris|bumbu cemplung|bumbu|pelengkap|ingredients?)\b\s*:?/i;
  const STEP_HEAD = /^(cara membuat|cara memasak|cara masak|cara buat|langkah[\s-]*langkah|langkah|cara|instruksi|steps?|directions?|method)\b\s*:?/i;
  const NOISE = /^(\d+\s*(porsi|orang|menit|mnt|jam)\b|porsi|resep\b.*oleh|oleh\s|cookpad|bagikan|simpan|cetak|foto|komentar|cooksnap|\d+\s*(suka|likes?)\b)/i;
  const STEP_MARK = /^(\d{1,2}\s*[.)\-:]|\d{1,2}\s+(?=[A-Za-z])|langkah\s*\d+\s*:?|[-•*])\s*/i;

  function parseRecipeText(raw) {
    const lines = String(raw || '').split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
    let title = '';
    const ingredients = [];
    const steps = [];
    let mode = null;
    let newStep = true;
    for (const l of lines) {
      if (STEP_HEAD.test(l) && l.length < 40) { mode = 'steps'; newStep = true; continue; }
      const ingHead = l.match(ING_HEAD);
      if (ingHead && l.length < 40) {
        mode = 'ing';
        const rest = l.slice(ingHead[0].length).trim();
        if (rest && /\d/.test(rest)) ingredients.push(rest);
        continue;
      }
      if (NOISE.test(l)) continue;
      if (!mode) {
        if (!title && l.length <= 80 && !/^\d/.test(l)) { title = l; continue; }
        if (/^\d/.test(l) && new RegExp(unitRe, 'i').test(l)) { mode = 'ing'; ingredients.push(l); }
        continue;
      }
      if (mode === 'ing') { ingredients.push(l); continue; }
      // steps
      if (/^\d{1,2}$/.test(l)) { newStep = true; continue; }   // cookpad shows the number on its own line
      if (STEP_MARK.test(l)) { steps.push(l.replace(STEP_MARK, '')); newStep = false; continue; }
      if (newStep || !steps.length) { steps.push(l); newStep = false; continue; }
      const prev = steps[steps.length - 1];
      if (/[.!?]$/.test(prev) && /^[A-Z]/.test(l)) steps.push(l); else steps[steps.length - 1] = prev + ' ' + l;
    }
    return { title, ingredients, steps: steps.filter((s) => s.length > 1) };
  }

  // ---------- OCR (Tesseract.js, loaded on first use) ----------
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src; s.onload = resolve; s.onerror = () => reject(new Error('Gagal memuat ' + src));
      document.head.appendChild(s);
    });
  }
  async function ocr(file, onProgress) {
    if (!window.Tesseract) await loadScript('https://cdn.jsdelivr.net/npm/tesseract.js@5.1.0/dist/tesseract.min.js');
    const worker = await window.Tesseract.createWorker('ind', 1, {
      logger: (m) => { if (onProgress && m.status === 'recognizing text') onProgress(m.progress); }
    });
    try {
      const { data } = await worker.recognize(file);
      return data.text;
    } finally {
      await worker.terminate();
    }
  }

  return { parseIngredientLine, parseRecipeText, ocr, guessCategory };
})();
