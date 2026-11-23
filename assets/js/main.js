(function () {
  var toggle = document.querySelector('.nav-toggle');
  var list = document.getElementById('nav-list');
  if (toggle && list) {
    toggle.addEventListener('click', function () {
      var open = list.classList.toggle('open');
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      toggle.textContent = open ? 'Close' : 'Menu';
    });
    list.addEventListener('click', function (e) {
      if (e.target.tagName === 'A') {
        list.classList.remove('open');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.textContent = 'Menu';
      }
    });
  }

  var yr = document.getElementById('yr');
  if (yr) yr.textContent = new Date().getFullYear();

  var form = document.getElementById('quote-form');
  var err = document.getElementById('form-error');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var missing = [];
    ['f-name', 'f-phone', 'f-postcode'].forEach(function (id) {
      var el = document.getElementById(id);
      var bad = !el.value.trim();
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) missing.push(el.labels[0].textContent.toLowerCase());
    });
    if (missing.length) {
      err.textContent = 'Add your ' + missing.join(', ') + ' so we can get back to you.';
      err.hidden = false;
      document.getElementById(missing.length ? ['f-name', 'f-phone', 'f-postcode'].find(function (id) { return document.getElementById(id).getAttribute('aria-invalid') === 'true'; }) : 'f-name').focus();
      return;
    }
    err.hidden = true;
    var d = new FormData(form);
    var subject = 'Quote request: ' + d.get('type') + ' (' + d.get('postcode') + ')';
    var body = 'Name: ' + d.get('name') + '\nPhone: ' + d.get('phone') + '\nPostcode: ' + d.get('postcode') +
      '\nJob: ' + d.get('type') + '\n\n' + (d.get('message') || '');
    window.location.href = 'mailto:' + (form.getAttribute('data-email') || 'Threadroll@hotmail.com') + '?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  });
})();
