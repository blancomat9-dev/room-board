/* MB015 - Conference Room Board : PLACARD
 *
 * The printable door sign. Layout ported from New-RoomPlacard.ps1, with one
 * change: that script downloaded its QR from api.qrserver.com, and this draws
 * it locally with the bundled encoder. One less thing that has to be reachable
 * at the moment somebody needs a sign.
 *
 * THE FROZEN-INK RULE. A printed QR is permanent. Whatever URL is encoded here
 * is the URL on every door until someone reprints every placard. Freeze it,
 * print ONE, scan-test it from about 3 ft in trailer lighting, and only then
 * print the rest.
 */
window.DFW = window.DFW || {};
DFW.views = DFW.views || {};

(function () {

  var ui = DFW.ui, el = ui.el;

  function isLocal(url) {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])(:|\/|$)/i.test(url);
  }

  DFW.views.placard = function (mount, rows, ctx) {
    var url = DFW.CONFIG.PUBLIC_URL;
    var room = DFW.CONFIG.ROOM_NAME;

    mount.appendChild(el('div', { class: 'viewhead noprint' }, [
      el('div', { class: 'eyebrow' }, [el('span', { class: 'tag', text: room })]),
      el('h1', { text: 'Door placard' })
    ]));

    /* ---- Guards, before anything gets printed --------------------------- */

    if (isLocal(url)) {
      mount.appendChild(ui.note(
        'DO NOT PRINT THIS YET. The QR currently encodes ' + url + ', which is this ' +
        'machine. A phone scanning it would look for a server on the phone itself and ' +
        'find nothing. Set PUBLIC_URL in js/config.js to the real published address first.',
        'bad'));
    }

    if (url.length > 100) {
      mount.appendChild(ui.note(
        'That URL is ' + url.length + ' characters. Long URLs make dense QR codes that ' +
        'scan badly at arm\'s length in poor light, which is exactly the condition at a ' +
        'trailer door. Shorten it if you can.', 'warn'));
    }

    if (/\s/.test(url)) {
      mount.appendChild(ui.note('That URL contains a space, which will silently break the scan.', 'bad'));
      return;
    }

    mount.appendChild(ui.note(
      'Print at 100% scale, not "fit to page". Print ONE, scan it with a real phone from ' +
      'about 3 ft in the actual lighting, confirm it opens the board and not a 404, then ' +
      'print and laminate the rest.', null));

    mount.appendChild(el('div', { class: 'cta-row noprint' }, [
      el('button', {
        class: 'btn btn-primary btn-big', type: 'button', text: 'Print this placard',
        onclick: function () { window.print(); }
      }),
      el('a', { class: 'btn', href: '#/', text: 'Back to today' })
    ]));

    /* ---- The sign -------------------------------------------------------- */

    var sheet = el('div', { class: 'placard' });

    sheet.appendChild(el('div', { class: 'placard-room', text: room }));
    sheet.appendChild(el('div', { class: 'placard-sub', text: 'SCAN TO BOOK' }));

    var qrBox = el('div', { class: 'placard-qr' });
    try {
      /* Error correction M: higher levels survive more scuffing but make a
         denser code that is harder to read at distance, and distance is the
         binding constraint on a door. */
      qrBox.appendChild(DFW.qrSvg(url, {
        size: 420, margin: 2, ecl: 'M', label: 'QR code for the ' + room + ' board'
      }));
    } catch (e) {
      qrBox.appendChild(el('div', { class: 'note note-bad', text: 'QR could not be generated: ' + e.message }));
    }
    sheet.appendChild(qrBox);

    sheet.appendChild(el('div', { class: 'placard-cta', text: "See what's booked. Grab the room." }));

    /* These four lines are a CLAIM about how the app behaves, printed onto a
       laminated sign that outlives any code change. Step 4 used to read "Tap
       I'm done when you leave" and went stale the moment the release button
       was removed on 2026-07-30 - a printed instruction pointing at a button
       that is not there. Re-read this list against the actual UI before any
       placard is printed. */
    var steps = el('ol', { class: 'placard-steps' });
    [
      'Point your camera at the code',
      "See what's booked today and this week",
      /* "Book the room" was the page heading, but the NAV BUTTON is labelled
         just "Book". Corrected 2026-08-01 after reading the live UI: a printed
         instruction naming a control that does not exist by that name is the
         exact failure this comment block warns about. */
      'Tap Book, pick a start time and an end time',
      'Pick Every week if it is a standing meeting',
      /* Added 2026-08-01. Release and takeover were deleted on 07-30, so Cancel
         is now the ONLY thing that frees a slot early. Unadvertised, the board
         fills with meetings that are not happening and reads busy when the room
         is empty. */
      'Cancel it on the board if your plans change'
    ].forEach(function (s) { steps.appendChild(el('li', { text: s })); });
    sheet.appendChild(steps);

    /* THE TWO WARNING BOXES ARE STILL GONE (2026-07-30, Matias's call), AND
     * ONE OF THEM IS BACK AS A SINGLE LINE (2026-08-01, Matias's call).
     *
     * They were "This board is the room's only schedule - a Teams or Outlook
     * invite does not hold this room" and "One room, so no double-booking".
     *
     * The argument for taking them off holds and is why only one came back: a
     * door sign gets read in about two seconds by somebody walking past, and
     * every extra block of prose spends some of that. The scan is the whole job.
     *
     * The second box stayed off. "One room, so no double-booking" describes
     * something the app already enforces - taken start chips are disabled and
     * submit re-checks - so a person cannot get it wrong and does not need
     * telling.
     *
     * The first one came back because it is the opposite case: nothing in the
     * app can enforce it. The Teams room resource still exists in Outlook and
     * will never sync with this board (§2 of CLAUDE.md), so somebody can send a
     * Teams invite, get an accept, and arrive to find another crew in the room.
     * Software cannot catch that; only the sign can.
     *
     * ONE line, per the instruction left here on 07-30. Not a box, no amber
     * fill. If it ever grows back into a box, re-read this whole comment first.
     */
    sheet.appendChild(el('div', { class: 'placard-only' }, [
      document.createTextNode(
        'This board is the only schedule for this room. ' +
        'An Outlook or Teams invite does not hold it.')
    ]));

    sheet.appendChild(el('div', { class: 'placard-fallback' }, [
      el('strong', { text: 'No camera? ' }),
      document.createTextNode('Open this in your browser: ' + url)
    ]));

    /* The sheet is inch-sized and wider than a phone. It scrolls inside this
       box so the page body never scrolls sideways. */
    mount.appendChild(el('div', { class: 'placard-wrap' }, [sheet]));
  };

})();
