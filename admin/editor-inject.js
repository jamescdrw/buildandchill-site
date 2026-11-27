/* Runs inside the preview frame of the live editor. Photos and text become clickable. */
(function () {
  if (window.parent === window) return;            // only when shown inside the admin
  var ADMIN = location.origin;
  try { localStorage.setItem('bc-offer-seen', '1'); } catch (e) {}
  var css = document.createElement('style');
  css.textContent =
    'img.bc-edit{cursor:pointer}' +
    'img.bc-edit:hover{outline:4px solid #19A7D6;outline-offset:-4px}' +
    '.bc-text{cursor:text;border-radius:2px}' +
    '.bc-text:hover{outline:2px dashed #19A7D6;outline-offset:3px}' +
    '.bc-text[contenteditable]{outline:3px solid #19A7D6!important;outline-offset:3px;background:rgba(25,167,214,.08)}' +
    '.bc-tag{position:absolute;z-index:9999;background:#19A7D6;color:#fff;font:600 13px/1 "Instrument Sans",sans-serif;' +
    'padding:7px 10px;border-radius:4px;pointer-events:none;box-shadow:0 2px 8px rgba(0,0,0,.25);white-space:nowrap}' +
    '#offer{display:none!important}';
  document.head.appendChild(css);
  var tag = document.createElement('div');
  tag.className = 'bc-tag'; tag.hidden = true;
  document.body.appendChild(tag);
  function showTag(el, text) {
    var r = el.getBoundingClientRect();
    tag.textContent = text;
    tag.style.left = (r.left + window.scrollX) + 'px';
    tag.style.top = Math.max(0, r.top + window.scrollY - 30) + 'px';
    tag.hidden = false;
  }
  function norm(s) { return String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim(); }
  function pathOf(img) {
    var s = img.currentSrc ? img.getAttribute('src') : img.getAttribute('src');
    try { return new URL(s || '', location.href).pathname; } catch (e) { return s; }
  }

  /* photos */
  var imgs = [];
  document.querySelectorAll('img').forEach(function (img) {
    var p = pathOf(img);
    if (p.indexOf('/assets/img/') !== 0 || /logo|favicon|accreditations\//.test(p)) return;
    img.classList.add('bc-edit'); imgs.push(img);
  });
  function imgAt(x, y) {   // finds a photo even when a colour overlay sits on top of it
    var els = document.elementsFromPoint(x, y);
    for (var i = 0; i < els.length; i++) {
      if (els[i].classList && els[i].classList.contains('bc-text')) return null;
      if (els[i].tagName === 'IMG' && els[i].classList.contains('bc-edit')) return els[i];
    }
    return null;
  }
  document.addEventListener('mousemove', function (e) {
    if (document.querySelector('.bc-text[contenteditable]')) return;
    var t = e.target.closest && e.target.closest('.bc-text');
    if (t) return showTag(t, 'Click to edit text');
    var img = imgAt(e.clientX, e.clientY);
    if (img) return showTag(img, 'Click to change photo');
    tag.hidden = true;
  });

  /* text */
  window.addEventListener('message', function (e) {
    if (e.origin !== ADMIN || !e.data) return;
    if (e.data.type === 'bc-setimg') { setImg(e.data.src, e.data.data); return; }
    if (e.data.type !== 'bc-texts') return;
    var list = (e.data.list || []).slice();
    var ops = e.data.ops || [];
    ops.forEach(function (op) { if (op.type === 'text') list.push(norm(op.new)); });
    var known = {};
    list.forEach(function (s) { known[s] = true; });
    var sel = 'h1,h2,h3,h4,p,li,blockquote,figcaption,strong,span,small,a,button,label,dt,dd,th,td,legend';
    document.querySelectorAll(sel).forEach(function (el) {
      if (el.closest('.bc-text') || el.closest('script,style,select,option,.bc-tag')) return;
      if (el.querySelector('img,input,select,textarea,picture')) return;
      if (known[norm(el.innerText)]) el.classList.add('bc-text');
    });
    // show unpublished changes
    ops.forEach(function (op) {
      if (op.type === 'text') {
        var o = norm(op.old);
        document.querySelectorAll('.bc-text').forEach(function (el) { if (norm(el.innerText) === o) el.innerText = op.new; });
      } else if (op.type === 'image' && op.image_data) setImg(op.src, op.image_data);
    });
  });
  function setImg(src, data) {
    imgs.forEach(function (img) {
      if (pathOf(img) !== src && img.dataset.bcSrc !== src) return;
      img.dataset.bcSrc = src;
      var pic = img.parentElement;
      if (pic && pic.tagName === 'PICTURE') pic.querySelectorAll('source').forEach(function (s) { s.remove(); });
      img.src = data;
    });
  }
  parent.postMessage({ type: 'bc-ready' }, ADMIN);

  var editing = null;
  function finish(save) {
    var el = editing; if (!el) return;
    editing = null;
    var now = norm(el.innerText);
    el.removeAttribute('contenteditable');
    if (!save || now === el.dataset.bcOld) { el.innerText = el.dataset.bcOld; return; }
    parent.postMessage({ type: 'bc-text', old: el.dataset.bcOld, text: now }, ADMIN);
  }
  function startEdit(el) {
    if (editing === el) return;
    finish(true);
    editing = el; tag.hidden = true;
    el.dataset.bcOld = norm(el.innerText);
    el.setAttribute('contenteditable', 'plaintext-only');
    el.focus();
    var range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
    var s = window.getSelection(); s.removeAllRanges(); s.addRange(range);
    parent.postMessage({ type: 'bc-editing' }, ADMIN);
  }
  document.addEventListener('keydown', function (e) {
    if (!editing) return;
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); finish(true); }
    if (e.key === 'Escape') { e.preventDefault(); finish(false); }
  });
  document.addEventListener('focusout', function (e) { if (editing && e.target === editing) finish(true); });

  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('.bc-text');
    if (t) { e.preventDefault(); e.stopPropagation(); startEdit(t); return; }
    var img = imgAt(e.clientX, e.clientY);
    if (img) {
      e.preventDefault(); e.stopPropagation();
      parent.postMessage({ type: 'bc-pick', src: img.dataset.bcSrc || pathOf(img), alt: img.alt }, ADMIN);
      return;
    }
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && a.getAttribute('href').charAt(0) !== '#') e.preventDefault();   // stay inside the preview
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);

  var key = 'bc-preview-scroll';
  try { var y = +sessionStorage.getItem(key); if (y) window.scrollTo(0, y); } catch (e) {}
  window.addEventListener('scroll', function () { try { sessionStorage.setItem(key, window.scrollY); } catch (e) {} });
})();
