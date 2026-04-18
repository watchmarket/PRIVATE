/**
 * flat-dialog.js
 * Custom dialog system — flat minimalist, selaras design system aplikasi.
 * Menggantikan: alert(), confirm(), prompt()
 *
 * API:
 *   FlatDialog.alert(message, title?, type?)            → Promise<void>
 *   FlatDialog.confirm(message, title?, type?)          → Promise<boolean>
 *   FlatDialog.prompt(message, defaultVal?, title?)     → Promise<string|null>
 *
 * type: 'info' | 'success' | 'warning' | 'danger' | 'question'
 * opts: { allowHTML?: boolean, details?: string, ... }
 */
(function (win) {
  'use strict';

  /* ── Singleton overlay root ── */
  var _root = null;
  function _getRoot() {
    if (_root && document.body.contains(_root)) return _root;
    _root = document.createElement('div');
    _root.id = 'flat-dialog-root';
    _root.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:99999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(15,23,42,0.45)',
      'backdrop-filter:blur(2px)',
      '-webkit-backdrop-filter:blur(2px)',
      'opacity:0', 'transition:opacity 0.15s ease',
      'pointer-events:none'
    ].join(';');
    document.body.appendChild(_root);
    return _root;
  }

  /* ── Icon map ── */
  var ICONS = {
    info: { svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>', color: '#0891b2', bg: '#ecfeff' },
    success: { svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="9 12 11 14 15 10"/></svg>', color: '#16a34a', bg: '#f0fdf4' },
    warning: { svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', color: '#d97706', bg: '#fffbeb' },
    danger: { svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>', color: '#ef4444', bg: '#fef2f2' },
    question: { svg: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>', color: '#2563eb', bg: '#eff6ff' },
  };

  /* ── Util: button HTML ── */
  function _btn(id, label, variant, extraStyle) {
    var base = [
      'display:inline-flex', 'align-items:center', 'gap:6px',
      'border-radius:4px', 'border:1px solid transparent',
      'padding:7px 18px', 'font-size:13px', 'font-weight:600',
      'cursor:pointer', 'transition:background 0.12s,border-color 0.12s,opacity 0.12s',
      'letter-spacing:0.3px', 'line-height:1.4', 'white-space:nowrap'
    ].join(';');
    var styles = {
      primary: 'background:#2563eb;color:#fff;border-color:#2563eb;',
      secondary: 'background:#f3f4f6;color:#b4b8c0;border-color:#e5e7eb;',
      danger: 'background:#ef4444;color:#fff;border-color:#ef4444;',
      success: 'background:#16a34a;color:#fff;border-color:#16a34a;',
    };
    return '<button id="' + id + '" style="' + base + ';' + (styles[variant] || styles.secondary) + (extraStyle || '') + '">' + label + '</button>';
  }

  /* ── Core render ── */
  function _show(opts) {
    return new Promise(function (resolve) {
      var root = _getRoot();
      var type = opts.type || 'info';
      var icon = ICONS[type] || ICONS.info;
      var title = opts.title || '';
      var msg = opts.message || '';
      var mode = opts.mode || 'alert'; // 'alert' | 'confirm' | 'prompt'

      /* Dialog box */
      var box = document.createElement('div');
      box.style.cssText = [
        'background:#fff',
        'border:1px solid #e5e7eb',
        'border-radius:12px',
        'box-shadow: 0 12px 30px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.08)',
        'min-width:340px', 'max-width:min(540px,95vw)',
        'padding:0',
        'font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif',
        'transform:scale(0.94) translateY(-8px)',
        'transition:transform 0.2s cubic-bezier(.34,1.56,.64,1),opacity 0.15s ease',
        'opacity:0',
        'pointer-events:auto',
        'position:relative',
        'overflow:hidden',
      ].join(';');

      /* Header (Multicolor) */
      var headerHtml = '';
      if (title) {
        headerHtml = '<div style="display:flex;align-items:center;gap:10px;padding:16px 20px;background: linear-gradient(to right, ' + icon.bg + ', #fff);border-bottom:1px solid rgba(0,0,0,0.05);">' +
          '<span style="color:' + icon.color + ';flex-shrink:0;">' + icon.svg + '</span>' +
          '<span style="font-weight:700;font-size:15px;color:#111827;letter-spacing:-0.01em;">' + _esc(title) + '</span>' +
          '</div>';
      }

      /* Body content */
      var contentHtml = opts.allowHTML ? msg : _esc(msg);
      var detailsWS = opts.allowHTML ? 'normal' : 'pre-wrap';
      var detailsHtml = opts.details ? ('<div style="padding:6px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;font-size:12px;color:#4b5563;white-space:' + detailsWS + ';line-height:1.5;">' + (opts.allowHTML ? opts.details : _esc(opts.details)) + '</div>') : '';

      var iconInBody = title ? '' : '<span style="color:' + icon.color + ';flex-shrink:0;margin-right:12px;padding-top:2px;">' + icon.svg + '</span>';
      var bodyHtml = '<div style="padding:20px 20px 8px;display:flex;align-items:flex-start;">' +
        iconInBody +
        '<div style="flex:1;">' +
        '<div style="font-size:14px;color:#b4b8c0;line-height:1.6;white-space:pre-wrap;word-break:break-word;">' + contentHtml + '</div>' +
        detailsHtml +
        '</div>' +
        '</div>';

      /* Prompt input */
      var inputHtml = '';
      if (mode === 'prompt') {
        inputHtml = '<div style="padding:4px 16px 8px;">' +
          '<input id="fd-prompt-input" type="text" autocomplete="off" spellcheck="false"' +
          ' value="' + _escAttr(opts.defaultVal || '') + '"' +
          ' style="width:100%;box-sizing:border-box;border:1px solid #d1d5db;border-radius:4px;' +
          'padding:7px 10px;font-size:13px;outline:none;font-family:inherit;' +
          'transition:border-color 0.12s,box-shadow 0.12s;">' +
          '</div>';
      }

      /* Footer / buttons */
      var footerHtml = '<div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px 18px;">';
      if (mode === 'alert') {
        footerHtml += _btn('fd-ok', 'Mengerti', 'primary');
      } else if (mode === 'confirm') {
        footerHtml += _btn('fd-cancel', 'Batal', 'danger');
        footerHtml += _btn('fd-ok', (type === 'danger' ? 'Ya, Hapus' : (type === 'question' ? 'Ya, Lanjutkan' : 'OK')), (type === 'danger' ? 'primary' : 'success'));
      } else if (mode === 'prompt') {
        footerHtml += _btn('fd-cancel', 'Batal', 'danger');
        footerHtml += _btn('fd-ok', 'Simpan', 'primary');
      }
      footerHtml += '</div>';

      box.innerHTML = headerHtml + bodyHtml + inputHtml + footerHtml;

      /* Clear previous & mount */
      root.innerHTML = '';
      root.appendChild(box);

      /* Animate in */
      requestAnimationFrame(function () {
        root.style.opacity = '1';
        root.style.pointerEvents = 'auto';
        requestAnimationFrame(function () {
          box.style.opacity = '1';
          box.style.transform = 'scale(1) translateY(0)';
        });
      });

      /* Focus management */
      var inputEl = box.querySelector('#fd-prompt-input');
      if (inputEl) {
        setTimeout(function () {
          try { inputEl.focus(); inputEl.select(); } catch (_) { }
          inputEl.addEventListener('focus', function () {
            inputEl.style.borderColor = '#2563eb';
            inputEl.style.boxShadow = '0 0 0 2px rgba(37,99,235,0.2)';
          });
          inputEl.addEventListener('blur', function () {
            inputEl.style.borderColor = '#d1d5db';
            inputEl.style.boxShadow = 'none';
          });
        }, 80);
      } else {
        var okBtn = box.querySelector('#fd-ok');
        if (okBtn) setTimeout(function () { try { okBtn.focus(); } catch (_) { } }, 80);
      }

      /* Button hover effects */
      box.querySelectorAll('button').forEach(function (btn) {
        btn.addEventListener('mouseenter', function () { btn.style.opacity = '0.85'; });
        btn.addEventListener('mouseleave', function () { btn.style.opacity = '1'; });
      });

      /* Close helper */
      function _close(result) {
        box.style.opacity = '0';
        box.style.transform = 'scale(0.96) translateY(-4px)';
        root.style.opacity = '0';
        root.style.pointerEvents = 'none';
        setTimeout(function () {
          if (root.contains(box)) root.removeChild(box);
        }, 180);
        resolve(result);
      }

      /* OK button */
      var okBtn2 = box.querySelector('#fd-ok');
      if (okBtn2) {
        okBtn2.addEventListener('click', function () {
          if (mode === 'prompt') {
            var v = inputEl ? inputEl.value : '';
            _close(v);
          } else if (mode === 'confirm') {
            _close(true);
          } else {
            _close(undefined);
          }
        });
      }

      /* Cancel button */
      var cancelBtn = box.querySelector('#fd-cancel');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          _close(mode === 'prompt' ? null : false);
        });
      }

      /* Backdrop click → cancel */
      root.addEventListener('click', function (e) {
        if (e.target === root) _close(mode === 'prompt' ? null : (mode === 'confirm' ? false : undefined));
      }, { once: true });

      /* Keyboard: Enter = OK, Escape = Cancel */
      function _onKey(e) {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', _onKey, true);
          _close(mode === 'prompt' ? null : (mode === 'confirm' ? false : undefined));
        } else if (e.key === 'Enter' && mode !== 'prompt') {
          document.removeEventListener('keydown', _onKey, true);
          _close(mode === 'confirm' ? true : undefined);
        } else if (e.key === 'Enter' && mode === 'prompt') {
          document.removeEventListener('keydown', _onKey, true);
          _close(inputEl ? inputEl.value : '');
        }
      }
      document.addEventListener('keydown', _onKey, true);
    });
  }

  /* ── Escape helpers ── */
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function _escAttr(s) { return _esc(s); }

  /* ── Public API ── */
  var FlatDialog = {
    alert: function (message, title, type, opts) {
      var config = typeof title === 'object' ? title : (opts || {});
      var tStr = typeof title === 'string' ? title : (config.title || '');
      var typeStr = typeof type === 'string' ? type : (config.type || 'info');
      return _show(Object.assign({}, config, { mode: 'alert', message: message, title: tStr, type: typeStr }));
    },
    confirm: function (message, title, type, opts) {
      var config = typeof title === 'object' ? title : (opts || {});
      var tStr = typeof title === 'string' ? title : (config.title || '');
      var typeStr = typeof type === 'string' ? type : (config.type || 'question');
      return _show(Object.assign({}, config, { mode: 'confirm', message: message, title: tStr, type: typeStr }));
    },
    prompt: function (message, defaultVal, title, opts) {
      var config = typeof title === 'object' ? title : (opts || {});
      var tStr = typeof title === 'string' ? title : (config.title || '');
      var dVal = typeof defaultVal === 'string' ? defaultVal : (config.defaultVal || '');
      return _show(Object.assign({}, config, { mode: 'prompt', message: message, defaultVal: dVal, title: tStr }));
    },
  };

  win.FlatDialog = FlatDialog;

  /* ══════════════════════════════════════════════════
   * SHIM: Override window.confirm() dan window.prompt()
   * Untuk kode lama yang menggunakan confirm()/prompt() secara synchronous,
   * kita berikan shim async yang fallback ke native jika tidak bisa di-await.
   *
   * CARA TERBAIK: Refactor kode lama ke:
   *   const ok = await FlatDialog.confirm(msg);
   *
   * Shim ini hanya menjamin visual konsisten untuk panggilan yang sudah ada.
   * ══════════════════════════════════════════════════ */

  /* Override window.alert() — sudah ada di notify-shim, tapi kita perkuat */
  var _origAlert = win.alert ? win.alert.bind(win) : null;
  win.alert = function (msg) {
    /* Jalankan async (fire-and-forget) — tidak blocking */
    try {
      FlatDialog.alert(String(msg || ''), '', 'warning');
    } catch (_) {
      if (_origAlert) _origAlert(msg);
    }
  };

  /* Expose async wrappers langsung di window untuk mudah dipakai */
  win.flatAlert = function (msg, title, type) { return FlatDialog.alert(msg, title, type); };
  win.flatConfirm = function (msg, title, type) { return FlatDialog.confirm(msg, title, type); };
  win.flatPrompt = function (msg, def, title) { return FlatDialog.prompt(msg, def, title); };

})(window);
