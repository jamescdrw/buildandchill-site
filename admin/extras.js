/* Build & Chill admin: site visits (photos + voice notes), AI quote helper, quick quote, socials, accounts.
   Uses the page's helpers: bm, api, esc, gbp, ukDate, bizView, loadBase, B, shrinkPhoto. */
(function () {
  'use strict';
  var BCX = window.BCX = {};
  var todayIso = function () { return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' }); };
  function say(id, text, ok) { var m = document.getElementById(id); if (!m) return; m.className = 'msg ' + (ok === undefined ? '' : ok ? 'ok' : 'bad'); m.textContent = text; }
  function priceBook() {
    return String(B.settings.price_book || '').split('\n').map(function (l) {
      var p = l.split('|').map(function (x) { return x.trim(); });
      return p.length >= 3 && p[1] ? { job: p[0] || 'Any job', description: p[1], price: parseFloat(p[2].replace(/[£,]/g, '')) || 0 } : null;
    }).filter(Boolean);
  }
  function jobNames() {
    var seen = [];
    priceBook().forEach(function (l) { if (seen.indexOf(l.job) < 0) seen.push(l.job); });
    return seen;
  }
  function custOptions(sel) {
    return '<option value="">Choose a customer…</option>' + B.customers.map(function (c) {
      return '<option value="' + c.id + '"' + (String(c.id) === String(sel) ? ' selected' : '') + '>' + esc(c.name) + (c.postcode ? ' (' + esc(c.postcode) + ')' : '') + '</option>';
    }).join('') + '<option value="new"' + (sel === 'new' ? ' selected' : '') + '>+ New customer</option>';
  }
  function dataUrlToFile(url, name) {
    var m = /^data:([^;]+);base64,(.*)$/.exec(url), bin = atob(m[2]), a = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
    return new File([a], name, { type: m[1] });
  }
  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select();
    try { document.execCommand('copy'); } finally { t.remove(); }
    return Promise.resolve();
  }

  /* ---------- Site visits: kept on this device (IndexedDB), photos and voice notes ---------- */
  var dbp = null;
  function db() {
    if (!dbp) dbp = new Promise(function (res, rej) {
      var r = indexedDB.open('bc-visits', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('visits', { keyPath: 'id' }); };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(new Error('This browser cannot store site visits. Try Chrome or Safari.')); };
    });
    return dbp;
  }
  function store(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (res, rej) {
        var t = d.transaction('visits', mode), req = fn(t.objectStore('visits'));
        t.oncomplete = function () { res(req && 'result' in req ? req.result : undefined); };
        t.onerror = function () { rej(new Error(t.error && t.error.name === 'QuotaExceededError' ? 'This device is out of space for photos and recordings.' : 'Could not save the visit.')); };
      });
    });
  }
  var visits = {
    all: function () { return store('readonly', function (s) { return s.getAll(); }).then(function (v) { return (v || []).sort(function (a, b) { return b.id - a.id; }); }); },
    get: function (id) { return store('readonly', function (s) { return s.get(Number(id)); }); },
    put: function (v) { v.updated = new Date().toISOString(); return store('readwrite', function (s) { return s.put(v); }).then(function () { return v; }); },
    del: function (id) { return store('readwrite', function (s) { return s.delete(Number(id)); }); },
  };

  BCX.visits = function () {
    return visits.all().then(function (vs) {
      bm.innerHTML = '<div class="head"><h2>Site visits</h2><button class="btn" id="nv">Start a site visit</button></div>' +
        '<p class="intro">On a visit, take photos and record voice notes about the job. Back home, turn the visit into a quote, with AI writing it for you if you like. Visits are kept on this device.</p>' +
        (vs.length ? '<table class="list"><thead><tr><th>Date</th><th>Customer</th><th>Job</th><th>Photos and notes</th><th>Quote</th></tr></thead><tbody>' +
          vs.map(function (v) {
            return '<tr data-vid="' + v.id + '"><td>' + ukDate(v.date) + '</td><td>' + esc(visitName(v) || 'No customer yet') + '</td><td>' + esc(v.job || '') + '</td><td>' +
              (v.photos || []).length + ' photo' + ((v.photos || []).length === 1 ? '' : 's') + ', ' + (v.audio || []).length + ' voice note' + ((v.audio || []).length === 1 ? '' : 's') +
              '</td><td>' + (v.quote_id ? '<span class="badge accepted">Quoted</span>' : '<span class="badge">To quote</span>') + '</td></tr>';
          }).join('') + '</tbody></table>'
          : '<div class="empty">No site visits yet. Press <strong>Start a site visit</strong> when you arrive at a job.</div>');
      document.getElementById('nv').onclick = newVisit;
      bm.querySelectorAll('tr[data-vid]').forEach(function (tr) { tr.onclick = function () { bizView('visit', { id: Number(tr.dataset.vid) }); }; });
    });
  };
  function visitName(v) {
    if (v.customer_id && v.customer_id !== 'new') { var c = B.customers.filter(function (x) { return String(x.id) === String(v.customer_id); })[0]; if (c) return c.name; }
    return v.new_name || '';
  }
  function newVisit(pre) {
    var v = { id: Date.now(), date: todayIso(), customer_id: '', new_name: '', new_phone: '', postcode: '', address: '', job: '',
      notes: '', photos: [], audio: [], quote_id: null };
    if (pre && pre.customer_id) v.customer_id = pre.customer_id;
    return visits.put(v).then(function () { bizView('visit', { id: v.id }); });
  }
  BCX.newVisit = newVisit;

  var rec = null; // active recording
  BCX.visit = function (arg) {
    return visits.get(arg.id).then(function (v) {
      if (!v) { bizView('visits'); return; }
      drawVisit(v);
    });
  };
  function drawVisit(v) {
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    var jobs = jobNames().filter(function (j) { return j !== 'Any job'; });
    bm.innerHTML = '<a href="#" class="back" id="back">← All site visits</a>' +
      '<div class="head"><h2>Site visit</h2><span class="intro" style="margin:0">' + ukDate(v.date) + '</span></div>' +
      '<div class="card"><div class="two">' +
        '<label class="row"><span>Customer</span><select id="v-cust">' + custOptions(v.customer_id) + '</select></label>' +
        '<label class="row"><span>Job</span><select id="v-job"><option value="">Choose…</option>' + jobs.concat(['Other']).map(function (j) {
          return '<option' + (j === v.job ? ' selected' : '') + '>' + esc(j) + '</option>'; }).join('') + '</select></label></div>' +
        '<div id="v-new" class="two"' + (v.customer_id === 'new' ? '' : ' hidden') + '>' +
          '<label class="row"><span>Name</span><input type="text" id="v-name" value="' + esc(v.new_name) + '"></label>' +
          '<label class="row"><span>Phone</span><input type="text" id="v-phone" value="' + esc(v.new_phone) + '"></label>' +
          '<label class="row"><span>Postcode</span><input type="text" id="v-postcode" value="' + esc(v.postcode) + '"></label>' +
          '<label class="row"><span>Address</span><input type="text" id="v-address" value="' + esc(v.address) + '"></label></div></div>' +

      '<div class="card"><h3 style="margin-top:0">Photos</h3><div class="actions">' +
        '<label class="btn">Take a photo<input type="file" accept="image/*" capture="environment" id="v-cam" class="vis-hide"></label>' +
        '<label class="btn line">Add from gallery<input type="file" accept="image/*" multiple id="v-gal" class="vis-hide"></label>' +
        '<p class="msg" id="v-pmsg" role="status"></p></div>' +
        '<div class="vgrid" id="v-photos"></div></div>' +

      '<div class="card"><h3 style="margin-top:0">Voice notes</h3>' +
        '<p class="intro" style="margin:0 0 10px">Talk through the job: measurements, what the customer wants, materials, access. ' +
        (SR ? 'What you say is written down as you speak, so the AI can read it later.' : 'This browser can record but not write down speech, so add the key points to the notes below as well.') + '</p>' +
        '<button type="button" class="btn rec" id="v-rec" aria-pressed="false">Start recording</button> <span id="v-timer" class="intro"></span>' +
        '<p class="live-words" id="v-live" hidden></p>' +
        '<div id="v-audio"></div></div>' +

      '<div class="card"><label class="row"><span>Notes</span><textarea id="v-notes" rows="7" placeholder="Measurements, materials, what is and is not included…">' + esc(v.notes) + '</textarea></label>' +
        '<p class="msg" id="v-msg" role="status"></p></div>' +

      '<div class="card ai"><h3 style="margin-top:0">Turn this visit into a quote</h3>' +
        '<ol class="steps">' +
          '<li><strong>Send the visit to AI.</strong> On a phone, <em>Share with AI app</em> sends the photos and notes straight to ChatGPT, Claude or Gemini. On a computer, copy the instructions and paste them into the AI website.' +
            '<div class="actions">' + (navigator.canShare ? '<button type="button" class="btn" id="v-share">Share with AI app</button>' : '') +
            '<button type="button" class="btn line" id="v-copy">Copy instructions for AI</button>' +
            '<a class="btn line" href="https://chatgpt.com/" target="_blank" rel="noopener">Open ChatGPT</a>' +
            '<a class="btn line" href="https://claude.ai/new" target="_blank" rel="noopener">Open Claude</a>' +
            '<a class="btn line" href="https://gemini.google.com/app" target="_blank" rel="noopener">Open Gemini</a></div></li>' +
          '<li><strong>Paste the AI\'s answer here</strong> and press <em>Make the quote</em>. Check the prices before you send it.' +
            '<textarea id="v-ai" rows="7" placeholder="Strip out old kitchen | 1 | 450&#10;Fit units and worktops | 1 | 2800&#10;Notes: Price includes…"></textarea>' +
            '<div class="actions"><button type="button" class="btn" id="v-make">Make the quote</button>' +
            '<button type="button" class="btn line" id="v-quick">Price it myself (quick quote)</button>' +
            (v.quote_id ? '<button type="button" class="btn line" id="v-open">Open the quote</button>' : '') +
            '<p class="msg" id="v-qmsg" role="status"></p></div></li></ol></div>' +
      '<p><button type="button" class="btn danger" id="v-del">Delete this visit</button></p>';

    var saveT = null;
    function readForm() {
      v.customer_id = document.getElementById('v-cust').value;
      v.job = document.getElementById('v-job').value;
      v.new_name = document.getElementById('v-name').value.trim();
      v.new_phone = document.getElementById('v-phone').value.trim();
      v.postcode = document.getElementById('v-postcode').value.trim().toUpperCase();
      v.address = document.getElementById('v-address').value.trim();
      v.notes = document.getElementById('v-notes').value;
    }
    function save(now) {
      clearTimeout(saveT);
      var go = function () { readForm(); return visits.put(v).then(function () { say('v-msg', 'Saved on this device.', true); }).catch(function (e) { say('v-msg', e.message, false); }); };
      if (now) return go();
      saveT = setTimeout(go, 600);
    }
    bm.querySelectorAll('#bizmain input[type=text], #v-notes').forEach(function (el) { el.addEventListener('input', function () { save(); }); });
    document.getElementById('v-job').onchange = function () { save(true); };
    document.getElementById('v-cust').onchange = function () {
      document.getElementById('v-new').hidden = this.value !== 'new';
      if (this.value === 'new') document.getElementById('v-name').focus();
      save(true);
    };
    document.getElementById('back').onclick = function (e) { e.preventDefault(); stopRec(); save(true).then(function () { bizView('visits'); }); };

    function drawPhotos() {
      document.getElementById('v-photos').innerHTML = v.photos.map(function (p, i) {
        return '<figure><img src="' + p + '" alt="Site photo ' + (i + 1) + '"><button type="button" data-rm="' + i + '" aria-label="Remove photo ' + (i + 1) + '">×</button></figure>';
      }).join('');
      bm.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { v.photos.splice(+b.dataset.rm, 1); drawPhotos(); save(true); }; });
    }
    function addPhotos(files) {
      files = Array.prototype.slice.call(files || []);
      if (!files.length) return;
      say('v-pmsg', 'Adding ' + files.length + ' photo' + (files.length === 1 ? '' : 's') + '…');
      files.reduce(function (p, f) { return p.then(function () { return shrinkPhoto(f).then(function (d) { v.photos.push(d); }); }); }, Promise.resolve())
        .then(function () { drawPhotos(); return save(true); }).then(function () { say('v-pmsg', ''); })
        .catch(function (e) { say('v-pmsg', e.message, false); });
    }
    document.getElementById('v-cam').onchange = function () { addPhotos(this.files); this.value = ''; };
    document.getElementById('v-gal').onchange = function () { addPhotos(this.files); this.value = ''; };
    drawPhotos();

    function drawAudio() {
      var box = document.getElementById('v-audio');
      box.innerHTML = v.audio.map(function (a, i) {
        return '<div class="vnote"><div class="actions"><strong>Voice note ' + (i + 1) + '</strong><span class="intro" style="margin:0">' + fmtSecs(a.secs) + '</span>' +
          '<button type="button" class="btn danger" data-arm="' + i + '">Delete</button></div>' +
          '<audio controls preload="metadata" data-ai="' + i + '"></audio>' +
          (a.transcript ? '<p class="said">“' + esc(a.transcript) + '”</p>' : '') + '</div>';
      }).join('');
      box.querySelectorAll('audio[data-ai]').forEach(function (el) { el.src = URL.createObjectURL(v.audio[+el.dataset.ai].blob); });
      box.querySelectorAll('[data-arm]').forEach(function (b) { b.onclick = function () { v.audio.splice(+b.dataset.arm, 1); drawAudio(); save(true); }; });
    }
    drawAudio();

    var recBtn = document.getElementById('v-rec');
    recBtn.onclick = function () { if (rec) stopRec(); else startRec(); };
    function startRec() {
      if (!navigator.mediaDevices || !window.MediaRecorder) { say('v-msg', 'This browser cannot record. Type your notes instead, or use the microphone on your keyboard.', false); return; }
      navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
        var type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm', 'audio/ogg'].filter(function (t) { return MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t); })[0];
        var mr = new MediaRecorder(stream, type ? { mimeType: type } : undefined), chunks = [];
        rec = { mr: mr, stream: stream, started: Date.now(), words: '', interim: '', sr: null, wantSr: true };
        mr.ondataavailable = function (e) { if (e.data.size) chunks.push(e.data); };
        mr.onstop = function () {
          var r = rec; rec = null;
          stream.getTracks().forEach(function (t) { t.stop(); });
          var blob = new Blob(chunks, { type: mr.mimeType || type || 'audio/webm' });
          var secs = Math.round((Date.now() - r.started) / 1000), words = (r.words + ' ' + r.interim).trim();
          v.audio.push({ blob: blob, secs: secs, at: new Date().toISOString(), transcript: words });
          var n = document.getElementById('v-notes'), onPage = n && document.getElementById('v-rec') === recBtn;
          if (onPage) readForm();
          if (words) v.notes = (v.notes.trim() ? v.notes.trim() + '\n\n' : '') + words;
          visits.put(v).catch(function () {});
          if (!onPage) return;
          n.value = v.notes;
          recBtn.textContent = 'Start recording'; recBtn.setAttribute('aria-pressed', 'false'); recBtn.classList.remove('on');
          document.getElementById('v-timer').textContent = '';
          document.getElementById('v-live').hidden = true;
          drawAudio(); say('v-msg', 'Voice note saved on this device.', true);
        };
        mr.start(1000);
        recBtn.textContent = 'Stop recording'; recBtn.setAttribute('aria-pressed', 'true'); recBtn.classList.add('on');
        var tick = function () { if (!rec || rec.mr !== mr) return; document.getElementById('v-timer').textContent = 'Recording ' + fmtSecs((Date.now() - rec.started) / 1000); setTimeout(tick, 500); };
        tick();
        if (SR) startWords(SR);
      }).catch(function () {
        say('v-msg', 'The microphone is blocked. Allow microphone access for this site in your browser settings, then try again.', false);
      });
    }
    function startWords(SRC) {
      var live = document.getElementById('v-live');
      var r = rec, s = new SRC();
      s.lang = 'en-GB'; s.continuous = true; s.interimResults = true;
      s.onresult = function (e) {
        var interim = '';
        for (var i = e.resultIndex; i < e.results.length; i++) {
          if (e.results[i].isFinal) r.words += (r.words ? ' ' : '') + e.results[i][0].transcript.trim();
          else interim += e.results[i][0].transcript;
        }
        r.interim = interim;
        live.hidden = false; live.textContent = (r.words + ' ' + interim).trim();
      };
      s.onerror = function (e) { if (e.error === 'not-allowed' || e.error === 'audio-capture' || e.error === 'service-not-allowed') r.wantSr = false; };
      s.onend = function () { r.words = (r.words + ' ' + r.interim).trim(); r.interim = ''; if (rec === r && r.wantSr) { try { s.start(); } catch (x) { /* already running */ } } };
      r.sr = s;
      try { s.start(); } catch (x) { r.wantSr = false; }
    }
    function stopRec() {
      if (!rec) return;
      rec.wantSr = false;
      if (rec.sr) try { rec.sr.stop(); } catch (x) { /* stopped */ }
      var mr = rec.mr;
      setTimeout(function () { if (mr.state !== 'inactive') mr.stop(); }, rec.sr ? 400 : 0);
    }
    BCX._stopRec = stopRec;

    function aiPrompt() {
      readForm();
      var c = B.customers.filter(function (x) { return String(x.id) === String(v.customer_id); })[0];
      var pc = v.postcode || (c && c.postcode) || '';
      var book = priceBook().filter(function (l) { return !v.job || v.job === 'Other' || l.job === v.job || l.job === 'Any job'; });
      return 'You are helping Ashley at ' + B.settings.business_name + ' (Leicester, UK) write a quote for a customer.\n\n' +
        'Job: ' + (v.job || 'not set') + (pc ? '\nPostcode: ' + pc : '') + '\n' +
        (v.photos.length ? 'Photos: ' + v.photos.length + ' from the site visit (attached if I could share them).\n' : '') +
        '\nMy notes from the site visit (some are spoken, so the wording may be rough):\n' + (v.notes.trim() || '(no notes)') + '\n\n' +
        'My usual prices. Use them where they fit and estimate anything else at fair Leicester trade rates:\n' +
        book.map(function (l) { return '- ' + l.description + ': £' + l.price; }).join('\n') + '\n\n' +
        'Reply with the quote lines only, one per line, in exactly this format:\n' +
        'Description | quantity | unit price in pounds\n' +
        'Then one final line starting "Notes:" with a short, friendly note for the customer saying what is and is not included.\n' +
        'Do not add VAT. If something is unclear, include a sensible allowance and say so in the notes.';
    }
    document.getElementById('v-copy').onclick = function () {
      copy(aiPrompt()).then(function () { say('v-qmsg', 'Copied. Paste it into the AI, add the photos there if you can, then paste its answer above.', true); })
        .catch(function () { say('v-qmsg', 'Could not copy. Select the notes and copy them yourself.', false); });
    };
    var shareBtn = document.getElementById('v-share');
    if (shareBtn) shareBtn.onclick = function () {
      var text = aiPrompt();
      var files = v.photos.slice(0, 10).map(function (p, i) { return dataUrlToFile(p, 'site-photo-' + (i + 1) + '.jpg'); });
      var payload = { text: text, files: files };
      if (!files.length || !navigator.canShare(payload)) payload = { text: text };
      copy(text).catch(function () {}).then(function () {
        return navigator.share(payload);
      }).then(function () { say('v-qmsg', 'Sent. The instructions are also copied, in case the app only took the photos. When the AI replies, copy its answer and paste it above.', true); })
        .catch(function (e) { if (e && e.name !== 'AbortError') say('v-qmsg', 'Sharing did not work here. Use Copy instructions for AI instead.', false); });
    };
    document.getElementById('v-quick').onclick = function () { save(true).then(function () { bizView('quick', { visitId: v.id }); }); };
    var openQ = document.getElementById('v-open');
    if (openQ) openQ.onclick = function () { bizView('doc', { id: v.quote_id, kind: 'quote' }); };
    document.getElementById('v-make').onclick = function () {
      var parsed = parseAi(document.getElementById('v-ai').value);
      if (!parsed.items.length) { say('v-qmsg', 'No quote lines found. Each line needs a description, quantity and price split by | like: Fit worktops | 1 | 600', false); return; }
      var btn = this; btn.disabled = true; say('v-qmsg', 'Making the quote…');
      readForm();
      ensureCustomer(v).then(function (cid) {
        return api('/api/docs', { kind: 'quote', customer_id: cid, title: v.job && v.job !== 'Other' ? v.job : 'Building work', items: parsed.items,
          notes: parsed.notes, status: 'draft', vat_rate: B.settings.vat_registered ? B.settings.vat_rate : 0 });
      }).then(function (doc) {
        v.quote_id = doc.id; return visits.put(v).then(function () { return loadBase(); }).then(function () { bizView('doc', { id: doc.id, kind: 'quote' }); });
      }).catch(function (e) { btn.disabled = false; say('v-qmsg', e.message, false); });
    };
    document.getElementById('v-del').onclick = function () {
      if (!confirm('Delete this site visit, its photos and voice notes from this device?')) return;
      stopRec(); visits.del(v.id).then(function () { bizView('visits'); });
    };
  }
  function fmtSecs(s) { s = Math.round(s || 0); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

  function ensureCustomer(v) {
    if (v.customer_id && v.customer_id !== 'new') return Promise.resolve(Number(v.customer_id));
    if (!v.new_name) return Promise.reject(new Error('Choose the customer at the top of the visit, or add their name.'));
    return api('/api/customers', { name: v.new_name, phone: v.new_phone, postcode: v.postcode, address: v.address, email: '' })
      .then(function (c) { v.customer_id = c.id; return c.id; });
  }

  function parseAi(text) {
    var items = [], notes = [], inNotes = false;
    String(text || '').split('\n').forEach(function (raw) {
      var line = raw.trim();
      if (!line) return;
      if (/^\**\s*notes?\s*:?\**\s*:?/i.test(line) && line.indexOf('|') < 0) { inNotes = true; notes.push(line.replace(/^\**\s*notes?\s*:?\**\s*:?\s*/i, '')); return; }
      if (inNotes) { notes.push(line); return; }
      line = line.replace(/^[-*•\d.)\s]+(?=[A-Za-z£])/, '').replace(/^\|/, '').replace(/\|$/, '');
      var p = line.split('|').map(function (x) { return x.trim().replace(/\*\*/g, ''); });
      if (p.length < 3) return;
      var qty = parseFloat(p[1].replace(/[^\d.]/g, '')), price = parseFloat(p[2].replace(/[^\d.]/g, ''));
      if (!p[0] || isNaN(qty) || isNaN(price) || /^-+$/.test(p[0])) return;
      items.push({ description: p[0], qty: qty, unit_price: price });
    });
    return { items: items, notes: notes.join('\n').trim() };
  }
  BCX._parseAi = parseAi;

  /* ---------- Quick quote ---------- */
  BCX.quick = function (arg) {
    var pre = arg && arg.visitId ? visits.get(arg.visitId) : Promise.resolve(null);
    return pre.then(function (v) { drawQuick(v); });
  };
  function drawQuick(v) {
    var book = priceBook(), jobs = jobNames(), picked = {};
    if (v && v.job && jobs.indexOf(v.job) >= 0) picked[v.job] = true;
    bm.innerHTML = '<div class="head"><h2>Quick quote</h2></div>' +
      '<p class="intro">Tap the jobs, tick the lines you need, change any number, then press <strong>Create quote</strong>. ' + (v ? 'Using your site visit notes.' : '') + '</p>' +
      '<div class="card"><div class="two"><label class="row"><span>Customer</span><select id="q-cust">' + custOptions(v ? v.customer_id : '') + '</select></label>' +
        '<label class="row"><span>Job title on the quote</span><input type="text" id="q-title" placeholder="e.g. Bathroom refit"></label></div>' +
        '<div id="q-new" class="three"' + (v && v.customer_id === 'new' ? '' : ' hidden') + '>' +
          '<label class="row"><span>Name</span><input type="text" id="q-name" value="' + esc(v ? v.new_name : '') + '"></label>' +
          '<label class="row"><span>Phone</span><input type="text" id="q-phone" value="' + esc(v ? v.new_phone : '') + '"></label>' +
          '<label class="row"><span>Postcode</span><input type="text" id="q-postcode" value="' + esc(v ? v.postcode : '') + '"></label></div></div>' +
      '<div class="jobtiles" id="q-jobs">' + jobs.map(function (j) { return '<button type="button" class="jobtile" aria-pressed="' + (picked[j] ? 'true' : 'false') + '" data-job="' + esc(j) + '">' + esc(j) + '</button>'; }).join('') + '</div>' +
      '<div class="card"><table class="items-ed"><thead><tr><th></th><th style="width:55%">Line</th><th>Qty</th><th>Price (£)</th><th class="n">Amount</th></tr></thead><tbody id="q-lines"></tbody></table>' +
        '<p><button type="button" class="btn small line" id="q-add">Add your own line</button></p>' +
        '<label class="row"><span>Notes for the customer</span><textarea id="q-notes" rows="3" placeholder="What is and is not included, timings, deposit…"></textarea></label></div>' +
      '<div class="qbar"><strong id="q-total">£0.00</strong><button class="btn" id="q-make" type="button">Create quote</button><p class="msg" id="q-msg" role="status"></p></div>' +
      '<details class="card"><summary><strong>Change my price list</strong></summary>' +
        '<p class="intro">One line per item: <code>Job | Description | Price</code>. Use <code>Any job</code> for things like skip hire. These are example prices to start with, so put your own in.</p>' +
        '<textarea id="q-book" rows="14" style="font-family:ui-monospace,monospace;font-size:.9rem">' + esc(B.settings.price_book || '') + '</textarea>' +
        '<div class="actions"><button class="btn" type="button" id="q-savebook">Save price list</button><p class="msg" id="q-bmsg" role="status"></p></div></details>';

    var rows = [];
    book.forEach(function (l, i) { rows.push({ job: l.job, description: l.description, qty: 1, price: l.price, on: false, key: 'b' + i }); });
    function drawLines() {
      var shown = rows.filter(function (r) { return r.custom || picked[r.job] || r.on; });
      document.getElementById('q-lines').innerHTML = shown.length ? shown.map(function (r) {
        var idx = rows.indexOf(r);
        return '<tr data-i="' + idx + '"><td><input type="checkbox" class="q-on" aria-label="Include ' + esc(r.description) + '"' + (r.on ? ' checked' : '') + ' style="width:22px;height:22px"></td>' +
          '<td><input type="text" class="q-desc" value="' + esc(r.description) + '" aria-label="Description"></td>' +
          '<td><input type="number" step="any" class="q-qty" value="' + r.qty + '" style="width:80px" aria-label="Quantity"></td>' +
          '<td><input type="number" step="any" class="q-price" value="' + r.price + '" style="width:110px" aria-label="Price"></td>' +
          '<td class="n amt">' + (r.on ? gbp(r.qty * r.price) : '') + '</td></tr>';
      }).join('') : '<tr><td colspan="5" class="intro">Tap a job above to see its usual lines.</td></tr>';
      document.querySelectorAll('#q-lines tr[data-i]').forEach(function (tr) {
        var r = rows[+tr.dataset.i];
        tr.querySelector('.q-on').onchange = function () { r.on = this.checked; drawLines(); };
        tr.querySelector('.q-desc').oninput = function () { r.description = this.value; };
        tr.querySelector('.q-qty').oninput = function () { r.qty = parseFloat(this.value) || 0; r.on = true; tr.querySelector('.q-on').checked = true; total(); tr.querySelector('.amt').textContent = gbp(r.qty * r.price); };
        tr.querySelector('.q-price').oninput = function () { r.price = parseFloat(this.value) || 0; r.on = true; tr.querySelector('.q-on').checked = true; total(); tr.querySelector('.amt').textContent = gbp(r.qty * r.price); };
      });
      total();
    }
    function total() {
      var t = rows.filter(function (r) { return r.on; }).reduce(function (s, r) { return s + r.qty * r.price; }, 0);
      var vat = B.settings.vat_registered ? t * B.settings.vat_rate / 100 : 0;
      document.getElementById('q-total').textContent = gbp(t + vat) + (vat ? ' inc VAT' : '');
      var title = document.getElementById('q-title');
      if (!title.dataset.touched) title.value = Object.keys(picked).filter(function (j) { return picked[j] && j !== 'Any job'; }).join(' and ');
    }
    document.getElementById('q-title').oninput = function () { this.dataset.touched = '1'; };
    bm.querySelectorAll('.jobtile').forEach(function (b) {
      b.onclick = function () { var j = b.dataset.job; picked[j] = !picked[j]; b.setAttribute('aria-pressed', picked[j] ? 'true' : 'false'); drawLines(); };
    });
    document.getElementById('q-add').onclick = function () {
      rows.push({ job: '', description: '', qty: 1, price: 0, on: true, custom: true }); drawLines();
      var all = document.querySelectorAll('#q-lines .q-desc'); all[all.length - 1].focus();
    };
    document.getElementById('q-cust').onchange = function () { document.getElementById('q-new').hidden = this.value !== 'new'; };
    drawLines();

    document.getElementById('q-make').onclick = function () {
      var items = rows.filter(function (r) { return r.on && r.description.trim(); }).map(function (r) { return { description: r.description.trim(), qty: r.qty, unit_price: r.price }; });
      if (!items.length) { say('q-msg', 'Tick at least one line.', false); return; }
      var sel = document.getElementById('q-cust').value, btn = this;
      var cust = sel && sel !== 'new' ? Promise.resolve(Number(sel)) :
        sel === 'new' && document.getElementById('q-name').value.trim() ?
          api('/api/customers', { name: document.getElementById('q-name').value.trim(), phone: document.getElementById('q-phone').value.trim(),
            postcode: document.getElementById('q-postcode').value.trim().toUpperCase(), email: '', address: v ? v.address : '' }).then(function (c) { return c.id; }) :
          Promise.reject(new Error('Choose a customer, or pick + New customer and add their name.'));
      btn.disabled = true; say('q-msg', 'Creating…');
      cust.then(function (cid) {
        return api('/api/docs', { kind: 'quote', customer_id: cid, title: document.getElementById('q-title').value.trim(), items: items,
          notes: document.getElementById('q-notes').value.trim(), status: 'draft', vat_rate: B.settings.vat_registered ? B.settings.vat_rate : 0 });
      }).then(function (doc) {
        var done = v ? (v.quote_id = doc.id, v.customer_id = doc.customer_id, visits.put(v)) : Promise.resolve();
        return done.then(loadBase).then(function () { bizView('doc', { id: doc.id, kind: 'quote' }); });
      }).catch(function (e) { btn.disabled = false; say('q-msg', e.message, false); });
    };
    document.getElementById('q-savebook').onclick = function () {
      api('/api/settings', { price_book: document.getElementById('q-book').value }).then(function (ns) {
        B.settings = ns; say('q-bmsg', 'Saved.', true); setTimeout(function () { drawQuick(v); }, 500);
      }).catch(function (e) { say('q-bmsg', e.message, false); });
    };
  }

  /* ---------- Socials ---------- */
  var NETS = [
    { k: 'facebook', name: 'Facebook', login: 'https://www.facebook.com/login', post: 'https://www.facebook.com/', hint: 'facebook.com/yourpage' },
    { k: 'instagram', name: 'Instagram', login: 'https://www.instagram.com/accounts/login/', post: 'https://www.instagram.com/', hint: 'instagram.com/yourname' },
    { k: 'tiktok', name: 'TikTok', login: 'https://www.tiktok.com/login', post: 'https://www.tiktok.com/upload', hint: 'tiktok.com/@yourname' },
    { k: 'google', name: 'Google Business Profile', login: 'https://business.google.com/', post: 'https://business.google.com/', hint: 'Your Google Maps listing link' },
  ];
  var IDEAS = {
    finished: 'Another job finished ✅ {job}Thinking about something similar? Get a free quote at buildandchill.co.uk',
    before: 'Before and after 👀 {job}Swipe to see the difference. Free quotes at buildandchill.co.uk',
    aircon: 'Beat the heat this summer ❄️ Air conditioning supplied and fitted across Leicestershire by F-Gas registered installers. Use code AC20 for 20% off your first install. Get your price at buildandchill.co.uk',
    tip: 'Quick tip from the van 🔧 ',
    reviews: 'Thank you to our customers for the kind words ⭐ If we have done a job for you, we would really appreciate a Google review.',
  };
  function idea(k, job) { return IDEAS[k].replace('{job}', job && job !== 'Other' ? job + ' in Leicestershire. ' : ''); }
  var DRAFTS = 'bc-social-drafts';
  function drafts() { try { return JSON.parse(localStorage.getItem(DRAFTS) || '[]'); } catch (e) { return []; } }

  BCX.socials = function () {
    var s = B.settings, photos = [];
    bm.innerHTML = '<div class="head"><h2>Socials</h2></div>' +
      '<div class="card"><h3 style="margin-top:0">Make a post</h3>' +
        '<div class="actions"><label class="btn">Add photos or a video<input type="file" accept="image/*,video/*" multiple id="s-files" class="vis-hide"></label>' +
          '<button type="button" class="btn line" id="s-visit">Use photos from a site visit</button></div>' +
        '<div class="vgrid" id="s-photos"></div>' +
        '<p class="row"><span>Start with</span></p><div class="actions">' +
          '<button type="button" class="btn small line" data-idea="finished">Job finished</button>' +
          '<button type="button" class="btn small line" data-idea="before">Before and after</button>' +
          '<button type="button" class="btn small line" data-idea="aircon">Air con offer</button>' +
          '<button type="button" class="btn small line" data-idea="tip">Handy tip</button>' +
          '<button type="button" class="btn small line" data-idea="reviews">Ask for reviews</button></div>' +
        '<label class="row"><span>Caption</span><textarea id="s-text" rows="6" placeholder="What did you do, where, and how can people get a quote?"></textarea></label>' +
        '<div class="actions"><button type="button" class="btn small line" id="s-tags">Add my hashtags</button><span class="intro" style="margin:0" id="s-count">0 characters</span></div>' +
        '<h3>Post it</h3>' +
        '<div class="actions">' + (navigator.canShare ? '<button type="button" class="btn" id="s-share">Post from this phone</button>' : '') +
          '<button type="button" class="btn line" id="s-copy">Copy caption</button>' +
          NETS.map(function (n) { return '<a class="btn line" target="_blank" rel="noopener" href="' + n.post + '" data-open="' + n.k + '">Open ' + n.name + '</a>'; }).join('') +
          '<button type="button" class="btn line" id="s-draft">Save as draft</button></div>' +
        '<p class="msg" id="s-msg" role="status"></p>' +
        '<p class="intro small">' + (navigator.canShare ? '<strong>Post from this phone</strong> opens your phone\'s share menu with the photos and caption. Pick Facebook, Instagram or TikTok and post. ' : 'On a computer, copy the caption, open the site and paste it into a new post. ') +
          'Posting automatically without opening the apps needs Meta and TikTok to approve a business app first; this works straight away.</p></div>' +
      '<div class="card"><h3 style="margin-top:0">Share the website or a blog post</h3><div class="actions">' +
        '<select id="s-link" style="width:auto;max-width:100%"><option value="https://buildandchill.co.uk/">Home page</option></select>' +
        '<a class="btn line" id="s-fb" target="_blank" rel="noopener" href="#">Share on Facebook</a>' +
        '<a class="btn line" id="s-x" target="_blank" rel="noopener" href="#">Share on X</a>' +
        '<a class="btn line" id="s-li" target="_blank" rel="noopener" href="#">Share on LinkedIn</a>' +
        '<a class="btn wa" id="s-wa" target="_blank" rel="noopener" href="#">Share on WhatsApp</a></div></div>' +
      '<div class="card" id="s-drafts"></div>' +
      '<form class="card" id="s-acc"><h3 style="margin-top:0">Your accounts</h3>' +
        '<p class="intro">Log in to each one once in this browser and it stays logged in. Add your page links so they are one tap away.</p>' +
        NETS.map(function (n) {
          return '<div class="netrow"><strong>' + n.name + '</strong><input type="text" data-k="social_' + n.k + '" value="' + esc(s['social_' + n.k] || '') + '" placeholder="' + n.hint + '" aria-label="' + n.name + ' page link">' +
            '<a class="btn small line" href="' + n.login + '" target="_blank" rel="noopener">Log in</a>' +
            (s['social_' + n.k] ? '<a class="btn small line" href="' + esc(fullUrl(s['social_' + n.k])) + '" target="_blank" rel="noopener">My page</a>' : '') + '</div>';
        }).join('') +
        '<label class="row"><span>My hashtags</span><input type="text" data-k="social_hashtags" value="' + esc(s.social_hashtags || '') + '"></label>' +
        '<div class="actions"><button class="btn" type="submit">Save accounts</button><p class="msg" id="s-amsg" role="status"></p></div></form>';

    var text = document.getElementById('s-text');
    function count() { document.getElementById('s-count').textContent = text.value.length + ' characters' + (text.value.length > 2200 ? ' (too long for Instagram, max 2,200)' : ''); }
    text.oninput = count;
    bm.querySelectorAll('[data-idea]').forEach(function (b) {
      b.onclick = function () { text.value = idea(b.dataset.idea, ''); count(); text.focus(); };
    });
    document.getElementById('s-tags').onclick = function () {
      var tags = (B.settings.social_hashtags || '').trim();
      if (tags && text.value.indexOf(tags) < 0) text.value = text.value.trim() + '\n\n' + tags;
      count();
    };
    function drawPhotos() {
      document.getElementById('s-photos').innerHTML = photos.map(function (p, i) {
        return '<figure>' + (p.type.indexOf('video') === 0 ? '<video src="' + p.url + '" muted></video>' : '<img src="' + p.url + '" alt="Post photo ' + (i + 1) + '">') +
          '<button type="button" data-rm="' + i + '" aria-label="Remove">×</button></figure>';
      }).join('');
      bm.querySelectorAll('#s-photos [data-rm]').forEach(function (b) { b.onclick = function () { photos.splice(+b.dataset.rm, 1); drawPhotos(); }; });
    }
    document.getElementById('s-files').onchange = function () {
      Array.prototype.forEach.call(this.files, function (f) { photos.push({ file: f, url: URL.createObjectURL(f), type: f.type }); });
      this.value = ''; drawPhotos();
    };
    document.getElementById('s-visit').onclick = function () {
      visits.all().then(function (vs) {
        var withPics = vs.filter(function (x) { return (x.photos || []).length; });
        if (!withPics.length) { say('s-msg', 'No site visit photos on this device yet.', false); return; }
        var v = withPics[0];
        v.photos.forEach(function (p, i) { var f = dataUrlToFile(p, 'job-' + (i + 1) + '.jpg'); photos.push({ file: f, url: p, type: f.type }); });
        if (!text.value.trim()) text.value = idea('finished', v.job);
        drawPhotos(); count();
        say('s-msg', 'Added ' + v.photos.length + ' photos from your latest site visit (' + ukDate(v.date) + ').', true);
      });
    };
    var share = document.getElementById('s-share');
    if (share) share.onclick = function () {
      var payload = { text: text.value, files: photos.map(function (p) { return p.file; }) };
      if (!payload.files.length || !navigator.canShare(payload)) delete payload.files;
      copy(text.value).catch(function () {}).then(function () { return navigator.share(payload); })
        .then(function () { say('s-msg', 'Shared. The caption is also copied, because Instagram and TikTok make you paste it yourself.', true); })
        .catch(function (e) { if (e && e.name !== 'AbortError') say('s-msg', 'Your phone could not share that. Try fewer photos.', false); });
    };
    document.getElementById('s-copy').onclick = function () { copy(text.value).then(function () { say('s-msg', 'Caption copied. Open the app and paste it into a new post.', true); }); };
    bm.querySelectorAll('[data-open]').forEach(function (a) { a.addEventListener('click', function () { if (text.value) copy(text.value).catch(function () {}); }); });
    document.getElementById('s-draft').onclick = function () {
      if (!text.value.trim()) { say('s-msg', 'Write a caption first.', false); return; }
      var d = drafts(); d.unshift({ at: new Date().toISOString(), text: text.value }); localStorage.setItem(DRAFTS, JSON.stringify(d.slice(0, 20)));
      drawDrafts(); say('s-msg', 'Draft saved on this device. Photos are not kept with drafts.', true);
    };
    function drawDrafts() {
      var d = drafts(), box = document.getElementById('s-drafts');
      box.hidden = !d.length;
      box.innerHTML = '<h3 style="margin-top:0">Drafts</h3>' + d.map(function (x, i) {
        return '<div class="draft"><p>' + esc(x.text.slice(0, 160)) + (x.text.length > 160 ? '…' : '') + '</p><div class="actions">' +
          '<button type="button" class="btn small line" data-use="' + i + '">Use</button><button type="button" class="btn danger" data-drm="' + i + '">Delete</button></div></div>';
      }).join('');
      box.querySelectorAll('[data-use]').forEach(function (b) { b.onclick = function () { text.value = d[+b.dataset.use].text; count(); text.focus(); }; });
      box.querySelectorAll('[data-drm]').forEach(function (b) { b.onclick = function () { d.splice(+b.dataset.drm, 1); localStorage.setItem(DRAFTS, JSON.stringify(d)); drawDrafts(); }; });
    }
    drawDrafts();

    var sel = document.getElementById('s-link');
    function links() {
      var u = encodeURIComponent(sel.value), t = encodeURIComponent(sel.options[sel.selectedIndex].text);
      document.getElementById('s-fb').href = 'https://www.facebook.com/sharer/sharer.php?u=' + u;
      document.getElementById('s-x').href = 'https://twitter.com/intent/tweet?url=' + u + '&text=' + t;
      document.getElementById('s-li').href = 'https://www.linkedin.com/sharing/share-offsite/?url=' + u;
      document.getElementById('s-wa').href = 'https://wa.me/?text=' + t + '%20' + u;
    }
    sel.onchange = links; links();
    api('/api/visual/blog').then(function (posts) {
      posts.forEach(function (p) { var o = document.createElement('option'); o.value = 'https://buildandchill.co.uk' + p.url; o.textContent = p.title; sel.appendChild(o); });
    }).catch(function () {});

    document.getElementById('s-acc').onsubmit = function (e) {
      e.preventDefault();
      var out = {};
      bm.querySelectorAll('#s-acc [data-k]').forEach(function (el) { out[el.dataset.k] = el.value.trim(); });
      api('/api/settings', out).then(function (ns) { B.settings = ns; say('s-amsg', 'Saved.', true); })
        .catch(function (err) { say('s-amsg', err.message, false); });
    };
  };
  function fullUrl(u) { return /^https?:\/\//.test(u) ? u : 'https://' + u.replace(/^\/+/, ''); }

  /* ---------- Accounts: money in and out by month ---------- */
  BCX.accounts = function () {
    return Promise.all([api('/api/docs?kind=invoice'), api('/api/receipts?photos=0')]).then(function (r) {
      var inv = r[0].filter(function (d) { return d.status !== 'cancelled'; }), rec = r[1];
      var now = new Date(), months = [];
      for (var i = 0; i < 12; i++) { var d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(d.toISOString().slice(0, 7)); }
      // UK tax year starts 6 April
      var y = now.getMonth() > 3 || (now.getMonth() === 3 && now.getDate() >= 6) ? now.getFullYear() : now.getFullYear() - 1;
      var tyStart = y + '-04-06', tyEnd = (y + 1) + '-04-05';
      function sum(list, f) { return list.reduce(function (s, x) { return s + f(x); }, 0); }
      var paidIn = function (from, to) { return sum(inv.filter(function (d) { return d.paid_date && d.paid_date >= from && d.paid_date <= to; }), function (d) { return +d.amount_paid; }); };
      var spent = function (from, to) { return sum(rec.filter(function (x) { return x.date >= from && x.date <= to; }), function (x) { return +x.amount; }); };
      var tyIn = paidIn(tyStart, tyEnd), tyOut = spent(tyStart, tyEnd);
      var owed = sum(inv.filter(function (d) { return d.status === 'unpaid'; }), function (d) { return d.balance; });
      bm.innerHTML = '<div class="head"><h2>Accounts</h2><div class="actions"><a class="btn line" href="#" data-dl="/api/receipts.csv">Download receipts (CSV)</a>' +
        '<button class="btn line" type="button" id="a-inv">Download invoices (CSV)</button></div></div>' +
        '<p class="intro">Tax year ' + y + ' to ' + (y + 1) + ' (6 April to 5 April). Money in counts paid invoices by the date paid. Give the downloads to your accountant.</p>' +
        '<div class="tiles"><div class="tile"><b>' + gbp(tyIn) + '</b><span>Money in this tax year</span></div>' +
        '<div class="tile"><b>' + gbp(tyOut) + '</b><span>Spent (receipts)</span></div>' +
        '<div class="tile"><b>' + gbp(tyIn - tyOut) + '</b><span>Rough profit before tax</span></div>' +
        '<div class="tile"><b>' + gbp(owed) + '</b><span>Still owed to you</span></div></div>' +
        '<table class="list"><thead><tr><th>Month</th><th class="n">Invoiced</th><th class="n">Money in</th><th class="n">Spent</th><th class="n">Difference</th></tr></thead><tbody>' +
        months.map(function (m) {
          var from = m + '-01', to = m + '-31';
          var billed = sum(inv.filter(function (d) { return d.issue_date.slice(0, 7) === m; }), function (d) { return d.total; });
          var a = paidIn(from, to), b = spent(from, to);
          var label = new Date(m + '-15').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
          return '<tr class="norow"><td>' + label + '</td><td class="n">' + gbp(billed) + '</td><td class="n">' + gbp(a) + '</td><td class="n">' + gbp(b) + '</td><td class="n">' + gbp(a - b) + '</td></tr>';
        }).join('') + '</tbody></table>' +
        '<p class="intro small" style="margin-top:12px">This is a guide to help you keep track, not a tax return.</p>';
      document.getElementById('a-inv').onclick = function () {
        var q = function (v) { v = String(v == null ? '' : v); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
        var lines = [['Number', 'Date', 'Customer', 'Job', 'Total', 'Paid', 'Date paid', 'Still owed', 'Status'].join(',')].concat(r[0].map(function (d) {
          return [d.number, d.issue_date, d.customer_name, d.title, d.total.toFixed(2), Number(d.amount_paid || 0).toFixed(2), d.paid_date, d.balance.toFixed(2), d.status].map(q).join(',');
        }));
        var a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv' }));
        a.download = 'invoices.csv'; document.body.appendChild(a); a.click(); a.remove();
      };
    });
  };
})();
