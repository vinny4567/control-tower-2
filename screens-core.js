// ═══════════════════════════════════════════════════════════════════════════════
// SCREEN BUILDER — THE PURE CORE
// ═══════════════════════════════════════════════════════════════════════════════
//
// Everything in this file is a pure function: no DOM, no fetch, no localStorage,
// no clock except what is passed in. That is the whole point of it being its own
// file — `tools/check-screens.mjs` loads this exact text and RUNS it, so the
// rules below are tested rather than described. A regex over a page can be
// satisfied by a comment about the code; a sign error looks identical to a note
// about a sign error. These functions are called with real fixtures instead.
//
// It lives OUTSIDE index.html on purpose. index.html is 1.2 MB and is parsed in
// full on every load, Dad's iPad included; the builder is the biggest single
// feature anyone has proposed for it, and nobody arranging buttons is also
// waiting on the Email tab. screens.html loads this; index.html does not.
//
// WHAT IT DOES NOT DO: it never decides to write anything. Saving, sending and
// importing are the page's job, because those are the parts that can hurt, and
// they should be readable in one place.
//
//                                   ── THE DOCUMENT ──
// { v:1, at, rev, acts, from:{install,build,captured_at}, assign:{"*":"main"},
//   layouts:{ main:{ size:{w,h,top},
//                    screens:{ "<screenId>":{ ctx, rev, els:[…] } },
//                    sheets:{  "<page key>":{ w, place:{"<keyOf>":[x,y,w,h]},
//                                             heads:[{t,r}], hide:[keyOf], flow:{w,h,gap} } } } } }
// btn   {id, r:[x,y,w,h], n:[x,y,w,h]?, t, c, ink, fs, a?, hide?}
// block {id, kind, r}      text {id, r, t}
//
// Units are points to 0.1, origin at the top-left of the glass. `top` is the
// band the app keeps clear. `size` is what the register REPORTED — never a
// number this file invented. See the three-state rule below.
//
//                            ── THE THREE-STATE RULE ──
// Every reader here distinguishes
//     undefined = nobody has told us yet      → say nothing, flag nothing, refuse to write
//     null      = we were told, and there is none → say "none", and that is a fact
//     value     = we were told, and here it is
// It is written down because collapsing the first two is the single mistake this
// project keeps paying for: a dropdown that flagged a fully wired menu as
// unwired, because "the file isn't loaded" and "nothing matched" arrived at the
// renderer as the same empty answer.
// ═══════════════════════════════════════════════════════════════════════════════

(function (root) {
  'use strict';

  // ── small shared helpers ────────────────────────────────────────────────────
  const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v * 10) / 10 : null);
  const str = (v, cap) => (typeof v === 'string' ? v.slice(0, cap || 240) : '');

  // The closed block list. A `kind` outside it is not drawn — and is not silently
  // dropped either; scrValidate counts it, because a block nobody can see is how a
  // screen quietly loses its keypad.
  const BLOCK_KINDS = ['check', 'dishwindow', 'keypad', 'tenders', 'pager', 'signin',
                       'letters', 'pizza', 'tables', 'cards', 'keyboard', 'body'];

  // The closed action list. POS/src/actions.js is the only authority for what these
  // DO; this file only says which shapes are allowed to exist in the document, so a
  // builder-made button cannot carry an action the register has never heard of.
  const ACTION_KINDS = ['cat', 'item', 'open', 'group', 'mods', 'disc', 'tender', 'fn', 'nav'];

  // ═════════════════════════════════════════════════════════════════════════════
  // 1. IMPORTING THE CAPTURE
  // ═════════════════════════════════════════════════════════════════════════════
  //
  // The capture is the register measuring ITSELF: every button's real rectangle on
  // every screen, posted to the mini as `pos_screens:<install>` and read back
  // through GET /api/reports/screen-exports. Its shape, as the mini stores it:
  //
  //   { install, at, window:{w,h,scale,topPad},
  //     scopes:{ "<scope>":{ measured_at, window?:{w,h}, dropped,
  //                          buttons:[{key,label,x,y,w,h, color?,kind?,cat?,page?,
  //                                    hidden?, c?,r?,cw?,rh?}] } },
  //     history:{…}, raw:{arrange,grids,at}, raw_history:[…] }
  //
  // ⚠️ THAT LIST IS A WHITELIST ON THE MINI (cleanScope). Anything the recorder
  // sends that is not in it is dropped before it is ever stored — so as this is
  // written, a permanent id, ink, font size, the natural rectangle and the action
  // DO NOT SURVIVE THE POST. Widening it is the mini's step 1. Therefore:
  //   • read ids if they are there, and derive a stable one if they are not;
  //   • never mint a random id for a button the register owns (a fresh id on every
  //     import is a different button every time, and the drafts stop matching);
  //   • say in the result which of the two happened, so the page can tell him his
  //     capture predates permanent ids instead of pretending it carried them.
  // The field spellings for the widened export are Jarvis's to name. Until they
  // are named, `idFields`/`inkFields` below are the only place to add them, and
  // check-screens pins the behaviour for both shapes.
  const ID_FIELDS = ['id', 'bid'];          // permanent id, whichever the recorder lands on
  const NAT_FIELDS = ['n', 'natural'];      // the register's own rectangle at this size

  // A scope name is the register's own name for a screen, and stays it. The only
  // transformation is that a scope captured with a dot already names one face
  // ('order.food'); see scrImport's note on why this file does NOT invent that split.
  const scopeIsSheet = (name) => /^grid:/.test(String(name || ''));
  const sheetPageOf = (name) => String(name || '').replace(/^grid:/, '');

  // Pull the first present field, so one reader serves both the current export and
  // the widened one without a second code path to keep in step.
  function pick(o, fields) {
    for (const f of fields) if (o[f] !== undefined && o[f] !== null) return o[f];
    return undefined;
  }

  function rectOf(b) {
    const x = num(b.x), y = num(b.y), w = num(b.w), h = num(b.h);
    if (x == null || y == null || w == null || h == null) return null;
    if (w <= 0 || h <= 0) return null;        // a zero-size button is unclickable and unseeable
    return [x, y, w, h];
  }

  function natOf(b) {
    const raw = pick(b, NAT_FIELDS);
    if (Array.isArray(raw) && raw.length === 4) {
      const r = raw.map(num);
      return r.every((v) => v != null) && r[2] > 0 && r[3] > 0 ? r : null;
    }
    if (isObj(raw)) {
      const r = [num(raw.x), num(raw.y), num(raw.w), num(raw.h)];
      return r.every((v) => v != null) && r[2] > 0 && r[3] > 0 ? r : null;
    }
    return null;
  }

  // The action a captured button already performs. The capture carries `cat`/`page`
  // for a rail button and `kind` for the rest; anything richer waits for the widened
  // export. An action this file cannot name is left ABSENT rather than guessed —
  // a button whose action is absent draws, and does nothing, which is honest. A
  // button with a WRONG action rings the wrong dish.
  function actionOf(b) {
    const a = b.a || b.action;
    if (isObj(a) && ACTION_KINDS.indexOf(a.k || a.kind) >= 0) {
      const out = { k: str(a.k || a.kind, 12) };
      for (const f of ['cat', 'page', 'key', 'title', 'group', 'id', 'kind', 'name', 'to', 'list']) {
        if (a[f] !== undefined) out[f] = typeof a[f] === 'string' ? str(a[f]) : a[f];
      }
      return out;
    }
    if (str(b.cat)) return { k: 'cat', cat: str(b.cat), ...(str(b.page) ? { page: str(b.page) } : {}) };
    return undefined;
  }

  // scrImport(exportDoc) -> { ok, size, screens, sheets, warnings, counts, idSource }
  //
  // THREE-STATE, and the states are not interchangeable:
  //   exportDoc undefined  -> {ok:false, reason:'no-capture', size:undefined, screens:undefined}
  //        the page has not read the report yet. Draw nothing, flag nothing, refuse to save.
  //   exportDoc with no usable scope -> {ok:false, reason:'empty-capture', screens:null}
  //        the register answered and has nothing. That IS a fact, and it is worth saying.
  //   otherwise -> ok, with every screen it could read and a warning for every one it could not.
  //
  // `size` comes only from what the register reported. A builder that guesses the
  // glass size lays every rectangle against the wrong frame, and the error is
  // invisible until it is on the floor at 7pm.
  function scrImport(exportDoc) {
    if (exportDoc === undefined) {
      return { ok: false, reason: 'no-capture', size: undefined, screens: undefined, sheets: undefined,
               warnings: [], counts: { screens: 0, sheets: 0, els: 0, dropped: 0 }, idSource: undefined };
    }
    if (!isObj(exportDoc)) {
      return { ok: false, reason: 'bad-capture', size: null, screens: null, sheets: null,
               warnings: ['The capture was not readable.'], counts: { screens: 0, sheets: 0, els: 0, dropped: 0 },
               idSource: null };
    }

    const warnings = [];
    const win = isObj(exportDoc.window) ? exportDoc.window : null;
    const w = win ? num(win.w) : null, h = win ? num(win.h) : null;
    const top = win && num(win.topPad) != null ? num(win.topPad) : 32;
    // Unknown size is NOT a default size. 1024x768 would draw everything plausibly
    // and wrongly, and nothing on the screen would say so.
    const size = (w && h) ? { w, h, top } : null;
    if (!size) warnings.push('The capture does not say how big the register screen is, so nothing can be drawn to scale yet.');

    const scopes = isObj(exportDoc.scopes) ? exportDoc.scopes : {};
    const names = Object.keys(scopes);
    const screens = {}, sheets = {};
    let els = 0, dropped = 0, withId = 0, derivedId = 0;

    for (const name of names) {
      const sc = scopes[name];
      if (!isObj(sc) || !Array.isArray(sc.buttons)) { warnings.push('Screen "' + name + '" was captured without any buttons.'); continue; }
      dropped += Number(sc.dropped) > 0 ? Number(sc.dropped) : 0;

      if (scopeIsSheet(name)) {
        const page = sheetPageOf(name);
        const place = {}, hide = [];
        let kept = 0;
        for (const b of sc.buttons) {
          if (!isObj(b) || !str(b.key)) continue;
          const r = rectOf(b);
          if (!r) continue;
          place[str(b.key)] = r; kept++;
          if (b.hidden === true) hide.push(str(b.key));
        }
        if (!kept) { warnings.push('Dish page "' + page + '" had nothing placeable in it.'); continue; }
        sheets[page] = { w: (isObj(sc.window) && num(sc.window.w)) || (size ? size.w : null), place,
                         ...(hide.length ? { hide } : {}) };
        els += kept;
        continue;
      }

      // A plain screen. Its id is the register's own scope name, kept verbatim.
      //
      // ⚠️ WHY THIS DOES NOT SPLIT 'order' INTO order.food / order.bar: the order
      // screen has two faces, and the plan names them as separate screenIds — but
      // the only thing here that could tell the faces apart is the per-button
      // `page`, and the chrome (check, keypad, send) belongs to BOTH. Duplicating
      // those into two screens would give one real button two ids, which is the
      // mistake that has its own name in this project: an id each side mints for
      // itself is two ids. The recorder is being fixed to capture the faces
      // separately, so the split belongs there, where the truth is. Until it
      // arrives, the screen is kept whole and SAID to be whole.
      const seen = Object.create(null);
      const list = [];
      let bothFaces = { food: 0, bar: 0 };
      for (const b of sc.buttons) {
        if (!isObj(b)) { continue; }
        const r = rectOf(b);
        if (!r) { continue; }
        const key = str(b.key);
        if (!key) { continue; }
        const given = pick(b, ID_FIELDS);
        let id = str(given, 120);
        if (id) withId++; else { id = 'k:' + key; derivedId++; }
        // Unique WITHIN the screen. A label-shaped key can repeat across a screen
        // (two buttons both labelled "1"), and two els with one id makes a drag
        // move whichever the loop reached first.
        if (seen[id]) { seen[id]++; id = id + '#' + seen[id]; } else { seen[id] = 1; }
        const page = str(b.page);
        if (page === 'food') bothFaces.food++; else if (page === 'bar') bothFaces.bar++;

        const kind = str(b.kind, 40);
        if (kind && BLOCK_KINDS.indexOf(kind) >= 0) {
          list.push({ id, kind, r });
        } else {
          const el = { id, r, t: str(b.label) || key, c: str(b.color, 24) || null };
          const n = natOf(b);
          if (n) el.n = n;
          const ink = pick(b, ['ink']); if (str(ink, 24)) el.ink = str(ink, 24);
          const fs = num(pick(b, ['fs'])); if (fs != null && fs > 0) el.fs = fs;
          const a = actionOf(b); if (a) el.a = a;
          if (b.hidden === true) el.hide = true;
          el.key = key;   // the register's own key, kept so a draft can be matched back to it
          list.push(el);
        }
      }
      if (!list.length) { warnings.push('Screen "' + name + '" had no readable buttons.'); continue; }
      if (bothFaces.food && bothFaces.bar && name.indexOf('.') < 0) {
        warnings.push('Screen "' + name + '" was captured as one screen, but the register draws it as two (food and liquor). '
                    + 'It is shown whole until the register captures the two faces separately.');
      }
      screens[name] = { ctx: name, rev: 0, els: list, measured_at: Number(sc.measured_at) || null };
      els += list.length;
    }

    const counts = { screens: Object.keys(screens).length, sheets: Object.keys(sheets).length, els, dropped };
    const idSource = (withId && !derivedId) ? 'captured' : (withId ? 'mixed' : (derivedId ? 'derived' : null));
    if (idSource === 'derived') {
      warnings.push('This capture was taken before the register gave its buttons permanent names, so they are being '
                  + 'matched by position in the menu. Re-capturing later will tidy that up; nothing is lost either way.');
    }
    if (dropped) warnings.push(dropped + ' button' + (dropped > 1 ? 's were' : ' was') + ' dropped by the register when it sent the capture.');

    if (!counts.screens && !counts.sheets) {
      return { ok: false, reason: 'empty-capture', size, screens: null, sheets: null, warnings, counts, idSource: null };
    }
    return { ok: true, reason: null, size, screens, sheets, warnings, counts, idSource };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 2. GEOMETRY
  // ═════════════════════════════════════════════════════════════════════════════
  //
  // Free placement, as asked — not a snap grid. The only hard rules are the edges
  // of the glass and the band the app keeps clear at the top; everything else is
  // his to arrange, including overlapping two buttons if that is what he wants.
  // Overlap is REPORTED, never prevented ("No, let me remove anything" was his
  // answer about protection, and the same principle applies to nannying a layout).

  const MIN_SIDE = 24;   // smaller than this cannot be hit with a thumb, and cannot be grabbed to fix

  function scrClamp(r, size) {
    if (!Array.isArray(r) || r.length !== 4 || !isObj(size)) return null;
    let [x, y, w, h] = r.map(num);
    if ([x, y, w, h].some((v) => v == null)) return null;
    const top = num(size.top) || 0;
    w = Math.max(MIN_SIDE, Math.min(w, size.w));
    h = Math.max(MIN_SIDE, Math.min(h, size.h - top));
    x = Math.min(Math.max(0, x), size.w - w);
    y = Math.min(Math.max(top, y), size.h - h);
    return [num(x), num(y), num(w), num(h)];
  }

  // A move is a drag: the rectangle keeps its size and is held inside the glass.
  function scrMove(r, dx, dy, size) {
    if (!Array.isArray(r)) return null;
    return scrClamp([num(r[0]) + (num(dx) || 0), num(r[1]) + (num(dy) || 0), r[2], r[3]], size);
  }

  // A resize drags one corner or edge. The opposite edge stays put, which is what
  // makes a resize feel like a resize; growing past the glass is clamped, and
  // shrinking stops at MIN_SIDE rather than collapsing to a line he cannot grab.
  function scrResize(r, edge, dx, dy, size) {
    if (!Array.isArray(r) || !isObj(size)) return null;
    let [x, y, w, h] = r.map(num);
    const e = String(edge || '');
    dx = num(dx) || 0; dy = num(dy) || 0;
    if (e.indexOf('e') >= 0) w = w + dx;
    if (e.indexOf('s') >= 0) h = h + dy;
    if (e.indexOf('w') >= 0) { const nw = w - dx; if (nw >= MIN_SIDE) { x = x + dx; w = nw; } else { x = x + (w - MIN_SIDE); w = MIN_SIDE; } }
    if (e.indexOf('n') >= 0) { const nh = h - dy; if (nh >= MIN_SIDE) { y = y + dy; h = nh; } else { y = y + (h - MIN_SIDE); h = MIN_SIDE; } }
    return scrClamp([x, y, w, h], size);
  }

  const overlaps = (a, b) => a[0] < b[0] + b[2] && b[0] < a[0] + a[2] && a[1] < b[1] + b[3] && b[1] < a[1] + a[3];

  // Which elements sit on top of each other. Reported so the page can mark them;
  // two buttons in one place is a real mistake he will want to see, and also a
  // perfectly legal thing to do on the way to somewhere else.
  function scrOverlaps(els) {
    const out = [];
    const list = (els || []).filter((e) => e && Array.isArray(e.r) && !e.hide);
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (overlaps(list[i].r, list[j].r)) out.push([list[i].id, list[j].id]);
      }
    }
    return out;
  }

  // Hit-testing goes LAST-FIRST, so the element drawn on top is the one grabbed —
  // otherwise a button moved on top of another cannot be picked up again.
  function scrHit(els, px, py) {
    const list = (els || []).filter((e) => e && Array.isArray(e.r) && !e.hide);
    for (let i = list.length - 1; i >= 0; i--) {
      const [x, y, w, h] = list[i].r;
      if (px >= x && px <= x + w && py >= y && py <= y + h) return list[i].id;
    }
    return null;
  }

  // An unplaced dish flows below the lowest placed one — never on top of another,
  // which is the one arrangement that makes a dish unreachable instead of ugly.
  function scrFlowBelow(place, flow, size) {
    const f = isObj(flow) ? flow : {};
    const w = num(f.w) || 152, h = num(f.h) || 66, gap = num(f.gap) || 4;
    let lowest = isObj(size) && num(size.top) != null ? num(size.top) : 0;
    Object.keys(place || {}).forEach((k) => {
      const r = place[k];
      if (Array.isArray(r) && num(r[1]) != null && num(r[3]) != null) lowest = Math.max(lowest, r[1] + r[3]);
    });
    return { x: 0, y: num(lowest + gap), w, h, gap };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 3. DRAFTS — AND THE COMPARE THAT HAS TO BE RIGHT THIS TIME
  // ═════════════════════════════════════════════════════════════════════════════
  //
  // One draft per screen: `scr_draft:<screenId>`, cloud only, no ct_ prefix (so it
  // is never mirrored to the mini and can never trip the publish hook that
  // re-ships the menu to eight iPads). Per-screen granularity is deliberate: with
  // one document for the lot, two people arranging on two devices lose each other's
  // afternoon, and the cost of a collision is every screen instead of one.
  //
  // ⛔ THE COMPARE. The existing button page does this:
  //        remoteAt && localAt && remoteAt > localAt   → refuse
  // which SKIPS THE GUARD exactly when it is needed: when the remote has no `at`,
  // or when our own `at` is still 0 because the load failed. Those are the two
  // cases where we know least, and it treats them as permission. So here the
  // states are named, and "we never read the remote" is a refusal, not a pass.
  //
  //   loadedAt === undefined  → 'never-loaded'  REFUSE. We have not read this key.
  //   loadedAt === null       → first write, allowed only if the remote is empty too
  //   remoteAt > loadedAt     → 'stale'         REFUSE, reload first
  //   remote gone, we had one → 'vanished'      REFUSE. Something else wrote it.
  //
  // The cloud store overwrites whole values with no compare of its own, so this
  // function is the only thing standing between two devices and a lost arrangement.
  function scrSaveVerdict(remoteAt, loadedAt) {
    if (loadedAt === undefined) return { ok: false, why: 'never-loaded',
      msg: 'This screen has not been read from the store on this device, so saving could overwrite someone else’s work. Reload first.' };
    const r = (remoteAt === undefined || remoteAt === null) ? null : num(remoteAt);
    const l = (loadedAt === null) ? null : num(loadedAt);
    if (l === null) {
      if (r === null) return { ok: true, why: 'first-write', msg: '' };
      return { ok: false, why: 'stale',
        msg: 'Someone has saved this screen since this page opened. Reload it before saving, or the other save is lost.' };
    }
    if (r === null) return { ok: false, why: 'vanished',
      msg: 'This screen’s saved draft is no longer in the store. Reload before saving.' };
    if (r > l) return { ok: false, why: 'stale',
      msg: 'Someone has saved this screen since this page read it. Reload it before saving, or their change is lost.' };
    return { ok: true, why: 'current', msg: '' };
  }

  const scrDraftKey = (screenId) => 'scr_draft:' + String(screenId || '');
  const SCR_BASE_KEY = 'scr_base';
  const SCR_HIST_KEY = 'scr_hist';
  const SCR_LIVE_KEY = 'ct_scr_live';   // the only one the registers read, written only by Send

  // A draft is one screen's elements plus the size they were arranged against.
  // The size travels WITH the draft: a rectangle means nothing without the frame it
  // was placed in, and a draft arranged against a 1024-wide screen must not be
  // quietly reinterpreted on a 1180-wide one.
  function scrDraftOf(screenId, els, size, at) {
    return { v: 1, screen: String(screenId || ''), at: num(at) || 0,
             size: isObj(size) ? { w: num(size.w), h: num(size.h), top: num(size.top) } : null,
             els: Array.isArray(els) ? els : [] };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 4. UNDO
  // ═════════════════════════════════════════════════════════════════════════════
  //
  // Bounded, in memory, THIS PAGE ONLY, and that limit is deliberate rather than
  // lazy: a durable undo across devices means keeping snapshots in the store, and
  // snapshots of a layout are where store size goes. The durable safety net is a
  // per-screen "back to how the register had it", which needs no history at all
  // because the capture is the history.
  const UNDO_CAP = 40;

  function scrUndoPush(stack, snapshot, cap) {
    const c = num(cap) || UNDO_CAP;
    const s = Array.isArray(stack) ? stack.slice() : [];
    s.push(snapshot);
    while (s.length > c) s.shift();      // oldest goes, never the newest
    return s;
  }
  function scrUndoPop(stack) {
    const s = Array.isArray(stack) ? stack.slice() : [];
    const top = s.length ? s.pop() : undefined;
    return { stack: s, snapshot: top };
  }

  // ═════════════════════════════════════════════════════════════════════════════
  // 5. VALIDATION — WHAT THE REGISTER WOULD REFUSE
  // ═════════════════════════════════════════════════════════════════════════════
  //
  // The register falls back to its own built-in screen on any document it cannot
  // use, PER SCREEN. That is the right behaviour and it is also a trap for this
  // page: a draft that the register will quietly refuse looks perfect here. So the
  // same refusals are modelled, and the page shows them before he presses anything.
  //
  // Nothing here is a lock. It reports; the page warns; he decides. He asked for
  // nothing undeletable and that includes nothing unsendable for his own good.
  function scrValidate(doc) {
    const problems = [], notes = [];
    if (!isObj(doc)) return { ok: false, problems: ['The layout is not readable.'], notes, counts: { screens: 0, els: 0, bad: 0 } };
    if (doc.v !== 1) problems.push('The layout is the wrong version, so every register would draw its built-in screens.');
    const layouts = isObj(doc.layouts) ? doc.layouts : null;
    if (!layouts) problems.push('The layout has no screens in it.');
    const main = layouts && isObj(layouts.main) ? layouts.main : null;
    if (layouts && !main) problems.push('The layout does not say what the registers should draw.');
    const size = main && isObj(main.size) ? main.size : null;
    if (main && (!size || !num(size.w) || !num(size.h))) {
      problems.push('The layout does not say what size screen it was arranged for, so no register can use it.');
    }
    const screens = main && isObj(main.screens) ? main.screens : {};
    let nEls = 0, bad = 0;
    for (const id of Object.keys(screens)) {
      const s = screens[id];
      if (!isObj(s) || !Array.isArray(s.els)) { problems.push('Screen "' + id + '" has nothing drawable, so that one screen stays as the register has it.'); continue; }
      const ids = Object.create(null);
      let drawable = 0;
      for (const e of s.els) {
        if (!isObj(e) || !str(e.id) || !Array.isArray(e.r) || e.r.length !== 4 || e.r.some((v) => num(v) == null)) { bad++; continue; }
        if (num(e.r[2]) <= 0 || num(e.r[3]) <= 0) { bad++; continue; }
        if (ids[e.id]) { bad++; notes.push('Screen "' + id + '" has two things called the same name; the second is ignored.'); continue; }
        ids[e.id] = 1;
        if (e.kind !== undefined && BLOCK_KINDS.indexOf(e.kind) < 0) { bad++; notes.push('Screen "' + id + '" has a panel the register does not know ("' + str(e.kind, 40) + '").'); continue; }
        if (e.a !== undefined && !(isObj(e.a) && ACTION_KINDS.indexOf(e.a.k) >= 0)) { bad++; notes.push('A button on "' + id + '" is set to do something the register does not know; it would draw and do nothing.'); continue; }
        if (size && num(e.r[0]) + num(e.r[2]) > num(size.w) + 0.5) notes.push('A button on "' + id + '" hangs off the right edge.');
        if (size && num(e.r[1]) + num(e.r[3]) > num(size.h) + 0.5) notes.push('A button on "' + id + '" hangs off the bottom.');
        if (!e.hide) drawable++;
        nEls++;
      }
      if (!drawable) problems.push('Screen "' + id + '" has nothing visible on it, so the register would draw its own.');
    }
    return { ok: !problems.length, problems, notes, counts: { screens: Object.keys(screens).length, els: nEls, bad } };
  }

  // A builder-made button gets `u_` + 6 characters. It is minted ONCE, it is never
  // the label, and renaming never touches it — the lesson being that an identity
  // derived from something a human edits stops being an identity the first time
  // they fix a typo, and every hour already filed under the old one goes quiet.
  // Randomness is injected so the checks can run it.
  function scrNewId(rand) {
    const r = typeof rand === 'function' ? rand : Math.random;
    const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let s = '';
    for (let i = 0; i < 6; i++) s += abc[Math.floor(r() * abc.length) % abc.length];
    return 'u_' + s;
  }

  const API = { scrImport, scrClamp, scrMove, scrResize, scrOverlaps, scrHit, scrFlowBelow,
                scrSaveVerdict, scrDraftKey, scrDraftOf, scrUndoPush, scrUndoPop, scrValidate, scrNewId,
                BLOCK_KINDS, ACTION_KINDS, MIN_SIDE, UNDO_CAP,
                SCR_BASE_KEY, SCR_HIST_KEY, SCR_LIVE_KEY };
  root.SCR = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
