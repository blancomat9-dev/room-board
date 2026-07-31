/* MB015 - Conference Room Board : configuration
 *
 * Everything a non-programmer might reasonably need to change lives here, so
 * handing this to someone else means handing them one file.
 */
window.DFW = window.DFW || {};

(function () {

  DFW.CONFIG = {

    /* ---- The room ------------------------------------------------------- */

    ROOM_NAME: 'Conference Room',

    /* OPEN ITEM since 2026-07-27: DFW10 or DFW12 is still unconfirmed.
       It must be settled before a placard is printed, because the site name
       goes on the door sign. */
    SITE: 'Job-site trailer',

    /* ---- Who can book --------------------------------------------------- */
    /*
     * Names are TYPED, not picked from a roster. Decided 2026-07-29: anyone can
     * create a meeting in this room, including people who are not on any list
     * this app could hold, and a dropdown that does not contain you is a wall.
     *
     * The cost is real and should not be glossed over. A roster at least stops
     * blank and misspelled entries, which is why skills\microsoft-field-systems.md
     * recommends one where there is no login. With free text the name on a
     * booking is worth exactly as much as the honesty of whoever typed it. It
     * is still required, so it cannot be empty, and that is the only guarantee
     * left.
     *
     * There is deliberately no CREW list here any more. A half-used roster
     * would be worse than none: it would look authoritative and be neither
     * complete nor enforced.
     */

    /* ---- Time ----------------------------------------------------------- */

    /* THERE IS NO OVERRUN TRACKING ANY MORE (removed 2026-07-30, second pass).
     *
     * The board used to time how far past its end a meeting had run and shout
     * "RUNNING OVER 80 MIN" at it until a 90-minute window (OVERRUN_WINDOW_MS)
     * decayed the nag. Both the constant and the state are gone.
     *
     * The board now does one thing: it shows the meetings booked for the day.
     * Past its end time a booking reads ENDED, whatever is actually happening
     * in the room. The only forward-looking claim left is the buffer below -
     * "this MIGHT go over" - which the person booking declares up front.
     *
     * The cost, stated plainly: nothing on the board tells you a meeting has
     * physically overrun. Walking up to the door does. That was the trade
     * asked for and it is the reason the app is now readable at a glance. */

    /* The grain of the whole booking system, in minutes.
     *
     * Every start time and every duration offered anywhere is a multiple of
     * this. That is why the booking form has no free-text clock field: a typed
     * time invites 8:07, and 8:07 makes the timeline unreadable and the board
     * impossible to skim. Changing this to 30 halves the number of slots and
     * still works; changing it to 7 does not, and nothing here will stop you. */
    SLOT_MINS: 15,

    /* Working day the slot grid covers by default. A person who genuinely
       needs 5:30 AM taps "All hours" in the form and gets the full 24.
       OPEN ITEM: 6:00-18:00 came from the MB015 flow spec as an example and
       was explicitly never confirmed with the crew. */
    DAY_START_HOUR: 6,
    DAY_END_HOUR: 18,

    /* How often the board recomputes itself. The SharePoint version evaluated
       @now only at page load, so a page left open on a wall display went stale
       and quietly lied. Re-rendering on a timer is the one behaviour a web app
       gets to improve. */
    TICK_MS: 30 * 1000,

    /* Where the END chip lands when a start time is first tapped, in minutes.
     *
     * A default, not a control. The form asks for a START TIME and an END TIME
     * (changed 2026-07-30): two grids of real clock times, both on the
     * SLOT_MINS grain. It used to ask for a start and a LENGTH, which meant
     * everyone did the arithmetic in their head - "quarter past twelve, plus an
     * hour and a quarter" - to answer a question they already knew the answer
     * to. Book 12:15 to 1:30 and pick 1:30. */
    DEFAULT_BOOKING_MINS: 60,

    /* How many days forward the day picker offers. Two weeks is enough for a
       trailer conference room and short enough to stay a single tappable strip
       instead of a date wheel. Anything further out uses the date field. */
    DAY_PICKER_DAYS: 14,

    /* ---- Weekly meetings ------------------------------------------------ */
    /*
     * Replaces the old "Standing meeting" booking TYPE, which was a label and
     * nothing more: it coloured a card blue and generated no occurrences, so
     * every week still had to be booked by hand. Removed 2026-07-30.
     *
     * A weekly booking now MATERIALISES one real row per week, all sharing a
     * seriesId. There is deliberately still no recurrence ENGINE - no rule
     * stored and expanded at read time - because every view, the conflict
     * check, and the cancel path already work on plain rows, and a virtual
     * occurrence would have to be special-cased in all of them.
     *
     * The cost of materialising: the series stops at the last row generated.
     * It does not roll forward on its own and nobody is reminded. Booking 12
     * weeks means the 13th week is free and nothing says so.
     */
    REPEAT_WEEKS: [2, 4, 8, 12],
    DEFAULT_REPEAT_WEEKS: 4,

    /* Hard ceiling on one submission. 26 weeks of a daily-standup-sized
       mistake is 26 rows somebody has to cancel. The form offers at most 12. */
    MAX_REPEAT_WEEKS: 26,

    /* "This might go over", in minutes, declared when booking.
     *
     * The only thing the board says about overtime now. It is a claim made in
     * advance by the person booking, not a measurement: the room reads MAY RUN
     * LONG until the buffer is spent, then ENDED. Nothing counts minutes.
     *
     * Capped at 60 deliberately - a longer buffer is not a buffer, it is a
     * longer booking, and now that the form takes a real end time there is no
     * excuse for not booking it as one. */
    OVERRUN_CHOICES: [0, 15, 30, 45, 60],

    /* ---- The QR target -------------------------------------------------- */
    /*
     * FROZEN INK. Whatever this says is what gets encoded into every printed
     * placard, and a printed QR is permanent: rename the host or the path and
     * every door sign is orphaned.
     *
     * LIVE as of 2026-07-31 on public GitHub Pages, repo blancomat9-dev/room-board,
     * served from main at root. 44 characters, comfortably inside the placard
     * view's 100-char warning, and short enough to encode as a sparse QR that
     * scans in trailer lighting.
     *
     * Renaming the repo or the account changes this URL and orphans every
     * placard already on a door. It is still free to change TODAY, because
     * nothing has been printed yet. After the first print run it is not.
     *
     * For local testing, serve.ps1 still runs on http://localhost:8081/ - just
     * do not print anything while this line says localhost, because that URL
     * resolves to the phone itself, not to this machine.
     */
    PUBLIC_URL: 'https://blancomat9-dev.github.io/room-board/',

    /* ---- The shared board ------------------------------------------------ */
    /*
     * Set 2026-07-31. This is what turns the app from a prototype into a
     * booking system: with it present, every device talks to one Postgres
     * table and sees the same schedule. Blank it out and the app falls back to
     * localStorage, which still works and is still per-device.
     *
     * THE KEY BELOW IS MEANT TO BE PUBLIC. It is the Supabase `anon` key, it
     * is served inside this page to every phone that loads it, and there is no
     * way to ship a browser-only app without it being readable. What keeps it
     * safe is the row level security in backend\schema.sql, not secrecy:
     * holding this key lets you read the board, add a booking and cancel one.
     * It does not let you delete a row, edit somebody else's booking, or empty
     * the table.
     *
     * The OTHER key Supabase issues - `service_role`, now also called `secret`
     * - bypasses RLS entirely and must never appear in this file, this repo, or
     * any note. If one is ever pasted somewhere it should not be, it is burned:
     * rotate it, do not just delete the line (vault CLAUDE.md section 13).
     *
     * Verified on the live project 2026-07-31: anon and authenticated hold
     * INSERT, SELECT and UPDATE on bookings and nothing else. TRUNCATE was
     * revoked - RLS does not cover it, so the no-delete policy did not stop it.
     */
    SUPABASE: {
      url: 'https://ozlzqqruytpeqtgsdkwq.supabase.co',
      anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im96bHpxcXJ1eXRwZXF0Z3Nka3dxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0OTc3NjQsImV4cCI6MjEwMTA3Mzc2NH0.oC9AOYFJ5ptZO6YcmLwC56oi4bkUBBoviLXA9Ayq_7Y'
    },

    /* ---- Vocabulary ----------------------------------------------------- */
    /*
     * These strings are matched literally by state.js. Changing the text of
     * one without changing the other drops a booking through every condition
     * and renders it as a plain grey row - the exact failure the SharePoint
     * spec warned about when it said to turn off "Can add values manually".
     */
    /* PRIORITY takes a real start and end like anything else. It used to be an
       all-day lock, which meant claiming a whole day to protect one hour.
       Changed 2026-07-29.

       What PRIORITY still means, and it is now less than it was: a visible
       "this one matters, do not ask me to move it" badge on the card. What it
       no longer means: it does not sit on top of the clock, nothing can be
       taken over (that feature is gone), and it no longer confers any booking
       privilege at all - since 2026-07-30 NOTHING can be booked over anything,
       priority or not, so being un-book-over-able stopped being special.

       'Recurring - fixed' and 'Emergency takeover' were both removed
       2026-07-30. Weekly meetings are a repeat setting on a Standard booking,
       not a type; takeovers no longer exist. */
    BOOKING_TYPES: [
      'Standard',
      'PRIORITY'
    ],

    /* THERE IS ONE ROOM, SO THERE ARE NO OVERLAPS (2026-07-30).
     *
     * 'Conflict - not confirmed' went with that. The old design let two
     * bookings sit on the same slot and marked the later one red, on the
     * theory that showing a clash beats blocking a person who genuinely needs
     * the time. With a single physical room that theory is wrong: two
     * bookings for one room at one time is not information, it is two crews
     * walking into each other, and the board is the only thing that could
     * have stopped it.
     *
     * The form now refuses. A taken slot is not tappable and a colliding
     * submission is rejected.
     *
     * 'Done' and 'Bumped' were removed earlier the same day with the release
     * and takeover buttons. state.js still RENDERS all three, because a JSON
     * file exported from an older build can still be imported on the Data
     * page and those rows must not silently come back as live bookings.
     * Nothing creates any of them. */
    STATUSES: [
      'Booked',
      'Cancelled'
    ]
  };

})();
