/*
 * Air con price calculator. Same calculation as the Air Conditioning For You
 * quote engine; prices come from ac-prices.js (edited in the admin area).
 * Adds the first-install discount code and booking with a deposit.
 */
(function () {
  var P = window.AC_PRICES;
  var form = document.getElementById('ac-calc');
  if (!P || !form) return;

  var out = document.getElementById('ac-result');
  var gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  var round5 = function (n) { return Math.round(n / 5) * 5; };
  var CODE = (form.getAttribute('data-code') || '').toUpperCase();
  var PERCENT = Number(form.getAttribute('data-percent')) || 0;

  function fill(id, obj, selected) {
    var sel = document.getElementById(id);
    Object.keys(obj).forEach(function (k) {
      var o = document.createElement('option');
      o.value = k; o.textContent = obj[k].label + (obj[k].kw ? ' (' + obj[k].kw + ')' : '');
      if (k === selected) o.selected = true;
      sel.appendChild(o);
    });
  }
  fill('ac-house', P.houses, 'semi');
  fill('ac-room', P.rooms, 'medium');
  fill('ac-run', P.runs, 'medium');
  fill('ac-brand', P.brands, 'either');
  fill('ac-range', P.ranges, 'mid');

  function sizeFromArea(m2, ceiling) {
    var area = m2 * ((P.ceilings && P.ceilings[ceiling]) || 1);
    var keys = Object.keys(P.rooms);
    var band = keys.find(function (k) { return area <= P.rooms[k].maxArea; }) || keys[keys.length - 1];
    return { area: Math.round(m2 * 10) / 10, band: band };
  }

  function codeValid(c) { return !!CODE && (c || '').trim().toUpperCase() === CODE; }

  function calculate(i) {
    var units = Math.min(5, Math.max(1, Number(i.units) || 1));
    var range = P.ranges[i.range] || P.ranges.mid;
    var house = P.houses[i.house] || P.houses.semi;
    var run = P.runs[i.run] || P.runs.medium;
    var brand = P.brands[i.brand] || P.brands.either;
    var room = P.rooms[i.room] || P.rooms.medium;

    var equipment = range.firstUnit + range.extraUnit * (units - 1);
    if (units >= 2) equipment += range.outdoorMultiUplift * (1 + (units - 2) * 0.35);
    var roomUplift = equipment * (room.factor - 1);
    equipment *= room.factor;
    var runCost = run.add + (units > 1 ? (units - 1) * run.add * 0.45 : 0);
    var subtotal = (equipment + runCost) * house.factor * brand.factor;

    var pc = (i.postcode || '').toUpperCase().replace(/\s/g, '');
    var local = (P.localPostcodes || []).some(function (p) { return pc.indexOf(p) === 0 && /^[A-Z]{2}\d/.test(pc); });
    if (local) subtotal *= 1 - P.localDiscount;

    var total = round5(Math.max(P.minPrice, subtotal));
    var discount = codeValid(i.code) ? round5(total * PERCENT / 100) : 0;
    total -= discount;
    var deposit = round5(total * P.depositPercent / 100);
    return {
      total: total, deposit: deposit, balance: total - deposit, units: units, local: local, discount: discount,
      system: units === 1 ? 'Single split system' : 'Multi-split system, ' + units + ' indoor units',
      room: room, range: range, brand: brand, house: house, run: run,
      rows: [
        ['Equipment and installation', round5(equipment - roomUplift)],
        ['Room size (' + room.label + ', ' + room.kw + ')', round5(roomUplift)],
        ['Pipe runs (' + run.label.toLowerCase() + ')', round5(runCost)],
        [house.label, house.factor === 1 ? 0 : round5((equipment + runCost) * (house.factor - 1))],
        ['Brand: ' + brand.label, brand.factor === 1 ? 0 : round5((equipment + runCost) * (brand.factor - 1))]
      ]
    };
  }

  // Unit count buttons
  var unitsInput = form.elements.units;
  form.querySelectorAll('[data-units]').forEach(function (b) {
    b.addEventListener('click', function () {
      form.querySelectorAll('[data-units]').forEach(function (x) { x.setAttribute('aria-pressed', 'false'); });
      b.setAttribute('aria-pressed', 'true');
      unitsInput.value = b.getAttribute('data-units');
    });
  });

  // Room measure helper
  document.getElementById('ac-measure-btn').addEventListener('click', function () {
    var l = parseFloat(document.getElementById('ac-len').value);
    var w = parseFloat(document.getElementById('ac-wid').value);
    var note = document.getElementById('ac-measure-note');
    if (!(l > 0) || !(w > 0)) { note.textContent = 'Enter the room length and width in metres.'; return; }
    var ceiling = document.getElementById('ac-ceiling').value;
    var s = sizeFromArea(l * w, ceiling);
    document.getElementById('ac-room').value = s.band;
    note.textContent = s.area + ' m², so we’ve set room size to ' + P.rooms[s.band].label.toLowerCase() + ' (' + P.rooms[s.band].kw + ').' +
      (ceiling !== 'standard' ? ' Allowed for the higher ceiling.' : '');
  });

  var last = null;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var codeEl = form.elements.code;
    var code = codeEl ? codeEl.value : '';
    var q = last = calculate({
      units: unitsInput.value, range: form.elements.range.value, house: form.elements.house.value,
      run: form.elements.run.value, brand: form.elements.brand.value, room: form.elements.room.value,
      postcode: form.elements.postcode.value, code: code
    });
    q.code = q.discount ? CODE : '';
    document.getElementById('ac-total').textContent = gbp.format(q.total);
    document.getElementById('ac-system').textContent = q.system + ', ' + q.range.label.toLowerCase() + ', ' + q.room.kw + ' main room';
    var rows = q.rows.filter(function (r) { return r[1] !== 0; }).map(function (r) {
      return '<tr><th scope="row">' + r[0] + '</th><td>' + gbp.format(r[1]) + '</td></tr>';
    }).join('');
    if (q.local) rows += '<tr><th scope="row">Leicestershire and East Midlands discount</th><td>' + Math.round(P.localDiscount * 100) + '% off</td></tr>';
    if (q.discount) rows += '<tr class="disc"><th scope="row">Code ' + CODE + ', ' + PERCENT + '% off your first install</th><td>−' + gbp.format(q.discount) + '</td></tr>';
    rows += '<tr class="sum"><th scope="row">Total installed</th><td>' + gbp.format(q.total) + '</td></tr>' +
      '<tr><th scope="row">Deposit to book (' + P.depositPercent + '%)</th><td>' + gbp.format(q.deposit) + '</td></tr>' +
      '<tr><th scope="row">Balance on install day</th><td>' + gbp.format(q.balance) + '</td></tr>';
    document.getElementById('ac-rows').innerHTML = rows;

    var codeNote = document.getElementById('ac-code-note');
    if (codeEl) {
      if (!codeNote) {
        codeNote = document.createElement('p'); codeNote.id = 'ac-code-note'; codeNote.className = 'code-note';
        codeEl.parentNode.appendChild(codeNote);
      }
      codeNote.textContent = code.trim() && !q.discount ? 'That code isn’t recognised. Check the spelling, or leave it blank.' : (q.discount ? 'Code ' + CODE + ' applied.' : '');
    }
    out.hidden = false;
    out.focus();
  });

  // Send price with general enquiry
  document.getElementById('ac-send').addEventListener('click', function () {
    if (!last) return;
    var type = document.getElementById('f-type');
    var msg = document.getElementById('f-msg');
    var pc = document.getElementById('f-postcode');
    if (type) type.value = 'Air conditioning installation';
    if (pc && !pc.value) pc.value = form.elements.postcode.value;
    if (msg) msg.value = summary(last);
    document.getElementById('quote').scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () { document.getElementById('f-name').focus({ preventScroll: true }); }, 500);
  });

  function summary(q) {
    return 'Air con price: ' + gbp.format(q.total) + (q.code ? ' (code ' + q.code + ' applied, ' + gbp.format(q.discount) + ' off)' : '') + '\n' +
      q.system + '\nKit: ' + q.range.label + ', brand: ' + q.brand.label + '\nMain room: ' + q.room.label + ' (' + q.room.kw + ')\n' +
      'Property: ' + q.house.label + ', pipe run ' + q.run.label.toLowerCase() + '\n' +
      'Deposit: ' + gbp.format(q.deposit) + ', balance on install day: ' + gbp.format(q.balance) + '\n';
  }

  // Booking and deposit
  var book = document.getElementById('ac-book');
  var payLink = (book.getAttribute('data-pay') || '').trim();
  var dateEl = document.getElementById('b-date');
  var d = new Date(); d.setDate(d.getDate() + 2); dateEl.min = d.toISOString().slice(0, 10);

  document.getElementById('ac-book-open').addEventListener('click', function () {
    if (!last) return;
    document.getElementById('ac-book-sum').textContent = last.system + ' for ' + gbp.format(last.total) +
      (last.code ? ' with code ' + last.code : '') + '. Pay a ' + gbp.format(last.deposit) + ' deposit to secure your day; the ' +
      gbp.format(last.balance) + ' balance is paid once the install is finished.';
    document.getElementById('b-paynote').textContent = payLink
      ? 'You’ll be taken to a secure payment page to pay your ' + gbp.format(last.deposit) + ' deposit.'
      : 'We’ll confirm your date and send you a secure link to pay your ' + gbp.format(last.deposit) + ' deposit.';
    document.getElementById('b-submit').textContent = 'Book and pay ' + gbp.format(last.deposit) + ' deposit';
    var bp = document.getElementById('b-postcode');
    if (!bp.value) bp.value = form.elements.postcode.value;
    form.hidden = true; book.hidden = false;
    book.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(function () { document.getElementById('b-name').focus({ preventScroll: true }); }, 400);
  });

  document.getElementById('ac-book-back').addEventListener('click', function () {
    book.hidden = true; form.hidden = false; out.focus();
  });

  book.addEventListener('submit', function (e) {
    e.preventDefault();
    var err = document.getElementById('b-error');
    var need = [['b-name', 'name'], ['b-phone', 'phone number'], ['b-email', 'email'], ['b-address', 'address'], ['b-postcode', 'postcode'], ['b-date', 'install date']];
    var missing = [];
    need.forEach(function (n) {
      var el = document.getElementById(n[0]);
      var bad = !el.value.trim() || (el.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(el.value.trim()));
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) missing.push(n[1]);
    });
    var terms = document.getElementById('b-terms');
    if (missing.length || !terms.checked) {
      err.textContent = missing.length ? 'Add your ' + missing.join(', ') + ' to book.' : 'Tick the box to agree to the terms and conditions.';
      err.hidden = false;
      (missing.length ? document.querySelector('#ac-book [aria-invalid="true"]') : terms).focus();
      return;
    }
    err.hidden = true;
    var f = book.elements;
    var when = new Date(f.date.value + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var ref = 'BC-' + Date.now().toString(36).toUpperCase().slice(-6);
    var body = 'Booking reference: ' + ref + '\n\nName: ' + f.name.value + '\nPhone: ' + f.phone.value + '\nEmail: ' + f.email.value +
      '\nAddress: ' + f.address.value + ', ' + f.postcode.value + '\nPreferred date: ' + when + ', ' + f.slot.value + '\n\n' + summary(last);

    if (payLink) {
      var url = payLink;
      if (/paypal\.me\//i.test(url)) url = url.replace(/\/+$/, '') + '/' + last.deposit + 'GBP';
      window.open(url, '_blank', 'noopener');
    }
    var to = book.getAttribute('data-email') || '';
    window.location.href = 'mailto:' + to + '?subject=' + encodeURIComponent('Air con booking ' + ref + ': ' + when) + '&body=' + encodeURIComponent(body);

    var done = document.getElementById('ac-book-done');
    done.innerHTML = '<h3>Booking request ready, ' + esc(f.name.value.split(' ')[0]) + '</h3><p>Your reference is <strong>' + ref + '</strong>. Send the email that has just opened so we get your booking for <strong>' + esc(when) + '</strong>. ' +
      (payLink ? 'Pay your <strong>' + gbp.format(last.deposit) + '</strong> deposit in the payment tab to secure the date.' : 'We’ll confirm the date and send a secure link for your <strong>' + gbp.format(last.deposit) + '</strong> deposit.') +
      ' The ' + gbp.format(last.balance) + ' balance is due once your install is finished.</p>';
    done.hidden = false; done.focus();
  });

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  // First-install offer pop-up
  var offer = document.getElementById('offer');
  if (offer) {
    var seen = false;
    try { seen = localStorage.getItem('bc-offer-seen') === '1'; } catch (x) {}
    var lastFocus = null;
    var openOffer = function () {
      if (!offer.hidden) return;
      lastFocus = document.activeElement;
      offer.hidden = false;
      document.getElementById('offer-go').focus();
      try { localStorage.setItem('bc-offer-seen', '1'); } catch (x) {}
    };
    var closeOffer = function () { offer.hidden = true; if (lastFocus && lastFocus.focus) lastFocus.focus(); };
    if (!seen) setTimeout(openOffer, (Number(offer.getAttribute('data-delay')) || 6) * 1000);
    document.getElementById('offer-close').addEventListener('click', closeOffer);
    offer.addEventListener('click', function (e) { if (e.target === offer) closeOffer(); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !offer.hidden) closeOffer(); });
    document.getElementById('offer-go').addEventListener('click', function () {
      var c = document.getElementById('ac-code');
      if (c) c.value = offer.getAttribute('data-code');
      offer.hidden = true;
      book.hidden = true; form.hidden = false;
      document.getElementById('ac-price').scrollIntoView({ behavior: 'smooth' });
    });
  }
})();
