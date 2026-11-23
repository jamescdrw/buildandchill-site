/*
 * Air con price calculator. Same calculation as the Air Conditioning For You
 * quote engine; prices come from ac-prices.js.
 */
(function () {
  var P = window.AC_PRICES;
  var form = document.getElementById('ac-calc');
  if (!P || !form) return;

  var out = document.getElementById('ac-result');
  var gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 });
  var round5 = function (n) { return Math.round(n / 5) * 5; };

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
    var area = m2 * (P.ceilings[ceiling] || 1);
    var band = Object.keys(P.rooms).find(function (k) { return area <= P.rooms[k].maxArea; });
    return { area: Math.round(m2 * 10) / 10, band: band };
  }

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
    var local = P.localPostcodes.some(function (p) { return pc.indexOf(p) === 0 && /^[A-Z]{2}\d/.test(pc); });
    if (local) subtotal *= 1 - P.localDiscount;

    var total = round5(Math.max(P.minPrice, subtotal));
    var deposit = round5(total * P.depositPercent / 100);
    return {
      total: total, deposit: deposit, balance: total - deposit, units: units, local: local,
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
    var q = last = calculate({
      units: unitsInput.value, range: form.elements.range.value, house: form.elements.house.value,
      run: form.elements.run.value, brand: form.elements.brand.value, room: form.elements.room.value,
      postcode: form.elements.postcode.value
    });
    document.getElementById('ac-total').textContent = gbp.format(q.total);
    document.getElementById('ac-system').textContent = q.system + ', ' + q.range.label.toLowerCase() + ', ' + q.room.kw + ' main room';
    var rows = q.rows.filter(function (r) { return r[1] !== 0; }).map(function (r) {
      return '<tr><th scope="row">' + r[0] + '</th><td>' + gbp.format(r[1]) + '</td></tr>';
    }).join('');
    if (q.local) rows += '<tr><th scope="row">Leicestershire and East Midlands discount</th><td>' + Math.round(P.localDiscount * 100) + '% off</td></tr>';
    rows += '<tr class="sum"><th scope="row">Total installed</th><td>' + gbp.format(q.total) + '</td></tr>' +
      '<tr><th scope="row">Deposit to book (' + P.depositPercent + '%)</th><td>' + gbp.format(q.deposit) + '</td></tr>' +
      '<tr><th scope="row">Balance on install day</th><td>' + gbp.format(q.balance) + '</td></tr>';
    document.getElementById('ac-rows').innerHTML = rows;
    out.hidden = false;
    out.focus();
  });

  document.getElementById('ac-send').addEventListener('click', function () {
    if (!last) return;
    var type = document.getElementById('f-type');
    var msg = document.getElementById('f-msg');
    var pc = document.getElementById('f-postcode');
    if (type) type.value = 'Air conditioning installation';
    if (pc && !pc.value) pc.value = form.elements.postcode.value;
    if (msg) msg.value = 'Air con calculator estimate: ' + gbp.format(last.total) + '\n' + last.system + '\n' +
      'Kit: ' + last.range.label + ', brand: ' + last.brand.label + '\nMain room: ' + last.room.label + ' (' + last.room.kw + ')\n' +
      'Property: ' + last.house.label + ', pipe run ' + last.run.label.toLowerCase() + '\n';
    document.getElementById('quote').scrollIntoView({ behavior: 'smooth' });
    setTimeout(function () { document.getElementById('f-name').focus({ preventScroll: true }); }, 500);
  });
})();
