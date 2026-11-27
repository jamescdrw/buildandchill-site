/* Quote chat: asks a few simple questions, then sends the request to Ashley by WhatsApp or email. */
(function () {
  var cfg = document.getElementById('qchat-cfg');
  if (!cfg || document.getElementById('qchat')) return;
  var EMAIL = cfg.getAttribute('data-email') || 'info@buildandchill.co.uk';
  var WA = (cfg.getAttribute('data-whatsapp') || '').replace(/\D/g, '').replace(/^0/, '44');
  var PHONE = cfg.getAttribute('data-phone') || '';

  var JOBS = {
    'Air conditioning': { q: 'How many rooms would you like cooled?', a: ['1 room', '2 rooms', '3 rooms', '4 or more'] },
    'Kitchen': { q: 'Which suits best?', a: ['Supply and fit', 'Fit only (I have the kitchen)', 'Not sure yet'] },
    'Bathroom or en-suite': { q: 'What kind of room?', a: ['Full bathroom', 'En-suite', 'Shower room', 'Wet room'] },
    'Extension': { q: 'What are you thinking of?', a: ['Single storey', 'Two storey', 'Kitchen extension', 'Not sure yet'] },
    'Commercial ceiling': { q: 'Roughly how big is the area?', a: ['Under 50 m²', '50 to 200 m²', 'Over 200 m²', 'Not sure'] },
    'Repairs or maintenance': { q: 'Is it urgent?', a: ['Yes, urgent', 'In the next few weeks', 'No rush'] },
    'Something else': null,
  };
  var WHEN = ['As soon as possible', 'Within a month', '1 to 3 months', 'Just getting prices'];
  var ans = {};

  var root = document.createElement('div');
  root.id = 'qchat';
  root.innerHTML =
    '<button type="button" class="qc-open" aria-expanded="false" aria-controls="qc-panel">Get a quote</button>' +
    '<section class="qc-panel" id="qc-panel" role="dialog" aria-label="Get a quote" hidden>' +
      '<header class="qc-head"><div><strong>Get a free quote</strong><span>Answers go straight to Ashley</span></div>' +
      '<button type="button" class="qc-x" aria-label="Close">×</button></header>' +
      '<div class="qc-log" aria-live="polite"></div>' +
      '<div class="qc-input"></div>' +
    '</section>';
  document.body.appendChild(root);
  var openBtn = root.querySelector('.qc-open'), panel = root.querySelector('.qc-panel');
  var log = root.querySelector('.qc-log'), input = root.querySelector('.qc-input');

  function bot(text) { var p = document.createElement('p'); p.className = 'qc-bot'; p.textContent = text; log.appendChild(p); scroll(); }
  function me(text) { var p = document.createElement('p'); p.className = 'qc-me'; p.textContent = text; log.appendChild(p); scroll(); }
  function scroll() { log.scrollTop = log.scrollHeight; }

  function chips(options, onPick, typeOwn) {
    input.innerHTML = '';
    var wrap = document.createElement('div'); wrap.className = 'qc-chips';
    options.forEach(function (o) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = o;
      b.onclick = function () { me(o); onPick(o); };
      wrap.appendChild(b);
    });
    input.appendChild(wrap);
    if (typeOwn) text(typeOwn, onPick, true);
    var first = wrap.querySelector('button'); if (first) first.focus();
  }
  function text(placeholder, onDone, optional, opts) {
    opts = opts || {};
    var f = document.createElement('form'); f.className = 'qc-text'; f.noValidate = true;
    var el = document.createElement(opts.multi ? 'textarea' : 'input');
    if (!opts.multi) { el.type = opts.type || 'text'; if (opts.auto) el.autocomplete = opts.auto; }
    else el.rows = 3;
    el.placeholder = placeholder; el.setAttribute('aria-label', placeholder);
    var send = document.createElement('button'); send.type = 'submit'; send.textContent = 'Send';
    f.append(el, send);
    if (optional === 'skip') {
      var sk = document.createElement('button'); sk.type = 'button'; sk.className = 'qc-skip'; sk.textContent = 'Skip';
      sk.onclick = function () { me('Skip'); onDone(''); }; f.appendChild(sk);
    }
    f.onsubmit = function (e) {
      e.preventDefault();
      var v = el.value.trim();
      var bad = opts.check ? opts.check(v) : (!v && optional !== 'skip' ? 'Type an answer first.' : '');
      if (bad) { var er = f.querySelector('.qc-err') || f.appendChild(Object.assign(document.createElement('p'), { className: 'qc-err' })); er.textContent = bad; el.focus(); return; }
      me(v); onDone(v);
    };
    if (!optional || optional === 'skip') input.innerHTML = '';
    input.appendChild(f);
    if (!optional || optional === 'skip') el.focus();
  }

  function start() {
    log.innerHTML = ''; ans = {};
    bot("Hi, I'll get your quote request to Ashley. It takes about a minute.");
    bot('What do you need?');
    chips(Object.keys(JOBS), function (job) {
      ans.job = job;
      var j = JOBS[job];
      if (!j) return askMore(true);
      bot(j.q);
      chips(j.a, function (a) { ans.detail = a; askWhen(); });
    });
  }
  function askWhen() {
    bot('When would you like it done?');
    chips(WHEN, function (w) { ans.when = w; askMore(false); });
  }
  function askMore(required) {
    bot(required ? 'Tell me a bit about the job.' : 'Anything else Ashley should know? Sizes, what you have already bought, access…');
    text('Type here', function (v) { ans.more = v; if (required) askWhenAfter(); else askName(); }, required ? null : 'skip', { multi: true });
  }
  function askWhenAfter() { bot('When would you like it done?'); chips(WHEN, function (w) { ans.when = w; askName(); }); }
  function askName() {
    bot("What's your name?");
    text('Your name', function (v) { ans.name = v; askPhone(); }, null, { auto: 'name' });
  }
  function askPhone() {
    bot('Thanks ' + ans.name.split(' ')[0] + '. What number can Ashley call you on?');
    text('Phone number', function (v) { ans.phone = v; askPostcode(); }, null, { type: 'tel', auto: 'tel',
      check: function (v) { return v.replace(/\D/g, '').length < 10 ? 'Enter a full phone number, like 07700 900123.' : ''; } });
  }
  function askPostcode() {
    bot("And the job's postcode?");
    text('Postcode', function (v) { ans.postcode = v.toUpperCase(); finish(); }, null, { auto: 'postal-code',
      check: function (v) { return /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/.test(v.trim()) ? '' : 'Enter a full postcode, like LE4 3AB.'; } });
  }

  function message() {
    return 'Quote request from the website\n\n' +
      'Job: ' + ans.job + (ans.detail ? ' (' + ans.detail + ')' : '') + '\n' +
      'When: ' + (ans.when || 'Not said') + '\n' +
      (ans.more ? 'Details: ' + ans.more + '\n' : '') +
      '\nName: ' + ans.name + '\nPhone: ' + ans.phone + '\nPostcode: ' + ans.postcode + '\n';
  }
  function finish() {
    bot("Here's your request. Choose how to send it and it opens ready to go. Photos of the job help, so add a few if you can.");
    var box = document.createElement('pre'); box.className = 'qc-sum'; box.textContent = message(); log.appendChild(box);
    input.innerHTML = '';
    var w = document.createElement('div'); w.className = 'qc-send';
    var subject = 'Quote request: ' + ans.job + ' (' + ans.postcode + ')';
    if (WA.length >= 10) w.appendChild(link('Send on WhatsApp', 'https://wa.me/' + WA + '?text=' + encodeURIComponent(message()), 'qc-wa'));
    w.appendChild(link('Send by email', 'mailto:' + EMAIL + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(message()), ''));
    if (PHONE) w.appendChild(link('Or call ' + PHONE, 'tel:' + PHONE.replace(/\s/g, ''), 'qc-plain'));
    var again = document.createElement('button'); again.type = 'button'; again.className = 'qc-skip'; again.textContent = 'Start again';
    again.onclick = start; w.appendChild(again);
    input.appendChild(w);
    scroll();
    w.querySelector('a').focus();
  }
  function link(label, href, cls) {
    var a = document.createElement('a'); a.href = href; a.textContent = label; a.className = 'qc-btn ' + cls;
    if (href.indexOf('http') === 0) { a.target = '_blank'; a.rel = 'noopener'; }
    a.onclick = function () { setTimeout(function () { bot("Thanks. Once it's sent, Ashley will get back to you to arrange a visit."); }, 600); };
    return a;
  }

  function setOpen(on) {
    panel.hidden = !on; openBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
    root.classList.toggle('is-open', on);
    if (on && !log.children.length) start();
    if (on) { var f = input.querySelector('button, input, textarea'); if (f) f.focus(); } else openBtn.focus();
  }
  openBtn.onclick = function () { setOpen(panel.hidden); };
  root.querySelector('.qc-x').onclick = function () { setOpen(false); };
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !panel.hidden) setOpen(false); });
  document.querySelectorAll('[data-open-chat]').forEach(function (b) {
    b.addEventListener('click', function (e) { e.preventDefault(); setOpen(true); });
  });
  window.BCQuoteChat = { open: function () { setOpen(true); } };
})();
