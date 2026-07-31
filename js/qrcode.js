/* DFW Logistics - QR encoder
 *
 * Byte-mode QR generator, versions 1-20, all four error-correction levels,
 * rendered as inline SVG so labels stay crisp at print resolution.
 *
 * Written in-app on purpose. The live sheet calls out to quickchart.io and
 * api.qrserver.com to draw its codes, which means label printing breaks the
 * day one of those hosts goes away or the conex has no signal. Encoding here
 * removes that dependency entirely. The printed QR still encodes a Google Form
 * URL, so the form remains the one thing that must stay alive.
 *
 * Algorithm follows ISO/IEC 18004. Structure mirrors the well-known
 * qrcode-generator approach (Kazuhiko Arase, MIT): GF(256) arithmetic with
 * primitive polynomial 0x11D, Reed-Solomon block interleaving, and the eight
 * standard mask patterns scored by the spec's four penalty rules.
 */
window.DFW = window.DFW || {};

(function () {

  /* ---- Galois field GF(256), primitive polynomial 0x11D ---------------- */

  var EXP = new Array(256), LOG = new Array(256);
  (function () {
    for (var i = 0; i < 8; i++) EXP[i] = 1 << i;
    for (i = 8; i < 256; i++) EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8];
    for (i = 0; i < 255; i++) LOG[EXP[i]] = i;
  })();

  function gexp(n) {
    while (n < 0) n += 255;
    while (n >= 255) n -= 255;
    return EXP[n];
  }
  function glog(n) {
    if (n < 1) throw new Error('glog(' + n + ')');
    return LOG[n];
  }

  /* ---- Polynomials ------------------------------------------------------ */

  function polyTrim(num, shift) {
    var offset = 0;
    while (offset < num.length && num[offset] === 0) offset++;
    var out = new Array(num.length - offset + shift);
    for (var i = 0; i < num.length - offset; i++) out[i] = num[offset + i];
    for (i = num.length - offset; i < out.length; i++) out[i] = 0;
    return out;
  }

  function polyMul(a, b) {
    var out = new Array(a.length + b.length - 1);
    for (var i = 0; i < out.length; i++) out[i] = 0;
    for (i = 0; i < a.length; i++) {
      for (var j = 0; j < b.length; j++) {
        if (a[i] === 0 || b[j] === 0) continue;
        out[i + j] ^= gexp(glog(a[i]) + glog(b[j]));
      }
    }
    return polyTrim(out, 0);
  }

  function polyMod(a, e) {
    var cur = a;
    /* Bounded: each pass strips at least one leading term. */
    for (var guard = 0; guard < 1024; guard++) {
      if (cur.length - e.length < 0) return cur;
      if (cur[0] === 0) { cur = polyTrim(cur, 0); continue; }
      var ratio = glog(cur[0]) - glog(e[0]);
      var next = cur.slice();
      for (var i = 0; i < e.length; i++) {
        if (e[i] === 0) continue;
        next[i] ^= gexp(glog(e[i]) + ratio);
      }
      cur = polyTrim(next, 0);
      if (!cur.length) return [0];
    }
    return cur;
  }

  function rsGenerator(ecLength) {
    var poly = [1];
    for (var i = 0; i < ecLength; i++) poly = polyMul(poly, [1, gexp(i)]);
    return poly;
  }

  /* ---- Reed-Solomon block layout --------------------------------------- */
  /* [ecCodewordsPerBlock, blocksGroup1, dataPerBlock1, blocksGroup2, dataPerBlock2]
     Index order per version: L, M, Q, H */

  var RS_BLOCKS = {
    1:  [[7,1,19,0,0],   [10,1,16,0,0],  [13,1,13,0,0],  [17,1,9,0,0]],
    2:  [[10,1,34,0,0],  [16,1,28,0,0],  [22,1,22,0,0],  [28,1,16,0,0]],
    3:  [[15,1,55,0,0],  [26,1,44,0,0],  [18,2,17,0,0],  [22,2,13,0,0]],
    4:  [[20,1,80,0,0],  [18,2,32,0,0],  [26,2,24,0,0],  [16,4,9,0,0]],
    5:  [[26,1,108,0,0], [24,2,43,0,0],  [18,2,15,2,16], [22,2,11,2,12]],
    6:  [[18,2,68,0,0],  [16,4,27,0,0],  [24,4,19,0,0],  [28,4,15,0,0]],
    7:  [[20,2,78,0,0],  [18,4,31,0,0],  [18,2,14,4,15], [26,4,13,1,14]],
    8:  [[24,2,97,0,0],  [22,2,38,2,39], [22,4,18,2,19], [26,4,14,2,15]],
    9:  [[30,2,116,0,0], [22,3,36,2,37], [20,4,16,4,17], [24,4,12,4,13]],
    10: [[18,2,68,2,69], [26,4,43,1,44], [24,6,19,2,20], [28,6,15,2,16]],
    11: [[20,4,81,0,0],  [30,1,50,4,51], [28,4,22,4,23], [24,3,12,8,13]],
    12: [[24,2,92,2,93], [22,6,36,2,37], [26,4,20,6,21], [28,7,14,4,15]],
    13: [[26,4,107,0,0], [22,8,37,1,38], [24,8,20,4,21], [22,12,11,4,12]],
    14: [[30,3,115,1,116],[24,4,40,5,41],[20,11,16,5,17],[24,11,12,5,13]],
    15: [[22,5,87,1,88], [24,5,41,5,42], [30,5,24,7,25], [24,11,12,7,13]],
    16: [[24,5,98,1,99], [28,7,45,3,46], [24,15,19,2,20],[30,3,15,13,16]],
    17: [[28,1,107,5,108],[28,10,46,1,47],[28,1,22,15,23],[28,2,14,17,15]],
    18: [[30,5,120,1,121],[26,9,43,4,44],[28,17,22,1,23],[28,2,14,19,15]],
    19: [[28,3,113,4,114],[26,3,44,11,45],[26,17,21,4,22],[26,9,13,16,14]],
    20: [[28,3,107,5,108],[26,3,41,13,42],[30,15,24,5,25],[28,15,15,10,16]]
  };

  var ALIGN = {
    1: [], 2: [6,18], 3: [6,22], 4: [6,26], 5: [6,30], 6: [6,34],
    7: [6,22,38], 8: [6,24,42], 9: [6,26,46], 10: [6,28,50],
    11: [6,30,54], 12: [6,32,58], 13: [6,34,62],
    14: [6,26,46,66], 15: [6,26,48,70], 16: [6,26,50,74],
    17: [6,30,54,78], 18: [6,30,56,82], 19: [6,30,58,86], 20: [6,34,62,90]
  };

  /* Format-info values for the error-correction levels. Not the same as the
     ordering used everywhere else, which is a classic source of bugs. */
  var ECL = { L: 0, M: 1, Q: 2, H: 3 };
  var ECL_FORMAT = { L: 1, M: 0, Q: 3, H: 2 };

  var G15 = 0x537, G15_MASK = 0x5412, G18 = 0x1F25;

  function bchDigit(data) {
    var digit = 0;
    while (data !== 0) { digit++; data >>>= 1; }
    return digit;
  }

  function bchTypeInfo(data) {
    var d = data << 10;
    while (bchDigit(d) - bchDigit(G15) >= 0) d ^= (G15 << (bchDigit(d) - bchDigit(G15)));
    return ((data << 10) | d) ^ G15_MASK;
  }

  function bchTypeNumber(data) {
    var d = data << 12;
    while (bchDigit(d) - bchDigit(G18) >= 0) d ^= (G18 << (bchDigit(d) - bchDigit(G18)));
    return (data << 12) | d;
  }

  var MASKS = [
    function (r, c) { return (r + c) % 2 === 0; },
    function (r) { return r % 2 === 0; },
    function (r, c) { return c % 3 === 0; },
    function (r, c) { return (r + c) % 3 === 0; },
    function (r, c) { return (Math.floor(r / 2) + Math.floor(c / 3)) % 2 === 0; },
    function (r, c) { return (r * c) % 2 + (r * c) % 3 === 0; },
    function (r, c) { return ((r * c) % 2 + (r * c) % 3) % 2 === 0; },
    function (r, c) { return ((r + c) % 2 + (r * c) % 3) % 2 === 0; }
  ];

  /* ---- Text to bytes ---------------------------------------------------- */

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) {
        out.push(0xC0 | (c >> 6), 0x80 | (c & 0x3F));
      } else if (c >= 0xD800 && c <= 0xDBFF && i + 1 < str.length) {
        var c2 = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xD800) << 10) + (c2 - 0xDC00);
        out.push(0xF0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3F),
          0x80 | ((cp >> 6) & 0x3F), 0x80 | (cp & 0x3F));
      } else {
        out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 0x3F), 0x80 | (c & 0x3F));
      }
    }
    return out;
  }

  /* ---- Bit buffer -------------------------------------------------------- */

  function BitBuffer() { this.buffer = []; this.length = 0; }
  BitBuffer.prototype.put = function (num, len) {
    for (var i = 0; i < len; i++) this.putBit(((num >>> (len - i - 1)) & 1) === 1);
  };
  BitBuffer.prototype.putBit = function (bit) {
    var idx = Math.floor(this.length / 8);
    if (this.buffer.length <= idx) this.buffer.push(0);
    if (bit) this.buffer[idx] |= (0x80 >>> (this.length % 8));
    this.length++;
  };

  /* ---- Encoder ----------------------------------------------------------- */

  function totalDataCodewords(version, ecl) {
    var b = RS_BLOCKS[version][ECL[ecl]];
    return b[1] * b[2] + b[3] * b[4];
  }

  function pickVersion(byteLen, ecl) {
    for (var v = 1; v <= 20; v++) {
      var countBits = v < 10 ? 8 : 16;
      var capacityBits = totalDataCodewords(v, ecl) * 8;
      if (4 + countBits + byteLen * 8 <= capacityBits) return v;
    }
    throw new Error('Content too long for a version-20 QR code (' + byteLen + ' bytes).');
  }

  function buildCodewords(bytes, version, ecl) {
    var countBits = version < 10 ? 8 : 16;
    var buf = new BitBuffer();
    buf.put(4, 4);                    /* byte mode */
    buf.put(bytes.length, countBits);
    for (var i = 0; i < bytes.length; i++) buf.put(bytes[i], 8);

    var capacity = totalDataCodewords(version, ecl) * 8;

    /* Terminator, up to four zero bits */
    for (i = 0; i < 4 && buf.length < capacity; i++) buf.putBit(false);
    /* Pad to a byte boundary */
    while (buf.length % 8 !== 0) buf.putBit(false);
    /* Then the two alternating pad codewords */
    var pads = [0xEC, 0x11], p = 0;
    while (buf.buffer.length < totalDataCodewords(version, ecl)) {
      buf.buffer.push(pads[p % 2]); p++;
    }

    /* Split into RS blocks, compute EC for each, then interleave */
    var spec = RS_BLOCKS[version][ECL[ecl]];
    var ecCount = spec[0];
    var blocks = [];
    var offset = 0;
    var groups = [[spec[1], spec[2]], [spec[3], spec[4]]];

    groups.forEach(function (g) {
      for (var b = 0; b < g[0]; b++) {
        var dc = buf.buffer.slice(offset, offset + g[1]);
        offset += g[1];
        var gen = rsGenerator(ecCount);
        var mod = polyMod(polyTrim(dc, gen.length - 1), gen);
        var ec = new Array(gen.length - 1);
        for (var i = 0; i < ec.length; i++) {
          var mi = i + mod.length - ec.length;
          ec[i] = mi >= 0 ? mod[mi] : 0;
        }
        blocks.push({ data: dc, ec: ec });
      }
    });

    var maxData = 0, maxEc = 0;
    blocks.forEach(function (b) {
      if (b.data.length > maxData) maxData = b.data.length;
      if (b.ec.length > maxEc) maxEc = b.ec.length;
    });

    var out = [];
    for (i = 0; i < maxData; i++) {
      blocks.forEach(function (b) { if (i < b.data.length) out.push(b.data[i]); });
    }
    for (i = 0; i < maxEc; i++) {
      blocks.forEach(function (b) { if (i < b.ec.length) out.push(b.ec[i]); });
    }
    return out;
  }

  /* ---- Matrix ------------------------------------------------------------ */

  function makeMatrix(version) {
    var size = version * 4 + 17;
    var m = new Array(size);
    for (var r = 0; r < size; r++) {
      m[r] = new Array(size);
      for (var c = 0; c < size; c++) m[r][c] = null;
    }
    return m;
  }

  function placeFinder(m, row, col) {
    var size = m.length;
    for (var r = -1; r <= 7; r++) {
      for (var c = -1; c <= 7; c++) {
        if (row + r < 0 || size <= row + r || col + c < 0 || size <= col + c) continue;
        var on = (0 <= r && r <= 6 && (c === 0 || c === 6)) ||
          (0 <= c && c <= 6 && (r === 0 || r === 6)) ||
          (2 <= r && r <= 4 && 2 <= c && c <= 4);
        m[row + r][col + c] = on;
      }
    }
  }

  function placeTiming(m) {
    var size = m.length;
    for (var i = 8; i < size - 8; i++) {
      if (m[i][6] === null) m[i][6] = (i % 2 === 0);
      if (m[6][i] === null) m[6][i] = (i % 2 === 0);
    }
  }

  function placeAlignment(m, version) {
    var pos = ALIGN[version];
    for (var i = 0; i < pos.length; i++) {
      for (var j = 0; j < pos.length; j++) {
        var row = pos[i], col = pos[j];
        if (m[row][col] !== null) continue;   /* overlaps a finder */
        for (var r = -2; r <= 2; r++) {
          for (var c = -2; c <= 2; c++) {
            m[row + r][col + c] =
              (r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0));
          }
        }
      }
    }
  }

  function placeFormat(m, ecl, mask) {
    var size = m.length;
    var bits = bchTypeInfo((ECL_FORMAT[ecl] << 3) | mask);
    for (var i = 0; i < 15; i++) {
      var on = ((bits >> i) & 1) === 1;
      if (i < 6) m[i][8] = on;
      else if (i < 8) m[i + 1][8] = on;
      else m[size - 15 + i][8] = on;

      if (i < 8) m[8][size - i - 1] = on;
      else if (i < 9) m[8][15 - i - 1 + 1] = on;
      else m[8][15 - i - 1] = on;
    }
    m[size - 8][8] = true;   /* the always-dark module */
  }

  function placeVersion(m, version) {
    if (version < 7) return;
    var size = m.length;
    var bits = bchTypeNumber(version);
    for (var i = 0; i < 18; i++) {
      var on = ((bits >> i) & 1) === 1;
      m[Math.floor(i / 3)][i % 3 + size - 8 - 3] = on;
      m[i % 3 + size - 8 - 3][Math.floor(i / 3)] = on;
    }
  }

  function placeData(m, codewords, mask) {
    var size = m.length;
    var inc = -1, row = size - 1, bitIndex = 7, byteIndex = 0;
    var maskFn = MASKS[mask];

    for (var col = size - 1; col > 0; col -= 2) {
      if (col === 6) col--;
      for (;;) {
        for (var c = 0; c < 2; c++) {
          if (m[row][col - c] === null) {
            var dark = false;
            if (byteIndex < codewords.length) {
              dark = ((codewords[byteIndex] >>> bitIndex) & 1) === 1;
            }
            if (maskFn(row, col - c)) dark = !dark;
            m[row][col - c] = dark;
            bitIndex--;
            if (bitIndex === -1) { byteIndex++; bitIndex = 7; }
          }
        }
        row += inc;
        if (row < 0 || size <= row) { row -= inc; inc = -inc; break; }
      }
    }
  }

  /* ---- Mask scoring (the spec's four penalty rules) --------------------- */

  function penalty(m) {
    var size = m.length, score = 0, r, c, i;

    /* Rule 1: runs of five or more same-colour modules */
    for (r = 0; r < size; r++) {
      var runV = 1, runH = 1;
      for (c = 1; c < size; c++) {
        if (m[r][c] === m[r][c - 1]) runH++;
        else { if (runH >= 5) score += 3 + (runH - 5); runH = 1; }
        if (m[c][r] === m[c - 1][r]) runV++;
        else { if (runV >= 5) score += 3 + (runV - 5); runV = 1; }
      }
      if (runH >= 5) score += 3 + (runH - 5);
      if (runV >= 5) score += 3 + (runV - 5);
    }

    /* Rule 2: 2x2 blocks of one colour */
    for (r = 0; r < size - 1; r++) {
      for (c = 0; c < size - 1; c++) {
        var v = m[r][c];
        if (v === m[r][c + 1] && v === m[r + 1][c] && v === m[r + 1][c + 1]) score += 3;
      }
    }

    /* Rule 3: the finder-lookalike 1:1:3:1:1 pattern with a light run */
    var p1 = [true, false, true, true, true, false, true, false, false, false, false];
    var p2 = [false, false, false, false, true, false, true, true, true, false, true];
    function runMatches(get, len, pat) {
      var hits = 0;
      for (var s = 0; s + pat.length <= len; s++) {
        var ok = true;
        for (var k = 0; k < pat.length; k++) {
          if (get(s + k) !== pat[k]) { ok = false; break; }
        }
        if (ok) hits++;
      }
      return hits;
    }
    for (r = 0; r < size; r++) {
      (function (rr) {
        var rowGet = function (i) { return m[rr][i] === true; };
        var colGet = function (i) { return m[i][rr] === true; };
        score += 40 * (runMatches(rowGet, size, p1) + runMatches(rowGet, size, p2));
        score += 40 * (runMatches(colGet, size, p1) + runMatches(colGet, size, p2));
      })(r);
    }

    /* Rule 4: overall dark/light balance */
    var dark = 0;
    for (r = 0; r < size; r++) for (c = 0; c < size; c++) if (m[r][c] === true) dark++;
    var pct = (dark * 100) / (size * size);
    score += 10 * Math.floor(Math.abs(pct - 50) / 5);

    return score;
  }

  /* ---- Public API --------------------------------------------------------- */

  function encode(text, ecl) {
    ecl = ecl || 'M';
    if (!ECL.hasOwnProperty(ecl)) throw new Error('Unknown EC level: ' + ecl);

    var bytes = utf8Bytes(String(text));
    var version = pickVersion(bytes.length, ecl);
    var codewords = buildCodewords(bytes, version, ecl);

    var best = null, bestScore = Infinity;
    for (var mask = 0; mask < 8; mask++) {
      var m = makeMatrix(version);
      var size = m.length;
      placeFinder(m, 0, 0);
      placeFinder(m, size - 7, 0);
      placeFinder(m, 0, size - 7);
      placeAlignment(m, version);
      placeTiming(m);
      placeFormat(m, ecl, mask);
      placeVersion(m, version);
      placeData(m, codewords, mask);

      var s = penalty(m);
      if (s < bestScore) { bestScore = s; best = m; }
    }

    return { modules: best, size: best.length, version: version, ecl: ecl };
  }

  /* Inline SVG. Vector output means the same markup prints at 1.5in on a conex
     label and 3in on an equipment tag with no resampling. */
  function svg(text, opts) {
    opts = opts || {};
    var margin = opts.margin === undefined ? 2 : opts.margin;
    var qr = encode(text, opts.ecl || 'M');
    var n = qr.size;
    var total = n + margin * 2;

    var path = [];
    for (var r = 0; r < n; r++) {
      for (var c = 0; c < n; c++) {
        if (qr.modules[r][c] === true) {
          path.push('M' + (c + margin) + ' ' + (r + margin) + 'h1v1h-1z');
        }
      }
    }

    var ns = 'http://www.w3.org/2000/svg';
    var el = document.createElementNS(ns, 'svg');
    el.setAttribute('viewBox', '0 0 ' + total + ' ' + total);
    el.setAttribute('shape-rendering', 'crispEdges');
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', opts.label || 'QR code');
    if (opts.size) {
      el.setAttribute('width', opts.size);
      el.setAttribute('height', opts.size);
    }

    var bg = document.createElementNS(ns, 'rect');
    bg.setAttribute('width', total);
    bg.setAttribute('height', total);
    bg.setAttribute('fill', opts.light || '#ffffff');
    el.appendChild(bg);

    var p = document.createElementNS(ns, 'path');
    p.setAttribute('d', path.join(''));
    p.setAttribute('fill', opts.dark || '#000000');
    el.appendChild(p);

    return el;
  }

  DFW.qr = { encode: encode, svg: svg };
  DFW.qrSvg = svg;

  /* Exposed so the encoder can be checked against itself and against the
     spec's own maths. See selftest.js: it rebuilds the reserved-module map,
     reads the data back out of a finished matrix, and confirms the
     Reed-Solomon codewords divide cleanly by the generator polynomial. */
  DFW.qr._internals = {
    makeMatrix: makeMatrix, placeFinder: placeFinder, placeTiming: placeTiming,
    placeAlignment: placeAlignment, placeFormat: placeFormat, placeVersion: placeVersion,
    buildCodewords: buildCodewords, pickVersion: pickVersion, utf8Bytes: utf8Bytes,
    rsGenerator: rsGenerator, polyMod: polyMod, polyTrim: polyTrim,
    totalDataCodewords: totalDataCodewords,
    MASKS: MASKS, RS_BLOCKS: RS_BLOCKS, ECL: ECL, ECL_FORMAT: ECL_FORMAT,
    bchTypeInfo: bchTypeInfo, ALIGN: ALIGN
  };
})();
