/* MB015 - Conference Room Board : BOOK
 *
 * Rebuilt 2026-07-30 as a TAP-ONLY form. Three typed fields - the meeting
 * title, an optional description, and who you are - and everything about time
 * is chips.
 *
 * WHY THE datetime-local INPUTS WENT
 *
 * They looked like the cheap answer: native, zero code, a real picker on every
 * phone. Three problems, in order of how much they cost:
 *
 * 1. They accept 8:07. A board whose whole job is to be skimmable at a
 *    doorway cannot have meetings starting at seven past. CONFIG.SLOT_MINS
 *    exists precisely to stop that, and a free clock field walks straight
 *    around it.
 * 2. iOS and Android render datetime-local as completely different wheels, and
 *    both take four or five interactions to set one time. Two of them meant
 *    ten interactions before you could tap Book.
 * 3. They cannot show you anything. The entire question a person has at the
 *    door is "when is this thing free", and a wheel of numbers answers it by
 *    making you guess, submit, and read the conflict warning afterwards.
 *
 * The slot grid answers it before the first tap: every 15 minutes of the day
 * is a chip, and a chip that is already booked says so.
 *
 * ONE ROOM, SO NO OVERLAPS (changed 2026-07-30)
 *
 * This reverses the decision of 2026-07-29. Conflicts used to be SHOWN and
 * allowed: a taken slot was dashed but still tappable, and booking over
 * something produced a red NOT CONFIRMED row for the two people to sort out
 * between themselves. The argument was that a person who genuinely needs the
 * time should not be stopped by software.
 *
 * That argument does not survive there being exactly one physical room. Two
 * bookings on one slot is not information, it is two crews arriving at the
 * same door, and this board was the only thing in a position to prevent it.
 * There is no second room to fall back to and no calendar system behind this
 * to catch it later.
 *
 * So the form refuses. A taken start is dimmed and NOT tappable; the end grid
 * simply stops at the next booking and says which one; and submit re-checks
 * and rejects, because the board can go stale in another tab between the
 * render and the tap.
 *
 * START AND END, NOT START AND LENGTH (changed 2026-07-30)
 *
 * The second grid used to offer durations: 15 min, 30 min, 1 hr, 1 hr 30. It
 * asked the wrong question. Nobody walks up to this board thinking "ninety
 * minutes"; they think "quarter past twelve until half one", and converting
 * between the two is arithmetic the app was making a person do in a doorway.
 * Both grids are now real clock times on the same 15-minute grain, so booking
 * 12:15 to 1:30 is two taps and no subtraction. The length still exists - it
 * is printed in the read-out - but it is derived, not entered.
 *
 * The form re-renders itself from one `sel` object on every tap. That is the
 * reason the busy marks can stay honest: there is no path where a chip's
 * appearance and the current selection can disagree, because they are drawn
 * from the same state in the same pass.
 */
window.DFW = window.DFW || {};
DFW.views = DFW.views || {};

(function () {

  var U = DFW.util, ui = DFW.ui, el = ui.el, H = DFW.stateHelpers;
  var C = function () { return DFW.CONFIG; };

  /* ---- Small form helpers ------------------------------------------------ */

  function field(labelText, control, hint, required) {
    var wrap = el('div', { class: 'field' });
    var label = el('label', { for: control.id });
    label.appendChild(document.createTextNode(labelText));
    if (required) label.appendChild(el('span', { class: 'req', text: ' *', 'aria-label': 'required' }));
    wrap.appendChild(label);
    wrap.appendChild(control);
    if (hint) wrap.appendChild(el('div', { class: 'hint', text: hint }));
    return wrap;
  }

  /* A block of chips under a heading. Not `field()` - there is no single
     control to point a <label for> at, and a label pointing at nothing is
     worse for a screen reader than a plain heading. */
  function chipField(labelText, holder, hint) {
    var wrap = el('div', { class: 'field' });
    wrap.appendChild(el('div', { class: 'fieldlabel', text: labelText }));
    wrap.appendChild(holder);
    if (hint) wrap.appendChild(el('div', { class: 'hint', text: hint }));
    return wrap;
  }

  function textInput(id, value, placeholder) {
    return el('input', {
      type: 'text', id: id, name: id, value: value || '',
      placeholder: placeholder || '', autocomplete: 'off'
    });
  }

  /* The description. A textarea and not a second text input, because the two
     look identical on a phone and the taller box is the only thing that says
     "more than a few words are fine here". Three rows: enough to invite an
     agenda, short enough that it does not dominate a form whose real content
     is the chips below it. */
  function textArea(id, placeholder) {
    return el('textarea', {
      id: id, name: id, rows: '3', placeholder: placeholder || '',
      autocapitalize: 'sentences'
    });
  }

  /* Typed, not picked. Anyone can create a meeting in this room, including
     people no roster in this app would contain, and a dropdown that does not
     have you in it is a dead end. Required, so it cannot be blank - that is
     the only guarantee left once the list is gone. */
  function nameInput(id, value) {
    return el('input', {
      type: 'text', id: id, name: id, value: value || '',
      placeholder: 'Your name', autocomplete: 'name', autocapitalize: 'words'
    });
  }

  /* ---- BOOK -------------------------------------------------------------- */

  DFW.views.book = function (mount, rows, ctx) {
    var now = ctx.now;
    var cfg = C();

    /* Selection state. One object, read by every draw, mutated by every tap.
       start and end are both epoch ms - real clock times, not a time and a
       length. Every other part of the app already works in start/end pairs, so
       this is also the form finally speaking the same language as the store. */
    var sel = {
      day: U.startOfDay(now),
      start: null,             /* epoch ms; null until a slot is tapped */
      end: null,               /* epoch ms; always > start once start is set */
      buffer: 0,
      type: 'Standard',
      weekly: false,
      weeks: cfg.DEFAULT_REPEAT_WEEKS,
      allHours: false
    };

    /* Arriving from a day that was already being looked at. #/book?d=YYYY-MM-DD
       is set by the Book button on any day other than today, so navigating to
       Thursday and tapping Book means Thursday. */
    var wanted = U.parseTime(ctx.query.d);
    if (wanted !== null) sel.day = U.startOfDay(wanted);

    var STEP = cfg.SLOT_MINS * 60000;

    function defaultStart() {
      var dayStart = new Date(sel.day).setHours(cfg.DAY_START_HOUR, 0, 0, 0);
      if (!U.sameDay(sel.day, now)) return dayStart;
      var n = U.nextSlot(now);
      /* Late enough in the evening that the next slot is tomorrow. Clamp to
         the last startable slot of THIS day: handing the grid a start it
         cannot draw leaves no chip lit and, now that the end grid is built
         from the start, no end chips either. */
      var dayLast = new Date(sel.day).setHours(24, 0, 0, 0) - STEP;
      if (n > dayLast) return dayLast;
      return n > dayStart ? n : dayStart;
    }

    /* A start carried over from another day, or arrived at through the date
       field, can sit outside the working band. Left alone it draws a grid with
       NO chip lit while the read-out above confidently states a time, so the
       band widens to swallow it. Called before anything reads bandEnd(), which
       depends on the answer. */
    function widenBandIfNeeded() {
      if (sel.start === null || sel.allHours) return;
      var h = new Date(sel.start).getHours();
      if (h < cfg.DAY_START_HOUR || h >= cfg.DAY_END_HOUR) sel.allHours = true;
    }

    /* The last END the grid can offer. Inclusive where the START grid is
       exclusive, and that asymmetry is correct: a meeting that finishes at
       6 PM finishes inside a working day that closes at 6, but one that starts
       at 6 PM does not begin inside it. */
    function bandEnd() {
      widenBandIfNeeded();
      var hi = sel.allHours ? 24 : cfg.DAY_END_HOUR;
      return new Date(sel.day).setHours(hi, 0, 0, 0);
    }

    function durMs() {
      return (sel.start === null || sel.end === null) ? 0 : sel.end - sel.start;
    }

    /* Move the start and carry the length with it. Keeping the length is the
       whole reason this is a function: picking 3 PM, choosing a 45-minute end,
       then changing your mind about the day must not silently put the booking
       back to an hour. */
    function setStart(t) {
      var keep = durMs();
      sel.start = t;
      sel.end = t + (keep > 0 ? keep : cfg.DEFAULT_BOOKING_MINS * 60000);
      fixEnd();
    }

    /* Keep the pair legal. Two separate jobs:
     *
     * 1. An end at or before the start is the one thing two clock grids can
     *    produce that the state machine has no way to describe - a booking
     *    that is never IN USE and never ENDED, sitting on the board forever.
     * 2. Since the no-overlap rule, an end past the next booking is illegal
     *    too, and clamping it here means the read-out can never state a range
     *    the Book button would then refuse.
     *
     * Repaired at the moment it could occur rather than validated at submit,
     * so what the form SAYS and what it will ACCEPT cannot diverge. */
    function fixEnd() {
      if (sel.start === null) { sel.end = null; return; }
      var last = endLimit().at;
      if (sel.end === null || sel.end <= sel.start) {
        sel.end = sel.start + cfg.DEFAULT_BOOKING_MINS * 60000;
      }
      if (sel.end > last) sel.end = Math.max(sel.start + STEP, last);
    }

    /* Is this one 15-minute slot already taken? The single question the whole
       no-overlap rule is built on. */
    function slotTaken(t) {
      return H.findConflicts({ start: t, end: t + STEP }, rows).length > 0;
    }

    /* The first slot at or after `t` that is both free and not already gone.
     * Returns null when the rest of the day is full.
     *
     * This exists because the form must never OPEN on a slot it will not let
     * you book. Before the no-overlap rule the default was simply the next
     * quarter hour, which is very often inside a meeting still running - fine
     * when a taken slot was merely dashed, a dead end now that it is disabled.
     */
    function firstFreeFrom(t) {
      var last = new Date(sel.day).setHours(sel.allHours ? 24 : cfg.DAY_END_HOUR, 0, 0, 0);
      var floor = U.sameDay(sel.day, now) ? U.floorToSlot(now) : -Infinity;
      for (var s = t; s < last; s += STEP) {
        if (s >= floor && !slotTaken(s)) return s;
      }
      return null;
    }

    /* The latest end this start can reach: the start of the next booking, or
     * the end of the band, whichever comes first. Everything past it would
     * overlap, and overlapping is no longer a choice a person gets to make.
     *
     * Returns the blocking row too, so the form can name it rather than just
     * offering a grid that mysteriously stops.
     */
    function endLimit() {
      var last = bandEnd();
      var blocker = null;
      (rows || []).forEach(function (r) {
        if (!ui.holdsRoom(r)) return;
        var s = U.parseTime(r.start);
        if (s === null || s <= sel.start || s >= last) return;
        last = s;
        blocker = r;
      });
      return { at: last, blocker: blocker };
    }

    /* Land on a day. Keeps the clock time already chosen where it can, snaps
     * forward to the first FREE slot from there, and sets a null start when
     * the day genuinely has nothing left.
     *
     * The second sweep matters: arriving on a day at 3 PM when the afternoon
     * is booked but the morning is wide open must not report the day as full.
     */
    function moveToDay(t) {
      var prev = sel.start === null ? null : new Date(sel.start);
      sel.day = t;

      var want;
      if (prev === null) {
        want = defaultStart();
      } else {
        var d = new Date(t);
        d.setHours(prev.getHours(), prev.getMinutes(), 0, 0);
        want = d.getTime();
        if (U.sameDay(t, now) && want < U.floorToSlot(now)) want = defaultStart();
      }

      var free = firstFreeFrom(want);
      if (free === null) {
        free = firstFreeFrom(new Date(t).setHours(sel.allHours ? 0 : cfg.DAY_START_HOUR, 0, 0, 0));
      }
      if (free === null) { sel.start = null; sel.end = null; return; }
      setStart(free);
    }

    /* First offer is the next free slot with the default length already on it,
       so the common case - "I need it now for an hour" - is one tap on Book.
       firstFreeFrom, not defaultStart: the next quarter hour is very often
       inside a meeting still running, and since that slot is no longer
       bookable the form must not open sitting on it. */
    moveToDay(sel.day);

    /* Every occurrence this submission would create. One row per week, all
       sharing a seriesId. See CONFIG.REPEAT_WEEKS for why these are real rows
       and not a stored recurrence rule. */
    function occurrences() {
      var out = [];
      var count = sel.weekly ? Math.min(sel.weeks, cfg.MAX_REPEAT_WEEKS) : 1;
      var dur = durMs();
      for (var i = 0; i < count; i++) {
        /* addWeeks goes through setDate, so a 7 AM meeting stays 7 AM across
           the November DST change instead of drifting to 6. The END is the
           start plus the LENGTH rather than addWeeks(end) - on the DST week
           those two differ by an hour, and a meeting keeping its length is
           less surprising than one keeping both clock times and changing how
           long it is. */
        var s = U.addWeeks(sel.start, i);
        out.push({ start: s, end: s + dur, index: i });
      }
      return out;
    }

    /* Conflicts across the WHOLE series, not just the first occurrence. A
       weekly meeting that is clear this week and collides on week three has a
       problem the person needs to see before they create three rows - and
       since the no-overlap rule it is the reason the whole series is refused
       rather than three rows going up flagged. */
    function allConflicts() {
      var seen = {}, out = [];
      occurrences().forEach(function (o) {
        H.findConflicts({ start: o.start, end: o.end }, rows).forEach(function (c) {
          if (seen[c._id]) return;
          seen[c._id] = true;
          out.push({ row: c, week: o.index });
        });
      });
      return out;
    }

    /* ---- Head ---------------------------------------------------------- */

    mount.appendChild(el('div', { class: 'viewhead' }, [
      el('div', { class: 'eyebrow' }, [el('span', { class: 'tag', text: cfg.ROOM_NAME })]),
      el('h1', { text: 'Book the room' })
    ]));

    var fTitle = textInput('title', '', 'Coordination sync');
    var fDetails = textArea('details', 'Agenda, who should be there, anything the room needs.');
    var fWho = nameInput('who');

    var readout = el('div', { class: 'readout' });
    var dayHolder = el('div', { class: 'chiprow', role: 'group', 'aria-label': 'Day' });
    var slotHolder = el('div');
    var endHolder = el('div');
    var repeatHolder = el('div', { class: 'chipgrid chipgrid-3', role: 'group', 'aria-label': 'Repeat' });
    var weeksHolder = el('div');
    var typeHolder = el('div', { class: 'chipgrid', role: 'group', 'aria-label': 'Type' });
    var bufHolder = el('div', { class: 'chipgrid', role: 'group', 'aria-label': 'Overrun buffer' });
    var live = el('div');
    /* Two boxes on this form now carry `note-bad`: this one and the series
       clash `live` renders above it. The id is what tells them apart - for
       flowtest, which was reading the first .note-bad in the DOM and
       cheerfully asserting against the wrong element, and for role="alert",
       which must be on the one that appears in response to a tap. */
    var err = el('div', { id: 'bookerr', role: 'alert', class: 'note note-bad', hidden: 'hidden' });

    /* Built ONCE and only re-valued on redraw. Rebuilding it inside drawDays
       left the previous element in the DOM holding a stale date while every
       redraw made a fresh detached one - the field simply stopped following
       the day chips. */
    var farDay = el('input', {
      type: 'date', id: 'farday', 'aria-label': 'A different date',
      onchange: function () {
        var t = U.parseTime(farDay.value);
        if (t === null) return;
        moveToDay(U.startOfDay(t));
        draw();
      }
    });

    /* ---- Draw ------------------------------------------------------------ */

    function drawReadout() {
      ui.clear(readout);

      readout.appendChild(el('div', {
        class: 'r-when',
        text: sel.start === null ? 'Nothing free this day' : U.fmtRange(sel.start, sel.end)
      }));
      readout.appendChild(el('div', { class: 'r-day', text: U.fmtDayLong(sel.day) }));

      if (sel.start === null) return;

      var extra = [];
      /* The length is DERIVED and shown here, not entered. It is the one thing
         two clock grids do not say out loud, and somebody who taps 12:15 and
         1:30 still wants to see "1 hr 15" before they commit. */
      extra.push(U.fmtDur(Math.round(durMs() / 60000)));
      if (sel.weekly) extra.push('every week for ' + sel.weeks + ' weeks');
      if (sel.buffer > 0) extra.push('may run up to ' + sel.buffer + ' min over');
      if (sel.type === 'PRIORITY') extra.push('priority');
      readout.appendChild(el('div', { class: 'r-extra', text: extra.join(' · ') }));

      if (sel.weekly) {
        var occ = occurrences();
        readout.appendChild(el('div', {
          class: 'r-extra',
          text: 'Last one: ' + U.fmtDayLong(occ[occ.length - 1].start) +
                '. Nothing repeats past that.'
        }));
      }
    }

    function drawDays() {
      ui.clear(dayHolder);
      var today = U.startOfDay(now);

      for (var i = 0; i < cfg.DAY_PICKER_DAYS; i++) {
        (function (t) {
          var dayRows = rows.filter(function (r) {
            return U.startOfDay(r.start) === t && ui.holdsRoom(r);
          });
          var d = new Date(t);
          var label = t === today ? 'Today'
                    : t === U.addDays(today, 1) ? 'Tmrw'
                    : U.DAYS[d.getDay()].slice(0, 3);

          dayHolder.appendChild(ui.chip({
            label: label,
            sub: (d.getMonth() + 1) + '/' + d.getDate() +
                 (dayRows.length ? ' · ' + dayRows.length : ''),
            on: t === sel.day,
            aria: U.fmtDayLong(t) + ', ' + ui.dayCountLabel(dayRows),
            /* moveToDay keeps the clock time already chosen where it can, so
               picking 9:00 and then changing your mind about the day does not
               silently reset the time - and it carries the LENGTH across too. */
            onclick: function () { moveToDay(t); draw(); }
          }));
        })(U.addDays(today, i));
      }

      farDay.value = U.fmtDate(sel.day);
    }

    /* Scroll the chosen chip into the middle of its own box rather than letting
       the page jump. scrollTop on the wrapper, not scrollIntoView, because
       scrollIntoView moves the PAGE too and throws the person out of the form
       they are filling in.

       .slotwrap must keep position:relative for this to work - offsetTop is
       measured from the nearest POSITIONED ancestor, and without it the scroll
       overshoots by the height of everything above the form. */
    function scrollTo(wrap, chip) {
      if (!chip) return;
      requestAnimationFrame(function () {
        wrap.scrollTop = Math.max(0,
          chip.offsetTop - wrap.clientHeight / 2 + chip.offsetHeight / 2);
      });
    }

    function drawSlots() {
      ui.clear(slotHolder);
      widenBandIfNeeded();

      var loH = sel.allHours ? 0 : cfg.DAY_START_HOUR;
      var hiH = sel.allHours ? 24 : cfg.DAY_END_HOUR;
      var isToday = U.sameDay(sel.day, now);

      var band = el('div', { class: 'slotband' }, [
        el('span', {
          text: sel.allHours ? 'All 24 hours'
                             : U.fmtClock(new Date(sel.day).setHours(loH, 0, 0, 0)) + ' to ' +
                               U.fmtClock(new Date(sel.day).setHours(hiH, 0, 0, 0))
        }),
        el('button', {
          type: 'button', class: 'btn btn-sm btn-quiet',
          text: sel.allHours ? 'Working hours' : 'All hours',
          onclick: function () { sel.allHours = !sel.allHours; fixEnd(); draw(); }
        })
      ]);
      slotHolder.appendChild(band);

      var grid = el('div', { class: 'chipgrid', role: 'group', 'aria-label': 'Start time' });
      var first = new Date(sel.day).setHours(loH, 0, 0, 0);
      var last = new Date(sel.day).setHours(hiH, 0, 0, 0);
      var selectedChip = null;

      var anyFree = false;

      for (var t = first; t < last; t += STEP) {
        (function (slot) {
          /* Taken means: something already booked overlaps THIS 15 minutes.
             Measured on the slot itself and not on the whole proposed meeting
             - this grid answers "can I start here", and how late you may run
             is the END grid's job. */
          var busy = slotTaken(slot);
          /* The slot the clock is currently inside stays tappable - at 8:07
             you are allowed to book the 8:00 slot you are standing in. Only
             genuinely gone slots are struck out. */
          var past = isToday && slot < U.floorToSlot(now);
          var on = sel.start === slot;
          if (!busy && !past) anyFree = true;

          var c = ui.chip({
            label: U.fmtClock(slot),
            on: on,
            busy: busy,
            past: past,
            /* Disabled since the no-overlap rule. It used to stay tappable so
               a person who genuinely needed the slot could take it anyway and
               argue afterwards; with one room there is nothing to argue about
               and nowhere for the loser to go. */
            disabled: past || busy,
            aria: 'Starts ' + U.fmtClock(slot) +
                  (past ? ', already gone' : busy ? ', already booked' : ', free'),
            onclick: function () { setStart(slot); draw(); }
          });
          if (on) selectedChip = c;
          grid.appendChild(c);
        })(t);
      }

      var wrap = el('div', { class: 'slotwrap' }, [grid]);
      slotHolder.appendChild(wrap);
      scrollTo(wrap, selectedChip);

      /* Say it rather than presenting a grid of dead chips and letting someone
         work it out. Only within the working band - "All hours" is right there
         in the band row above and may well have room. */
      if (!anyFree) {
        slotHolder.appendChild(el('div', { class: 'hint', text:
          sel.allHours
            ? 'Every slot on this day is taken or gone. Try another day.'
            : 'Nothing free between ' + U.fmtClock(first) + ' and ' + U.fmtClock(last) +
              '. Try another day, or All hours.' }));
      }
    }

    /* The second clock grid. Every end this start could have, on the same
       15-minute grain, each labelled with the length it works out to. Replaced
       the duration chips 2026-07-30 - see the header. */
    function drawEnds() {
      ui.clear(endHolder);
      if (sel.start === null) return;

      /* WHERE THIS GRID STOPS.
       *
       * At the next booking, not at the end of the day. Every end past that
       * one would overlap it, so offering them - even greyed out - is a column
       * of dead chips saying nothing a sentence cannot say better.
       *
       * The first version of this grid did offer them, marked busy. It was
       * unreadable: the form opens on the next free slot, so on a busy day
       * most of the grid was dashed red at once and the marking distinguished
       * nothing. Ending the grid at the real limit and NAMING the meeting that
       * sets it turned out to be both simpler and more use. */
      var lim = endLimit();
      var grid = el('div', { class: 'chipgrid', role: 'group', 'aria-label': 'End time' });
      var selectedChip = null;

      for (var t = sel.start + STEP; t <= lim.at; t += STEP) {
        (function (endT) {
          var on = sel.end === endT;
          var mins = Math.round((endT - sel.start) / 60000);

          var c = ui.chip({
            label: U.fmtClock(endT),
            /* The length is the sub-label, not the label. The question being
               answered is "when does it finish"; how long that turns out to be
               is the supporting fact, and printing it here is what stops the
               person having to work it out to sanity-check themselves. */
            sub: U.fmtDur(mins),
            on: on,
            aria: 'Ends ' + U.fmtClock(endT) + ', ' + U.fmtDur(mins),
            onclick: function () { sel.end = endT; draw(); }
          });
          if (on) selectedChip = c;
          grid.appendChild(c);
        })(t);
      }

      var wrap = el('div', { class: 'slotwrap' }, [grid]);
      endHolder.appendChild(wrap);
      scrollTo(wrap, selectedChip);

      if (lim.blocker) {
        endHolder.appendChild(el('div', { class: 'hint', text:
          'Has to end by ' + U.fmtClock(lim.at) + ' - ' +
          (U.id(lim.blocker.title) || 'another booking') + ' has the room after that.' }));
      }
    }

    function drawRepeat() {
      ui.clear(repeatHolder);
      ui.clear(weeksHolder);

      repeatHolder.appendChild(ui.chip({
        label: 'Just once', on: !sel.weekly,
        onclick: function () { sel.weekly = false; draw(); }
      }));
      repeatHolder.appendChild(ui.chip({
        label: '⟳ Every week', on: sel.weekly,
        onclick: function () { sel.weekly = true; draw(); }
      }));

      if (!sel.weekly) return;

      var anchor = sel.start === null ? sel.day : sel.start;
      var d = new Date(anchor);
      var grid = el('div', { class: 'chipgrid', role: 'group', 'aria-label': 'How many weeks' });
      cfg.REPEAT_WEEKS.forEach(function (n) {
        var lastOne = new Date(U.addWeeks(anchor, n - 1));
        grid.appendChild(ui.chip({
          label: n + ' wks',
          /* Bare m/d, not fmtDayShort. Four chips share a phone row and
             "to Wed 8/6" wraps to two lines in an 85px cell. */
          sub: 'thru ' + (lastOne.getMonth() + 1) + '/' + lastOne.getDate(),
          on: sel.weeks === n,
          aria: n + ' weeks, last one ' + U.fmtDayLong(lastOne),
          onclick: function () { sel.weeks = n; draw(); }
        }));
      });

      weeksHolder.appendChild(el('div', { class: 'fieldlabel', text: 'For how long' }));
      weeksHolder.appendChild(grid);
      weeksHolder.appendChild(el('div', {
        class: 'hint',
        text: 'Every ' + U.DAYS[d.getDay()] + ' at ' +
              (sel.start === null ? 'the time you pick' : U.fmtClock(sel.start)) +
              '. These are ' + sel.weeks + ' separate bookings - the board does not ' +
              'extend them on its own, so book again when they run out.'
      }));
    }

    function drawType() {
      ui.clear(typeHolder);
      [
        { v: 'Standard', t: 'Standard' },
        { v: 'PRIORITY', t: 'Priority' }
      ].forEach(function (o) {
        typeHolder.appendChild(ui.chip({
          label: o.t, on: sel.type === o.v,
          onclick: function () { sel.type = o.v; draw(); }
        }));
      });
    }

    function drawBuffer() {
      ui.clear(bufHolder);
      cfg.OVERRUN_CHOICES.forEach(function (m) {
        bufHolder.appendChild(ui.chip({
          label: m === 0 ? 'On time' : '+' + m,
          sub: m === 0 ? null : 'min',
          on: sel.buffer === m,
          aria: m === 0 ? 'It will end on time' : 'May run up to ' + m + ' minutes over',
          onclick: function () { sel.buffer = m; draw(); }
        }));
      });
    }

    /* The only blocker the two grids cannot show on their own.
     *
     * A single booking can no longer collide: a taken start is not tappable
     * and the end grid stops at the next meeting. A WEEKLY one still can -
     * week three is not on screen and nothing in the grids could hint at it -
     * so it is caught here and refused, with the offending weeks named.
     *
     * Refused, not flagged. There is one room; a series that half-collides is
     * not something two people can sort out between themselves. */
    function drawLive() {
      ui.clear(live);

      if (sel.start === null) {
        live.appendChild(el('div', { class: 'note note-bad' }, [
          el('strong', { text: 'Nothing free on this day. ' }),
          document.createTextNode(
            'Pick another day above, or tap All hours if the meeting can sit outside 6 to 6.')
        ]));
        return;
      }

      var hits = allConflicts();
      if (!hits.length) return;

      var box = el('div', { class: 'note note-bad' });
      box.appendChild(el('strong', {
        text: 'Some of these weeks are already taken, so the series cannot be booked.'
      }));
      hits.slice(0, 6).forEach(function (h) {
        box.appendChild(el('div', {
          text: 'Week ' + (h.week + 1) + ': ' +
                (U.id(h.row.title) || 'Untitled') + ' - ' +
                U.fmtDayShort(h.row.start) + ' ' + U.fmtRange(h.row.start, h.row.end) +
                ' (' + (U.id(h.row.bookedBy) || 'unknown') + ')'
        }));
      });
      if (hits.length > 6) {
        box.appendChild(el('div', { text: '…and ' + (hits.length - 6) + ' more.' }));
      }
      box.appendChild(el('div', {
        class: 'hint',
        text: 'Shorten the run, move the time, or book the clear weeks one at a time.'
      }));
      live.appendChild(box);
    }

    function draw() {
      drawReadout();
      drawDays();
      /* drawSlots first: it can widen the band, and drawEnds reads the band to
         decide how late an end it may offer. */
      drawSlots();
      drawEnds();
      drawRepeat();
      drawType();
      drawBuffer();
      drawLive();
    }

    /* ---- Assemble -------------------------------------------------------- */

    mount.appendChild(readout);

    var dayField = chipField('Which day', dayHolder);
    var form = el('form', { class: 'panel', novalidate: 'novalidate' }, [
      el('div', { class: 'panel-body' }, [
        el('div', { class: 'formgrid' }, [
          /* The meeting comes first, ahead of who you are. It is the question
             the person already has an answer to when they tap Book, and
             leading with the name field makes the form read as a sign-in
             sheet instead. */
          field('Meeting title', fTitle, 'Short. This is what shows on the board and the door.', true),
          /* Optional, and it says so. A required description would get "mtg"
             typed into it by everyone in a hurry, which is worse than blank -
             blank is honest and "mtg" is noise that looks like content. */
          field('Description', fDetails,
                'Optional. Agenda, who should be there, anything the room needs set up.'),
          field('Your name', fWho, 'No sign-in here, so the board shows exactly what you type.', true),
          dayField,
          chipField('Start time', slotHolder,
                    'Every 15 minutes. Dimmed and dashed means it is already booked - ' +
                    'there is one room, so those cannot be taken.'),
          chipField('End time', endHolder,
                    'Real clock times, not a length. The small text is how long that makes it.'),
          chipField('Repeat', repeatHolder),
          weeksHolder,
          chipField('Type', typeHolder,
                    'Priority just flags the meeting as one not to ask to move. Nothing can be ' +
                    'booked over anything now, so it grants nothing extra.'),
          chipField('Might it go over?', bufHolder,
                    'Only if it genuinely might. The board holds the room this much longer before it shows as free.')
        ]),

        /* The warning sits directly under the field, not in a help page. The
           whole mechanism only works if people feel the cost of claiming time
           at the moment they claim it. Shorter since the end grid arrived:
           "book the longer slot instead" is now a two-tap answer, so it needs
           less arguing for. */
        el('div', { class: 'note note-warn' }, [
          el('strong', { text: 'Use this sparingly. ' }),
          document.createTextNode(
            'It holds the room past your end time, with your name on it. ' +
            'If you already know you need the extra time, just pick the later end time.'
          )
        ]),

        live,
        err,
        el('div', { class: 'toolbar' }, [
          el('button', { class: 'btn btn-primary btn-big', type: 'submit', text: 'Book it' }),
          el('a', { class: 'btn', href: '#/', text: 'Cancel' })
        ])
      ])
    ]);

    /* ---- Submit ---------------------------------------------------------- */

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      err.hidden = true;

      var who = U.id(fWho.value);
      var title = U.id(fTitle.value);
      var details = U.id(fDetails.value);

      /* Listed in the order the fields appear, so "still needed" reads as a
         path down the form rather than a set to hunt through. The description
         is not in here on purpose - it is optional. */
      var missing = [];
      if (!title) missing.push('a meeting title');
      if (!who) missing.push('your name');
      if (sel.start === null) missing.push('a start time');
      if (missing.length) {
        err.hidden = false;
        err.textContent = 'Still needed: ' + missing.join(', ') + '.';
        err.scrollIntoView({ block: 'nearest' });
        return;
      }

      /* fixEnd() should make this unreachable - it repairs the pair at every
         tap that could break it. Checked anyway, because it is the one
         condition the state machine cannot describe: a booking that is never
         IN USE and never ENDED, sitting on the board forever. The belt and the
         braces are cheap; the row is not removable without the Data page. */
      if (sel.end === null || sel.end <= sel.start) {
        err.hidden = false;
        err.textContent = 'The end time has to be after the start time.';
        return;
      }

      var occ = occurrences();

      /* THE NO-OVERLAP GATE. One room, so this is a refusal and not a flag.
       *
       * The grids already make a colliding single booking untappable, so
       * reaching here normally means a weekly series whose later weeks are
       * taken. It is re-checked rather than trusted because `rows` is a
       * snapshot from render time: the board can move underneath this form in
       * another tab, and the failure it would otherwise produce - two crews,
       * one door - is exactly the one this app exists to prevent. */
      var clash = [];
      occ.forEach(function (o) {
        H.findConflicts({ start: o.start, end: o.end }, rows).forEach(function (c) {
          clash.push({ row: c, week: o.index });
        });
      });
      if (clash.length) {
        err.hidden = false;
        err.textContent = (sel.weekly
          ? 'Week ' + (clash[0].week + 1) + ' is already taken - '
          : 'That time was taken while you were filling this in - ') +
          (U.id(clash[0].row.title) || 'another booking') + ', ' +
          U.fmtDayShort(clash[0].row.start) + ' ' +
          U.fmtRange(clash[0].row.start, clash[0].row.end) + '. Nothing was booked.';
        err.scrollIntoView({ block: 'nearest' });
        return;
      }

      /* One id shared by the whole series, and only when there IS a series.
         A lone booking must not carry a seriesId - isWeekly() reads exactly
         this field, and a one-row "series" would render a WEEKLY badge on a
         meeting that happens once. */
      var seriesId = sel.weekly ? ('ser-' + Date.now().toString(36)) : null;

      var toWrite = occ.map(function (o, i) {
        var row = {
          title: title,
          start: new Date(o.start).toISOString(),
          end: new Date(o.end).toISOString(),
          bookingType: sel.type,
          bookedBy: who,
          overrunBuffer: sel.buffer,
          status: 'Booked'
        };
        /* Only when there is one. An empty string in every row is noise in the
           JSON export that reads like a field somebody failed to fill in. */
        if (details) row.details = details;
        if (seriesId) {
          row.seriesId = seriesId;
          row.seriesIndex = i;
          row.seriesCount = occ.length;
        }
        return row;
      });

      ctx.store.insertMany(toWrite).then(function () {
        DFW.toast(sel.weekly
          ? 'Booked ' + toWrite.length + ' weekly meetings, starting ' + U.fmtDayShort(occ[0].start) + '.'
          : 'Booked. ' + U.fmtRange(occ[0].start, occ[0].end) + '.');
        location.hash = '#/day?d=' + U.fmtDate(occ[0].start);
      }).catch(function (ex) {
        err.hidden = false;
        err.textContent = ex.message || 'That did not save.';
      });
    });

    /* Parked outside the horizontally-scrolling chip strip on purpose: inside
       it, a native date picker sits in a container that slides sideways under
       the thumb. */
    dayField.appendChild(el('div', { class: 'hint' }, [
      document.createTextNode('Further out than two weeks?')
    ]));
    dayField.appendChild(farDay);

    mount.appendChild(form);
    draw();
  };

})();
