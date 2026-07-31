# Conference room booking board

A static, single-page web app for booking one shared conference room from a phone.
Reached by scanning a QR placard on the room door.

- No build step, no framework, no CDN. Plain HTML/CSS/JS loaded as classic scripts.
- Bookings live in a hosted Postgres database. Overlapping bookings are refused by a
  database constraint rather than by client-side JavaScript, so two phones cannot
  both book the same slot.
- Falls back to per-device local storage when no backend is configured.
- Sample data in `js/seed.js` is fabricated.

Live: https://blancomat9-dev.github.io/room-board/
