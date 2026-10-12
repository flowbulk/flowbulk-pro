// Flow webview ke andar inject hota hai. Prompts submit karta hai, parallel track karta hai, phir order se save karta hai.
(() => {
  if (window.top !== window || window.__fb) return;
  const inv = (c, a) => (window.__TAURI_INTERNALS__ ? window.__TAURI_INTERNALS__.invoke(c, a) : Promise.reject(new Error('IPC nahi mila')));
  const rep = (payload) => inv('flow_report', { payload }).catch(() => {});
  const log = (m) => rep({ type: 'log', msg: new Date().toLocaleTimeString() + '  ' + m });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const FAIL_RE = /(failed|something went wrong|couldn.?t generate|unable to generate|violat|not allowed)/gi;
  const SUBMIT_RE = /(arrow_forward|arrow_upward|\bcreate\b|\bgenerate\b|\bsend\b|\bsubmit\b)/i;
  const BAD_RE = /(add_2|\badd\b|upload|attach|setting|tune|model|aspect|nano|banana|\bmic\b|record|close|delete|clear|undo|redo)/i;

  const visible = (el) => { const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const label = (b) => ((b.getAttribute('aria-label') || '') + ' ' + (b.title || '') + ' ' + b.textContent).trim().replace(/\s+/g, ' ');
  const enabled = (b) => !b.disabled && b.getAttribute('aria-disabled') !== 'true' && !/disabled/i.test(b.className || '') && getComputedStyle(b).pointerEvents !== 'none';
  const srcOf = (i) => i.currentSrc || i.src;
  const bigImgs = () => [...document.images].filter((i) => i.complete && i.naturalWidth >= 300 && i.naturalHeight >= 300 && srcOf(i));
  const failCount = () => ((document.body.innerText || '').match(FAIL_RE) || []).length;
  const tileImg = (t) => [...t.querySelectorAll('img')].find((i) => i.complete && i.naturalWidth >= 300 && srcOf(i));

  function findBox() {
    const c = [...document.querySelectorAll('textarea, [contenteditable="true"], [role="textbox"]')].filter(visible);
    c.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width);
    return c[0] || null;
  }
  function findSubmit(box, strict) {
    const br = box.getBoundingClientRect();
    const near = [...document.querySelectorAll('button, [role="button"]')].filter((b) => {
      if (!visible(b) || !enabled(b)) return false;
      const r = b.getBoundingClientRect(), cy = r.top + r.height / 2;
      return cy > br.top - 60 && cy < br.bottom + 110 && r.left > br.left;
    });
    const best = near.filter((b) => SUBMIT_RE.test(label(b)) && !BAD_RE.test(label(b)));
    const pool = best.length ? best : strict ? [] : near.filter((b) => !BAD_RE.test(label(b)));
    pool.sort((x, y) => y.getBoundingClientRect().right - x.getBoundingClientRect().right);
    return pool[0] || null;
  }
  async function waitSubmit(box, ms) {
    for (let t = 0; t < ms; t += 300) { const b = findSubmit(box, t < 4000); if (b) return b; await sleep(300); }
    return null;
  }
  function realClick(b) {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) b.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    b.click();
  }
  function setText(box, text) {
    box.focus();
    if (box.tagName === 'TEXTAREA' || box.tagName === 'INPUT') {
      const proto = box.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, 'value').set.call(box, text);
    } else {
      document.execCommand('selectAll', false, null); document.execCommand('delete', false, null); document.execCommand('insertText', false, text);
    }
    box.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // Naya tile: submit ke baad jo sabse bada naya element list mein aaya.
  function pickTile(list, box) {
    let best = null, area = 0;
    for (const el of list) {
      if (!el.isConnected || el.contains(box) || box.contains(el) || getComputedStyle(el).position === 'fixed') continue;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.height < 60 || (r.width > innerWidth * 0.95 && r.height > innerHeight * 0.8)) continue;
      if (r.width * r.height > area) { area = r.width * r.height; best = el; }
    }
    return best;
  }
  async function toJpegB64(src) {
    const r = await fetch(src, { credentials: 'include' });
    if (!r.ok) throw new Error('fetch ' + r.status);
    const bm = await createImageBitmap(await r.blob());
    const c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(bm, 0, 0);
    if (bm.close) bm.close();
    return c.toDataURL('image/jpeg', 0.95).split(',')[1];
  }

  async function submit(S, job) {
    job.tries++;
    const box = findBox();
    if (!box) throw new Error('Prompt box nahi mila (project / Image mode kholo)');
    const added = [];
    const mo = new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => n.nodeType === 1 && added.push(n))));
    mo.observe(document.body, { childList: true, subtree: true });
    try {
      setText(box, job.text); await sleep(900);
      const btn = await waitSubmit(box, 9000);
      if (!btn) throw new Error('Generate button nahi mila');
      job.f0 = failCount(); job.fh = 0; job.last = ''; job.stable = 0; job.t0 = Date.now(); job.st = 'running';
      realClick(btn);
      await sleep(6000);
    } finally { mo.disconnect(); }
    job.tile = pickTile(added, box);
  }
  function resultFor(S, job) {
    if (Date.now() - job.t0 > S.cfg.timeout * 1000) return { fail: 'timeout' };
    const settle = (src) => { job.stable = job.last === src ? job.stable + 1 : 0; job.last = src; return job.stable >= 1 ? { src } : null; };
    if (S.tracking === true && job.tile && job.tile.isConnected) {
      const im = tileImg(job.tile);
      if (im) return settle(srcOf(im));
      return FAIL_RE.test(job.tile.innerText || '') ? { fail: 'Flow ne error dikhaya' } : null;
    }
    const fresh = bigImgs().filter((i) => !S.seen.has(srcOf(i)));
    if (fresh.length) return settle(srcOf(fresh[0]));
    job.fh = failCount() > job.f0 ? job.fh + 1 : 0;
    return job.fh >= 2 ? { fail: 'Flow ne error dikhaya' } : null;
  }

  async function run(cfg) {
    if (window.__fbS && window.__fbS.on) return;
    const S = (window.__fbS = { on: true, stop: false, cfg, tracking: null, seen: new Set(bigImgs().map(srcOf)), jobs: cfg.prompts.map((text, i) => ({ n: i + 1, text, st: 'queued', tries: 0, src: null, tile: null, saved: false })) });
    const cnt = (k) => S.jobs.filter((j) => j.st === k).length;
    const saved = () => S.jobs.filter((j) => j.saved).length;
    const progress = (phase) => rep({ type: 'progress', phase, total: S.jobs.length, generated: cnt('done'), failed: cnt('retry') + cnt('failed'), regenerating: cnt('retry') + S.jobs.filter((j) => j.st === 'running' && j.tries > 1).length, saved: saved() });
    const fail = (j, why) => { j.st = j.tries < 1 + cfg.retries ? 'retry' : 'failed'; log(`#${j.n} fail (${why}). ${j.st === 'retry' ? 'Dobara generate hogi.' : 'Retries khatam.'}`); };
    try {
      progress('generating');
      while (!S.stop) {
        const running = S.jobs.filter((j) => j.st === 'running');
        const todo = S.jobs.find((j) => j.st === 'queued' || j.st === 'retry');
        if (!todo && !running.length) break;
        if (todo && running.length < (S.tracking === true ? cfg.parallel : 1)) {
          try { await submit(S, todo); log(`#${todo.n} submit hua (try ${todo.tries})`); } catch (e) { fail(todo, e.message); }
          progress('generating'); await sleep(S.tracking === true ? cfg.gap * 1000 : 1000); continue;
        }
        for (const j of running) {
          const r = resultFor(S, j);
          if (!r) continue;
          if (r.src) {
            if (S.tracking === null) { const im = j.tile && tileImg(j.tile); S.tracking = !!(im && srcOf(im) === r.src); log(S.tracking ? 'Parallel mode ON' : 'Parallel mode OFF: tile track nahi hui, ek ek karke chalega'); }
            j.src = r.src; j.st = 'done'; S.seen.add(r.src); log(`#${j.n} image ready`);
          } else fail(j, r.fail);
        }
        progress('generating'); await sleep(2000);
      }
      if (S.stop) { progress('stopped'); return; }
      progress('downloading'); log('Sab generate ho gayi. Ab order se download shuru...');
      for (const j of S.jobs) {
        if (S.stop) break;
        if (j.st !== 'done') continue;
        try { await inv('save_image', { n: j.n, b64: await toJpegB64(j.src) }); j.saved = true; } catch (e) { log(`#${j.n} save fail: ${(e && e.message) || e}`); }
        progress('downloading');
      }
      rep({ type: 'missing', list: S.jobs.filter((j) => !j.saved).map((j) => j.n) });
      progress(S.stop ? 'stopped' : 'done');
    } finally { S.on = false; }
  }
  const ping = () => rep({ type: 'ready', host: location.host, hasBox: !!findBox() });
  window.__fb = { run, ping, stop: () => { if (window.__fbS) window.__fbS.stop = true; } };
  setTimeout(ping, 4000);
})();
