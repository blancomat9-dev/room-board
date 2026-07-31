/* MB015 - Conference Room Board : seed data
 *
 * Fabricated. No real meetings, no real crew, no real phone numbers. This
 * folder may end up somewhere public, and the moment real names go into a seed
 * file that decision has been made for everyone else.
 *
 * Built RELATIVE TO NOW rather than as fixed dates, so every state renders on
 * whatever day the app is opened. Hardcoded timestamps produce a board that is
 * entirely grey ENDED rows by the following week, which tests nothing.
 *
 * There is one row per state the machine can still reach, so the seeded board
 * doubles as the visual test fixture. TAKEN_OVER, DONE and CONFLICT are
 * deliberately NOT seeded any more: nothing in the app can create them, and
 * seeding a state with no way to reach it would advertise a feature that is
 * gone. (CONFLICT went on 2026-07-30 - one room means the form refuses an
 * overlap rather than recording one.)
 *
 * A few rows carry `details`, the optional description added 2026-07-30. Most
 * do not, on purpose: a board where every card has one would hide the fact
 * that the field is optional and that a blank one must render cleanly.
 */
window.DFW = window.DFW || {};

(function () {

  function iso(t) { return new Date(t).toISOString(); }

  /* Local clock-time on a day offset from today. Built from date parts, not
     millisecond arithmetic, so a DST boundary inside the week cannot shift
     everything by an hour. */
  function at(dayOffset, hour, min) {
    var d = new Date();
    d.setDate(d.getDate() + dayOffset);
    d.setHours(hour, min || 0, 0, 0);
    return d.getTime();
  }

  function minsAgo(n) { return Date.now() - n * 60000; }
  function minsFromNow(n) { return Date.now() + n * 60000; }

  function build() {
    var rows = [];

    /* IN USE NOW - started 30 min ago, another 30 to run. */
    rows.push({
      title: 'Coordination sync',
      start: iso(minsAgo(30)),
      end: iso(minsFromNow(30)),
      bookingType: 'Standard',
      bookedBy: 'Alex Rivera',
      status: 'Booked'
    });

    /* ENDED, recently. This row used to seed RUNNING OVER, which counted the
       minutes a finished meeting was late by; that state was removed
       2026-07-30 and a meeting past its end is simply over. Kept in the seed
       because "finished half an hour ago" and "finished this morning" render
       identically now, and seeing that plainly on the board is the point of
       the change. */
    rows.push({
      title: 'Submittal review',
      start: iso(minsAgo(97)),
      end: iso(minsAgo(37)),
      bookingType: 'Standard',
      bookedBy: 'Bola Okafor',
      status: 'Booked'
    });

    /* MAY RUN LONG - ended 12 minutes ago but declared a 30-minute buffer, so
       the room is still held. The only thing the board says about overtime
       now, and it is a claim the booker made in advance rather than anything
       measured. */
    rows.push({
      title: 'Owner coordination',
      start: iso(minsAgo(72)),
      end: iso(minsAgo(12)),
      bookingType: 'Standard',
      bookedBy: 'Bola Okafor',
      overrunBuffer: 30,
      status: 'Booked'
    });

    /* ENDED - this morning's huddle, quiet grey. */
    rows.push({
      title: 'Morning huddle',
      start: iso(at(0, 6, 30)),
      end: iso(at(0, 7, 0)),
      bookingType: 'Standard',
      bookedBy: 'Clara Lindqvist',
      status: 'Booked'
    });

    /* CANCELLED - somebody gave the slot back. The only status a person can
       now set from the board, so it is the only one seeded as a person-made
       state rather than a clock-made one. */
    rows.push({
      title: 'Budget walkthrough',
      start: iso(at(0, 9, 0)),
      end: iso(at(0, 10, 0)),
      bookingType: 'Standard',
      bookedBy: 'Eddie Salazar',
      status: 'Cancelled'
    });

    /* UPCOMING, with a declared overrun buffer. Shows as a hatched tail on
       the timeline and "+ up to 30 min over" on the card. */
    rows.push({
      title: 'Lookahead planning',
      start: iso(at(0, 15, 0)),
      end: iso(at(0, 16, 0)),
      bookingType: 'Standard',
      bookedBy: 'Alex Rivera',
      overrunBuffer: 30,
      status: 'Booked'
    });

    /* Two bookings BACK TO BACK tomorrow, 10-11 and 11-12.
     *
     * They used to overlap, and the second carried a red
     * 'Conflict - not confirmed'. That state can no longer be created: there
     * is one room, so the form refuses a collision outright (2026-07-30).
     * Seeding a state nothing can reach would advertise a feature that is
     * gone.
     *
     * Kept as a touching pair rather than separated, because back-to-back is
     * the case the overlap test gets wrong when somebody "simplifies" it -
     * a booking ending exactly when the next starts does NOT overlap, and
     * these two rows are what makes that visible on the board. */
    rows.push({
      title: 'Safety stand-down',
      start: iso(at(1, 10, 0)),
      end: iso(at(1, 11, 0)),
      bookingType: 'Standard',
      bookedBy: 'Bola Okafor',
      details: 'Monthly stand-down. Whole crew, hard hats on.',
      status: 'Booked'
    });

    rows.push({
      title: 'Subcontractor check-in',
      start: iso(at(1, 11, 0)),
      end: iso(at(1, 12, 0)),
      bookingType: 'Standard',
      bookedBy: 'Dani Nakamura',
      status: 'Booked'
    });

    /* A WEEKLY series - four real rows sharing one seriesId, which is what the
       form now generates. This replaced 'Recurring - fixed', a booking TYPE
       that coloured a card blue and created nothing: every week still had to
       be booked by hand, so the label promised a recurrence that did not
       exist.

       Seeded starting NEXT week rather than today so the first occurrence is
       cancellable - canCancel refuses anything already started, and a series
       whose only visible row has begun cannot demonstrate the
       "this + 3 after" path. */
    [1, 8, 15, 22].forEach(function (offset, i) {
      rows.push({
        _id: 'seed-weekly-' + i,
        title: 'Weekly foreman meeting',
        start: iso(at(offset, 7, 0)),
        end: iso(at(offset, 8, 0)),
        bookingType: 'Standard',
        bookedBy: 'Eddie Salazar',
        seriesId: 'seed-weekly',
        seriesIndex: i,
        seriesCount: 4,
        status: 'Booked'
      });
    });

    /* PRIORITY with a real slot. It no longer swallows the whole day, so the
       rest of that day stays bookable - which was the point of the change. */
    rows.push({
      title: 'Client walkthrough',
      start: iso(at(3, 9, 0)),
      end: iso(at(3, 11, 30)),
      bookingType: 'PRIORITY',
      bookedBy: 'Frank Whitfield',
      /* The longest seeded description on purpose: the card and the JSON
         export both need one row that is not a single short line, or a
         two-line agenda is the first thing anybody ever tries and the first
         thing to look wrong. */
      details: 'DataBank walking the east rooms with the GC.\n' +
               'Bring the latest one-line and the panel schedules.\n' +
               'Room needs the big monitor and eight chairs.',
      status: 'Booked'
    });

    /* Same day, after the priority slot, to prove the day is still usable. */
    rows.push({
      title: 'Material takeoff',
      start: iso(at(3, 13, 0)),
      end: iso(at(3, 14, 0)),
      bookingType: 'Standard',
      bookedBy: 'Alex Rivera',
      status: 'Booked'
    });

    /* A little ordinary traffic, so the week view is not just edge cases. */
    rows.push({
      title: 'Punchlist review',
      start: iso(at(2, 13, 0)),
      end: iso(at(2, 14, 0)),
      bookingType: 'Standard',
      bookedBy: 'Alex Rivera',
      status: 'Booked'
    });

    rows.push({
      title: 'Preconstruction meeting',
      start: iso(at(4, 9, 0)),
      end: iso(at(4, 10, 30)),
      bookingType: 'Standard',
      bookedBy: 'Bola Okafor',
      status: 'Booked'
    });

    return rows;
  }

  DFW.SEED = { build: build };

})();
