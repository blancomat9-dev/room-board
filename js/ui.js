/* MB015 - Conference Room Board : DOM helpers
 *
 * Text always goes through textContent, never innerHTML with stored data, so a
 * meeting title containing a bracket cannot become markup.
 *
 * COLOUR RULE (changed 2026-07-30): nothing in here writes a colour. Elements
 * carry data-state and app.css supplies --st-bg / --st-fg / --st-accent for
 * that key in whichever colourway is active. Inline hex here would survive the
 * theme toggle and produce dark text on a dark card - which is exactly the
 * failure the old "fixed dark ink" comment was written to prevent, solved the
 * other way round.
 */
window.DFW = window.DFW || {};

(function () {

  var U = DFW.util;

  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        var v = attrs[k];
        if (v === null || v === undefined || v === false) return;
        if (k === 'text') { n.textContent = v; }
        else if (k === 'class') { n.className = v; }
        else if (k.indexOf('on') === 0 && typeof v === 'function') {
          n.addEventListener(k.slice(2).toLowerCase(), v);
        } else { n.setAttribute(k, v); }
      });
    }
    (kids || []).forEach(function (c) {
      if (c === null || c === undefined || c === false) return;
      n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return n;
  }

  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 3600);
  }

  function panel(title, sub, kids) {
    return el('section', { class: 'panel' }, [
      title ? el('div', { class: 'panel-head' }, [
        el('h2', { text: title }),
        sub ? el('span', { class: 'sub', text: sub }) : null
      ]) : null,
      el('div', { class: 'panel-body' }, kids)
    ]);
  }

  function note(text, tone) {
    return el('div', { class: 'note' + (tone ? ' note-' + tone : ''), text: text });
  }

  function empty(text) {
    return el('div', { class: 'empty', text: text });
  }

  /* ---- Chips -------------------------------------------------------------
   *
   * The one control the booking form is built out of. A chip is a button, not
   * a styled div: it has to be reachable by keyboard and announced as pressable,
   * and `type` must be set explicitly or it submits the form it sits in.
   *
   * `busy` does not disable. Conflicts are shown, not blocked - see
   * findConflicts - so a busy slot is still tappable and just tells you the
   * cost first.
   */
  function chip(o) {
    var b = el('button', {
      type: 'button',
      class: 'chip' +
        (o.on ? ' is-on' : '') +
        (o.busy ? ' is-busy' : '') +
        (o.past ? ' is-past' : ''),
      'aria-pressed': o.on ? 'true' : 'false',
      'aria-label': o.aria || null,
      disabled: o.disabled ? 'disabled' : null,
      onclick: o.onclick || null
    });
    b.appendChild(document.createTextNode(o.label));
    if (o.sub) b.appendChild(el('small', { text: o.sub }));
    return b;
  }

  /* ---- Calendar chrome --------------------------------------------------- */
  /*
   * The Today / Week / Month switcher plus the Book button, shared by all
   * three calendar modes so they cannot drift apart.
   *
   * These are real links to real routes rather than a JS toggle: the whole app
   * is reached by scanning a QR, and a link can be shared, bookmarked and
   * reloaded. A toggle held only in memory loses the person's place the moment
   * anything reloads.
   */
  function calendarChrome(active, dayTime) {
    var wrap = el('div', { class: 'calchrome noprint' });

    var seg = el('div', { class: 'segmented', role: 'group', 'aria-label': 'Calendar view' });
    [
      { route: '', label: 'Today' },
      { route: 'week', label: 'Week' },
      { route: 'month', label: 'Month' }
    ].forEach(function (o) {
      seg.appendChild(el('a', {
        href: '#/' + o.route,
        text: o.label,
        'aria-current': o.route === active ? 'page' : null
      }));
    });
    wrap.appendChild(seg);

    /* Carry the day being looked at into the form. Someone who navigated to
       Thursday and tapped Book means Thursday, and making them pick it again
       is how a booking lands on the wrong day. */
    var href = '#/book';
    if (dayTime != null && !U.sameDay(dayTime, Date.now())) {
      href += '?d=' + U.fmtDate(dayTime);
    }

    wrap.appendChild(el('a', {
      class: 'btn btn-primary btn-big btn-book',
      href: href,
      text: 'Book the room'
    }));

    return wrap;
  }

  /* ---- The booking card --------------------------------------------------
   *
   * Shared by DAY and MONTH so the two can never drift apart visually.
   *
   * Actions on a card, 2026-07-30: CANCEL and nothing else.
   *   - "I'm done - release the room" removed. Nobody taps it on the way out
   *     of a meeting, and a board that depends on people closing themselves
   *     out reports stale occupancy with total confidence.
   *   - "Take the room" removed. Physically taking an empty room needs no
   *     software, and the flow leaned entirely on honest self-reported names
   *     on a board with no identity.
   */
  function bookingCard(b, now, ctx) {
    var st = DFW.state(b, now);
    var H = DFW.stateHelpers;
    var struck = (st.key === 'CANCELLED' || st.key === 'CONFLICT' || st.key === 'TAKEN_OVER');

    var card = el('article', {
      class: 'card' + (struck ? ' is-struck' : ''),
      'data-state': st.key
    });

    var stateLine = el('div', { class: 'card-state' });
    /* PRIORITY is a badge rather than a state, because it no longer replaces
       the state - a priority meeting still has to say whether it is upcoming,
       running, or finished. WEEKLY is the same shape of fact: it describes the
       booking, not what the room is doing. */
    if (st.priority) stateLine.appendChild(el('span', { class: 'pri', text: 'PRIORITY' }));
    if (st.weekly) stateLine.appendChild(el('span', { class: 'rep', text: '⟳ WEEKLY' }));
    stateLine.appendChild(document.createTextNode(st.label));
    card.appendChild(stateLine);

    card.appendChild(el('h3', { class: 'card-title', text: U.id(b.title) || 'Untitled booking' }));

    var timeLine = el('div', { class: 'card-time' });
    timeLine.appendChild(document.createTextNode(U.fmtRange(b.start, b.end)));
    /* A declared buffer is stated next to the time, not hidden in a tooltip.
       Since the RUNNING OVER counter was removed this is the ONLY thing on a
       card that mentions overtime at all, and it is a claim the booker made in
       advance rather than anything the board measured. */
    if (H.bufferMs(b) > 0) {
      timeLine.appendChild(el('span', {
        class: 'card-buf',
        text: 'may run ' + Math.round(H.bufferMs(b) / 60000) + ' min over'
      }));
    }
    card.appendChild(timeLine);

    /* The description, if the booker wrote one. Below the time and above the
       byline: it is the detail you read after deciding the meeting is the one
       you were looking for, not before. textContent via el(), so an agenda
       containing a bracket cannot become markup. */
    if (U.has(b.details)) {
      card.appendChild(el('div', { class: 'card-note', text: U.id(b.details) }));
    }

    card.appendChild(el('div', { class: 'card-by', text: H.byline(b, now) }));

    if (!ctx || ctx.readOnly || !ctx.onCancel) return card;
    if (!H.canCancel(b, now)) return card;

    /* ---- Cancel, in two taps ------------------------------------------- *
     *
     * The confirm is an inline row rather than window.confirm(). A blocking
     * dialog on a phone is a modal nobody reads, and this app avoids them
     * everywhere except the Data page's wipe-everything button.
     *
     * For a weekly booking the second tap is a real CHOICE and not a yes/no,
     * because "cancel" is genuinely ambiguous on a repeating meeting and
     * guessing either way is wrong half the time.
     */
    var acts = el('div', { class: 'card-acts noprint' });
    var siblings = ctx.futureSiblings ? ctx.futureSiblings(b) : 0;

    function askCancel() {
      card.removeChild(acts);

      var bar = el('div', { class: 'cancelbar noprint' });
      bar.appendChild(el('span', {
        class: 'q',
        text: siblings > 0
          ? 'Cancel this weekly meeting?'
          : 'Cancel this booking?'
      }));

      if (siblings > 0) {
        bar.appendChild(el('button', {
          type: 'button', class: 'btn btn-cancel', text: 'Just this one',
          onclick: function () { ctx.onCancel(b, 'one'); }
        }));
        bar.appendChild(el('button', {
          type: 'button', class: 'btn btn-cancel',
          text: 'This + ' + siblings + ' after',
          onclick: function () { ctx.onCancel(b, 'future'); }
        }));
      } else {
        bar.appendChild(el('button', {
          type: 'button', class: 'btn btn-cancel', text: 'Yes, cancel it',
          onclick: function () { ctx.onCancel(b, 'one'); }
        }));
      }

      bar.appendChild(el('button', {
        type: 'button', class: 'btn btn-cancel', text: 'Keep it',
        onclick: function () { card.removeChild(bar); card.appendChild(acts); }
      }));

      card.appendChild(bar);
    }

    acts.appendChild(el('button', {
      type: 'button', class: 'btn btn-cancel',
      text: siblings > 0 ? 'Cancel…' : 'Cancel this booking',
      onclick: askCancel
    }));
    card.appendChild(acts);

    return card;
  }

  /* Cancel behaviour is identical in every calendar mode, so it lives here
     rather than being copy-pasted into views that would then drift.
     `rows` is the full board, needed to count the rest of a weekly series. */
  function cardCtx(ctx, rows) {
    var all = rows || [];

    return {
      /* Later occurrences of the same weekly meeting that are still live.
         Counted from the FULL board rather than the day being viewed, or
         "this and 3 after" would mean something different on every screen. */
      futureSiblings: function (b) {
        if (!b.seriesId) return 0;
        var s = U.parseTime(b.start);
        if (s === null) return 0;
        return all.filter(function (r) {
          return r.seriesId === b.seriesId && r._id !== b._id &&
                 holdsRoom(r) && U.parseTime(r.start) > s;
        }).length;
      },

      onCancel: function (booking, scope) {
        var patch = { status: 'Cancelled', cancelledAt: new Date().toISOString() };

        if (scope !== 'future' || !booking.seriesId) {
          ctx.store.update(booking._id, patch).then(function () {
            toast('Cancelled. The slot is free again.');
            ctx.refresh();
          }).catch(function (e) { toast(e.message || 'That did not save.'); });
          return;
        }

        var s = U.parseTime(booking.start);
        var ids = all.filter(function (r) {
          return r.seriesId === booking.seriesId && holdsRoom(r) &&
                 U.parseTime(r.start) >= s;
        }).map(function (r) { return r._id; });

        /* One write for the whole series. Cancelling twelve rows with twelve
           sequential read-modify-writes leaves the board half-cancelled if any
           one of them fails partway through. */
        ctx.store.updateMany(ids, patch).then(function () {
          toast(ids.length === 1
            ? 'Cancelled. The slot is free again.'
            : 'Cancelled ' + ids.length + ' meetings in that series.');
          ctx.refresh();
        }).catch(function (e) { toast(e.message || 'That did not save.'); });
      }
    };
  }

  /* Does this booking actually hold the room?
   *
   * A cancelled meeting should not make a day look busy. Bumped is legacy -
   * nothing creates one now - but an imported old row must not count either.
   * Used for BOTH the month dots and every day count, so a day can never show
   * six dots above the words "8 bookings" - which it did until this was made
   * shared.
   *
   * Consequence worth knowing: a day holding only a cancelled booking reads
   * "free" while still listing that cancelled card. That is correct. The room
   * is free; the card is the audit trail. */
  function holdsRoom(r) {
    return r.status !== 'Cancelled' && r.status !== 'Bumped';
  }

  function dayCountLabel(rows) {
    var n = (rows || []).filter(holdsRoom).length;
    if (n === 0) return 'free';
    return n === 1 ? '1 booked' : n + ' booked';
  }

  /* ---- Timeline ----------------------------------------------------------
   *
   * A real calendar: time is drawn as SPACE. A list of bookings tells you what
   * exists; a timeline tells you where the gaps are, which is the actual
   * question someone standing at the door has ("can I have it, and for how
   * long"). Whitespace is the answer, so the empty parts have to be to scale.
   *
   * opts = {
   *   rows, now, day        the day to draw, epoch ms anywhere inside it
   *   hourH                 pixels per hour; drives the whole vertical scale
   *   compact               true = coloured bars only, no text (week columns)
   * }
   */

  /* There is no all-day booking type. PRIORITY carries real start and end
     times, so everything is a positioned block and nothing needs a band above
     the grid. Kept as a stub returning false so the range calculation and the
     block loop still read clearly, and so a future all-day type has an obvious
     place to hook in. */
  function isAllDay() { return false; }

  /* Bookings that overlap have to sit side by side or they cover each other.
     Conflicts are allowed by design here, so this is a normal case, not an
     edge case. Each booking takes the first lane whose last occupant has
     already ended. */
  function assignLanes(list) {
    var lanes = [];
    list.forEach(function (b) {
      var s = U.parseTime(b.start);
      var placed = false;
      for (var i = 0; i < lanes.length; i++) {
        if (U.parseTime(lanes[i][lanes[i].length - 1].end) <= s) {
          lanes[i].push(b); b._lane = i; placed = true; break;
        }
      }
      if (!placed) { b._lane = lanes.length; lanes.push([b]); }
    });
    return lanes.length || 1;
  }

  /* The hour window a set of bookings needs on a given day, clamped to a real
     clock. Exported so WEEK can take the union across all seven days and hand
     the same window to every column. */
  /* DISPLAY_* and not DAY_*, since 2026-08-01. The bookable band is now the
     full 24 hours, so seeding this from it would draw every day as a 24-hour
     column - 21 empty hours around three meetings, on a phone, for the one
     question the board exists to answer. This seeds the readable window and
     the loop below still widens it to include anything genuinely booked, so a
     2 AM meeting is drawn; only empty hours are ever hidden. */
  function hourRange(list, base) {
    var lo = DFW.CONFIG.DEFAULT_START_HOUR, hi = DFW.CONFIG.DISPLAY_END_HOUR;
    (list || []).forEach(function (b) {
      if (isAllDay(b)) return;
      var s = U.parseTime(b.start), e = U.parseTime(b.end);
      if (s !== null) lo = Math.min(lo, Math.floor((s - base) / 3600000));
      if (e !== null) hi = Math.max(hi, Math.ceil((e - base) / 3600000));
    });
    lo = Math.max(0, Math.min(lo, 23));
    hi = Math.min(24, Math.max(hi, lo + 1));
    return { lo: lo, hi: hi };
  }

  function timeline(opts) {
    var rows = opts.rows || [];
    var now = opts.now;
    var base = U.startOfDay(opts.day);
    var hourH = opts.hourH || 54;
    var compact = !!opts.compact;

    var timed = rows.filter(function (r) { return !isAllDay(r); })
                    .slice()
                    .sort(function (a, b) { return U.parseTime(a.start) - U.parseTime(b.start); });

    /* The window is CONFIG.DEFAULT_START_HOUR to DISPLAY_END_HOUR, widened to
       swallow anything booked outside it. Since booking went 24/7 on
       2026-08-01 this is purely a readability default: a 2 AM meeting is drawn
       because the widening below reaches it, and only EMPTY hours are ever
       left off. A 5:30am huddle must not be clipped off the top just because
       the display window opens at 6.

       opts.lo/opts.hi override it. WEEK MUST pass them: seven columns each
       sizing themselves to their own bookings would each be individually
       sensible and collectively meaningless, because the same hour would sit
       at a different height in every column. */
    var r = (opts.lo != null && opts.hi != null)
      ? { lo: opts.lo, hi: opts.hi }
      : hourRange(timed, base);
    var lo = r.lo, hi = r.hi;

    var span = hi - lo;
    var height = span * hourH;

    function yOf(t) {
      var mins = (t - base) / 60000 - lo * 60;
      return (mins / 60) * hourH;
    }

    var wrap = el('div', { class: 'tl' + (compact ? ' tl-compact' : '') });

    var body = el('div', { class: 'tl-body', style: 'height:' + height + 'px' });

    /* Hour rules and labels. */
    var gutter = el('div', { class: 'tl-gutter' });
    for (var h = lo; h <= hi; h++) {
      var y = (h - lo) * hourH;
      if (!compact) {
        gutter.appendChild(el('span', {
          class: 'tl-hourlabel', style: 'top:' + y + 'px',
          text: U.fmtClock(new Date(base).setHours(h, 0, 0, 0))
        }));
      }
      body.appendChild(el('div', { class: 'tl-rule', style: 'top:' + y + 'px' }));
    }
    if (!compact) wrap.appendChild(gutter);

    var track = el('div', { class: 'tl-track' });

    var lanes = assignLanes(timed);
    timed.forEach(function (b) {
      var s = U.parseTime(b.start), e = U.parseTime(b.end);
      if (s === null || e === null) return;
      var st = DFW.state(b, now);
      var top = yOf(s);
      var w0 = 100 / lanes;

      /* A declared buffer is drawn as a hatched tail past the block, so the
         risk occupies space on the calendar the way the booking does. A number
         in a card is easy to skim past; a striped block sitting across the slot
         you were about to take is not. */
      var buf = DFW.stateHelpers.bufferMs(b);
      if (buf > 0) {
        var bt = yOf(e);
        track.appendChild(el('div', {
          class: 'tl-buffer',
          'data-state': st.key,
          style: 'top:' + bt + 'px;height:' + Math.max(yOf(e + buf) - bt, 3) + 'px;' +
                 'left:' + (b._lane * w0) + '%;width:' + w0 + '%;'
        }));
      }

      /* A 15-minute meeting would otherwise be an unreadable sliver and an
         untappable target. Floor the drawn height without touching the data. */
      var bh = Math.max(yOf(e) - top, compact ? 6 : 26);

      var faded = (st.key === 'CANCELLED' || st.key === 'TAKEN_OVER' ||
                   st.key === 'DONE' || st.key === 'ENDED');

      var block = el(compact ? 'div' : 'a', {
        class: 'tl-block' + (faded ? ' is-faded' : '') + (st.priority ? ' is-priority' : ''),
        'data-state': st.key,
        href: compact ? null : '#/day?d=' + U.fmtDate(base) + '&focus=' + encodeURIComponent(b._id),
        style: 'top:' + top + 'px;height:' + bh + 'px;' +
               'left:' + (b._lane * w0) + '%;width:' + w0 + '%;',
        title: (st.priority ? 'PRIORITY - ' : '') +
               (U.id(b.title) || 'Booking') + ' - ' + U.fmtRange(s, e)
      });

      if (!compact) {
        block.appendChild(el('span', { class: 'tl-btitle', text: U.id(b.title) || 'Booking' }));
        /* A 30-minute block is ~27px, which fits one line. Adding the second
           renders it half-cut, which looks like a rendering fault rather than
           a small meeting. The time is already on the card below and in the
           block's title attribute, so dropping it here loses nothing. */
        if (bh >= 38) block.appendChild(el('span', { class: 'tl-btime', text: U.fmtRange(s, e) }));
      }
      track.appendChild(block);
    });

    body.appendChild(track);

    /* The now-line, only on a day that is actually today. Drawing it on a
       future day would be a confident lie about where "now" is. */
    if (now >= base && now < base + 86400000) {
      var ny = yOf(now);
      if (ny >= 0 && ny <= height) {
        body.appendChild(el('div', { class: 'tl-now', style: 'top:' + ny + 'px' }, [
          el('span', { class: 'tl-nowdot' })
        ]));
      }
    }

    wrap.appendChild(body);
    return wrap;
  }

  /* ---- Big status banner ------------------------------------------------- */
  /*
   * What the room is doing RIGHT NOW, in one line, readable at arm's length.
   * This is the only thing most people will read.
   *
   * "Free" now means exactly what it says: nothing is booked across this
   * minute, and no declared buffer is still running. It used to mean something
   * narrower - a finished meeting held the banner open as RUNNING OVER for 90
   * minutes on the theory that a red nag beats a green lie.
   *
   * That theory was removed 2026-07-30 and the honest version of the claim is
   * this: the board knows what is BOOKED, not what is happening. A room shown
   * as free can still have four people in it, and the banner does not pretend
   * otherwise - it reports the schedule, and the door reports the room.
   */
  function banner(rows, now) {
    var live = null, mayRun = null;

    rows.forEach(function (b) {
      var st = DFW.state(b, now);
      if (st.key === 'IN_USE') live = live || b;
      if (st.key === 'MAY_RUN_LONG') mayRun = mayRun || b;
    });

    /* A meeting actually in its slot beats one running into its declared
       buffer: if something is genuinely scheduled now, that is what the room
       is doing, and the previous booking spilling over is the lesser fact. */
    var subject = live || mayRun;
    var st = subject ? DFW.state(subject, now) : null;

    var wrap = el('div', { class: 'banner', 'data-state': st ? st.key : 'FREE' });

    if (!subject) {
      wrap.appendChild(el('div', { class: 'banner-state', text: '● ROOM IS FREE' }));
      wrap.appendChild(el('div', { class: 'banner-sub', text: 'Nothing booked across right now.' }));
      return wrap;
    }

    wrap.appendChild(el('div', { class: 'banner-state', text: st.label }));
    wrap.appendChild(el('div', { class: 'banner-title', text: U.id(subject.title) || 'Untitled booking' }));
    wrap.appendChild(el('div', { class: 'banner-sub', text: DFW.stateHelpers.byline(subject, now) }));

    if (st.key === 'IN_USE') {
      var end = U.parseTime(subject.end);
      wrap.appendChild(el('div', {
        class: 'banner-sub',
        text: 'Free again at ' + U.fmtClock(end) + ', in ' + U.fmtMins(Math.round((end - now) / 60000)) + '.'
      }));
    }

    return wrap;
  }

  DFW.ui = {
    el: el, clear: clear, panel: panel, note: note, empty: empty, chip: chip,
    calendarChrome: calendarChrome, bookingCard: bookingCard, banner: banner,
    cardCtx: cardCtx,
    holdsRoom: holdsRoom, dayCountLabel: dayCountLabel,
    timeline: timeline, isAllDay: isAllDay, hourRange: hourRange
  };
  DFW.toast = toast;

})();
