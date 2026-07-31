/* MB015 - Conference Room Board : the state machine
 *
 * A direct port of TODAY-view-formatting.json, which encoded this same chain
 * as nested SharePoint if() expressions. One pure function, no DOM, no store,
 * so it can be reasoned about and tested on its own.
 *
 * THE ORDER IS THE DESIGN. It is evaluated top down and the first match wins.
 * Moving a case changes behaviour even though every case still "works":
 * TAKEN_OVER sits above the time comparisons precisely so a bumped booking can
 * never come back as IN USE NOW.
 *
 * WHAT THIS MACHINE NO LONGER CLAIMS (changed 2026-07-30).
 *
 * It used to carry the MB006 rule "the failure mode should be a red nag, never
 * a green lie" all the way into a RUNNING OVER state that counted the minutes
 * a finished meeting was late by. That is gone. The board shows the meetings
 * booked for a day; past its end time a booking reads ENDED and the room reads
 * free, because this app has no way to know otherwise and a stopwatch running
 * on a guess is not evidence.
 *
 * The one forward-looking mark left is MAY_RUN_LONG, and it is a DECLARATION -
 * the person booking said in advance it might go over. Nothing here measures.
 *
 * ---------------------------------------------------------------------------
 * COLOURS ARE NOT IN HERE ANY MORE (changed 2026-07-30).
 *
 * This used to return accent/bg/fg hex triples, lifted from the SharePoint
 * formatting JSON and written onto elements as inline styles. That worked
 * while there was exactly one colourway. There are now two - the MB008 deck
 * palette light and its dark counterpart, on a toggle - and an inline hex
 * cannot follow a theme switch.
 *
 * So state() returns a KEY, the DOM carries it as data-state, and app.css
 * defines --st-bg / --st-fg / --st-accent for that key in each theme. Adding a
 * state means adding a case here AND a rule in both blocks of app.css; miss
 * the second and the card renders with no wash at all, which is visible
 * immediately rather than subtly wrong.
 * ---------------------------------------------------------------------------
 */
window.DFW = window.DFW || {};

(function () {

  var U = DFW.util;

  var PRIORITY = 'PRIORITY';

  /* Every key state() can return. Exported so selftest can assert that the
     stylesheet and the machine agree on the list rather than trusting that
     somebody remembered. */
  var STATE_KEYS = [
    'TAKEN_OVER', 'CANCELLED', 'CONFLICT', 'DONE',
    'IN_USE', 'MAY_RUN_LONG', 'ENDED', 'UPCOMING'
  ];

  /* The buffer the booker declared, in milliseconds. Absent, junk, or negative
     all mean zero - an unreadable buffer must never silently grant grace. */
  function bufferMs(b) {
    var n = parseFloat(b && b.overrunBuffer);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.min(n, 60) * 60000;
  }

  /* When the room is genuinely expected to be free. */
  function freeAt(b) {
    var end = U.parseTime(b.end);
    return end === null ? null : end + bufferMs(b);
  }

  /* Part of a weekly series. A repeat setting on an ordinary booking, not a
     type of its own - see CONFIG.REPEAT_WEEKS for why the old
     'Recurring - fixed' TYPE was a lie. */
  function isWeekly(b) {
    return !!(b && b.seriesId);
  }

  /* ---- The chain --------------------------------------------------------- */
  /*
   * state(booking, now) -> { key, label, priority, weekly }
   * `now` is injected rather than read from the clock so the whole machine can
   * be tested at any instant without waiting for one.
   */
  function state(b, now) {
    var start = U.parseTime(b.start);
    var end = U.parseTime(b.end);
    var key, label;

    /* PRIORITY used to be case 1 here, an all-day lock that outranked the
       clock. It now carries real times, so it runs the same chain as anything
       else and is marked with a flag instead. A finished priority meeting
       reads ENDED, because it has ended. */

    /* 1. LEGACY. Nothing creates a Bumped row any more - the takeover feature
          was removed 2026-07-30 - but a JSON export from an older build can
          still be imported on the Data page, and such a row must not come back
          as a live booking. It stays above the time comparisons for the reason
          it always did. */
    if (b.status === 'Bumped') {
      key = 'TAKEN_OVER';
      label = '⚡ TAKEN OVER';

    } else if (b.status === 'Cancelled') {
      key = 'CANCELLED';
      label = 'CANCELLED';

    /* 3. LEGACY as of 2026-07-30, same reasoning as Bumped below. There is one
          room, so the form now REFUSES an overlapping booking instead of
          recording one and marking it red. Nothing creates this status any
          more; an older JSON export imported on the Data page still can. */
    } else if (b.status === 'Conflict - not confirmed') {
      key = 'CONFLICT';
      label = '⚠ NOT CONFIRMED - OVERLAPS ANOTHER BOOKING';

    /* 4. LEGACY, same reasoning as Bumped. The "I'm done - release the room"
          button was removed 2026-07-30, so no new Done rows exist. Imported
          ones still render as released rather than as occupying the room. */
    } else if (b.status === 'Done') {
      key = 'DONE';
      label = '✓ DONE - ROOM RELEASED';

    /* 5. Inclusive at both ends, matching the original expression. A booking
          is live from its start minute through its end minute. */
    } else if (start !== null && end !== null && now >= start && now <= end) {
      key = 'IN_USE';
      label = '● IN USE NOW';

    /* 6. Inside a buffer the booker declared up front. The room doing what
          somebody said in advance it might do. This is the ONLY thing the
          board still says about overtime, and it is a declaration, not a
          measurement - it exists only when a buffer was actually set. */
    } else if (end !== null && bufferMs(b) > 0 && now > end && now <= end + bufferMs(b)) {
      key = 'MAY_RUN_LONG';
      label = '◔ MAY RUN LONG - UNTIL ' + U.fmtClock(end + bufferMs(b));

    /* 7. Past its end time, and past any buffer. Just ENDED.
     *
     *    RUNNING OVER used to sit here: it timed how far past the end a
     *    meeting had run, printed the minute count in the label, and decayed
     *    to ENDED after 90 minutes. Removed 2026-07-30 on Matias's call - the
     *    board should show the day's meetings, not run a stopwatch on them.
     *
     *    Be honest about what went with it. This app cannot see the room. The
     *    old nag was never a measurement of anything except the clock, and it
     *    marked a room as contested every time a meeting simply finished. What
     *    is lost is the prompt to go find whoever is still in there; the door
     *    answers that faster than the board ever did. */
    } else if (end !== null && now > end) {
      key = 'ENDED';
      label = 'ENDED';

    /* 8. There is no STANDING state any more. A weekly meeting that has not
          started yet is UPCOMING like anything else, and carries a WEEKLY
          badge. The old branch sat right here and replaced UPCOMING, which
          meant a standing meeting never told you whether it was about to
          start - it just said STANDING MEETING all day. */
    } else {
      key = 'UPCOMING';
      label = 'UPCOMING';
    }

    return {
      key: key,
      label: label,
      priority: b.bookingType === PRIORITY,
      weekly: isWeekly(b)
    };
  }

  /* ---- Sub-predicates ---------------------------------------------------- */
  /*
   * These deliberately do NOT follow the main chain. Both were separate
   * expressions in the original JSON and re-test conditions the chain already
   * reached by ordering alone.
   */

  /* Who to go find. The wording swaps only inside a DECLARED buffer, which is
     the one window where the board has an actual reason to believe somebody is
     still in the room. Once the buffer is spent it reverts to a plain record of
     who booked it - the board stopped guessing at occupancy when RUNNING OVER
     was removed, and this line must not keep guessing on its behalf. */
  function byline(b, now) {
    var end = U.parseTime(b.end);
    var who = U.id(b.bookedBy) || 'someone';

    /* Legacy import only - see the TAKEN_OVER case above. */
    if (b.status === 'Bumped') {
      return 'Taken over by ' + (U.id(b.bumpedBy) || 'someone') +
        (U.has(b.bumpReason) ? ' - ' + U.id(b.bumpReason) : '');
    }
    if (end !== null && bufferMs(b) > 0 && b.status === 'Booked' &&
        now > end && now <= end + bufferMs(b)) {
      return 'Still in there: ' + who;
    }
    return 'Booked by ' + who;
  }

  /* ---- Cancelling -------------------------------------------------------- *
   *
   * The ONLY action left on a booking card. Release ("I'm done") and takeover
   * were both removed 2026-07-30; this replaced them, and it answers a
   * different question than either did. Release and takeover were about a
   * meeting happening RIGHT NOW. Cancel is about one that has not happened
   * yet: I booked it, we do not need it, give the slot back.
   *
   * NOT ALLOWED ONCE IT HAS STARTED, on purpose. Cancelling a running meeting
   * is release under another name, and release was deliberately taken away. It
   * would also let anyone walking past clear the room out from under whoever
   * is sitting in it, on a board with no identity of any kind.
   *
   * A cancelled booking is never deleted. It stays on the board struck
   * through, and stops holding the room - see ui.holdsRoom.
   */
  function canCancel(b, now) {
    var start = U.parseTime(b.start);
    if (start === null) return false;
    if (b.status !== 'Booked' && b.status !== 'Conflict - not confirmed') return false;
    return now < start;
  }

  /* ---- Overlap ----------------------------------------------------------- */
  /*
   * The standard interval-overlap test. Two ranges overlap when each starts
   * before the other ends.
   *
   * Do NOT rewrite this as "does the start fall between X and Y". That reads
   * naturally and is wrong: it misses a booking that wholly CONTAINS the new
   * one (1:00-3:00 already booked, someone adds 1:30-2:00), which is the case
   * the MB015 flow spec called out by name.
   */
  function overlaps(a, b) {
    var aStart = U.parseTime(a.start), aEnd = U.parseTime(a.end);
    var bStart = U.parseTime(b.start), bEnd = U.parseTime(b.end);
    if (aStart === null || aEnd === null || bStart === null || bEnd === null) return false;
    return aStart < bEnd && aEnd > bStart;
  }

  /* Rows a candidate booking would collide with.
   *
   * This is now a GATE, not a warning. As of 2026-07-30 there is one room and
   * the booking form refuses anything this returns a hit for - so a row
   * wrongly included here makes a free slot unbookable, and a row wrongly
   * skipped double-books the only room there is. Both filters below are
   * therefore load-bearing in a way they were not when the result merely
   * coloured a card red.
   *
   * Cancelled and Bumped rows are skipped: neither holds the room any more, so
   * blocking a slot on them would make the room permanently unbookable after a
   * single cancellation. Priority bookings ARE returned - nothing may be
   * booked over anything, priority included.
   *
   * A candidate carrying a seriesId also skips rows of that SAME series, so a
   * weekly meeting is never reported as conflicting with itself. This does not
   * matter while a series is being created - the new occurrences are not on
   * the board yet, so there is nothing of theirs to collide with - it matters
   * for any check made against a series that is already saved. */
  function findConflicts(candidate, rows) {
    return (rows || []).filter(function (r) {
      if (r._id && candidate._id && r._id === candidate._id) return false;
      if (candidate.seriesId && r.seriesId === candidate.seriesId) return false;
      if (r.status === 'Cancelled' || r.status === 'Bumped') return false;
      return overlaps(candidate, r);
    });
  }

  DFW.state = state;
  DFW.stateHelpers = {
    byline: byline,
    canCancel: canCancel,
    overlaps: overlaps,
    findConflicts: findConflicts,
    isWeekly: isWeekly,
    STATE_KEYS: STATE_KEYS,
    PRIORITY: PRIORITY,
    bufferMs: bufferMs,
    freeAt: freeAt
  };

})();
