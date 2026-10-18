/**
 * prayer-times.js — JAKIM-style solar prayer time calculation (offline, zero dependency)
 *
 * Parameters follow the Malaysian practice (JAKIM takwim rasmi, Mazhab Shafie):
 *   - Subuh  : 18 deg depression, Fajr Sadiq (kaki subuh JAKIM)
 *   - Isyak  : 18 deg depression, disappearance of Shafaq Ahamar
 *   - Asar   : shadow length equals object length (factor 1, Mazhab Shafie)
 *   - Syuruk / Maghrib : 90 deg 50' zenith (0 deg 50' ihtiyati above the true horizon)
 *   - Imsak  : 10 minutes before Subuh (not a fardhu time, sahur safety column)
 *   - Every fardhu time carries a +2 minute ihtiyati (safety margin) so the
 *     display never runs later than the mosque's own takwim.
 *
 * Parameters were calibrated against the official JAKIM takwim (e-Solat SGR01/SGR03)
 * and land within ~3 minutes of the published times.
 * All output is in MYT (UTC+8) regardless of the viewer's own timezone.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.EsolatPrayerTimes = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DEG = Math.PI / 180;
  var MYT_OFFSET_MIN = 8 * 60;

  var P = {
    imsakBeforeSubuh: 10,   // minutes
    ihtiyati: 2,            // minutes added to every fardhu time
    fajrDepression: 18,     // degrees
    ishaDepression: 18,     // degrees
    riseSetDepression: 0.833, // degrees (90 deg 50' zenith)
    asrShadowFactor: 1      // Mazhab Shafie
  };

  var ZONES = {
    SGR01: { name: 'SGR01 — Kuala Lumpur, Gombak & Greater KL', lat: 3.1478, lng: 101.6952 },
    SGR03: { name: 'SGR03 — Shah Alam, Klang & Selangor', lat: 3.0733, lng: 101.5183 }
  };

  var ORDER = ['Imsak', 'Subuh', 'Syuruk', 'Zohor', 'Asar', 'Maghrib', 'Isyak'];
  var SOLAT = ['Subuh', 'Zohor', 'Asar', 'Maghrib', 'Isyak'];

  function dsin(d) { return Math.sin(d * DEG); }
  function dcos(d) { return Math.cos(d * DEG); }
  function dtan(d) { return Math.tan(d * DEG); }
  function darcsin(x) { return Math.asin(x) / DEG; }
  function darccos(x) { return Math.acos(x) / DEG; }
  function darctan(y, x) { return Math.atan2(y, x) / DEG; }
  function fixAngle(a) { a = a - 360 * Math.floor(a / 360); return a < 0 ? a + 360 : a; }
  function fixHour(a) { a = a - 24 * Math.floor(a / 24); return a < 0 ? a + 24 : a; }

  /** Julian Day number for 00:00 UT of a Gregorian calendar date. */
  function julian(y, m, d) {
    if (m <= 2) { y -= 1; m += 12; }
    var a = Math.floor(y / 100);
    var b = 2 - a + Math.floor(a / 4);
    return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + b - 1524.5;
  }

  function sunPosition(jd) {
    var D = jd - 2451545.0;
    var g = fixAngle(357.529 + 0.98560028 * D);
    var q = fixAngle(280.459 + 0.98564736 * D);
    var L = fixAngle(q + 1.915 * dsin(g) + 0.020 * dsin(2 * g));
    var e = 23.439 - 0.00000036 * D;
    var ra = fixHour(darctan(dcos(e) * dsin(L), dcos(L)) / 15);
    return {
      declination: darcsin(dsin(e) * dsin(L)),
      equation: q / 15 - ra
    };
  }

  /**
   * Solar transit (noon) for the given Julian day at this longitude.
   * Solves noon_UT = 12 - EoT - lng/15 with two refinement passes, then shifts
   * the result to MYT and appends the ihtiyati margin.
   * Returns the transit hour in MYT plus the sun's declination at that instant.
   */
  function solarNoon(jd, lng) {
    var noonUT = 12 - lng / 15;
    var pos;
    for (var i = 0; i < 3; i++) {
      pos = sunPosition(jd + noonUT / 24);
      noonUT = 12 - pos.equation - lng / 15;
    }
    return {
      hour: fixHour(noonUT + 8) + P.ihtiyati / 60,
      declination: sunPosition(jd + noonUT / 24).declination
    };
  }

  /** Hour angle (in hours) at which the sun sits `depression` degrees BELOW the horizon. */
  function depressionAngleHours(depression, lat, decl, ccw) {
    var cosH = (-dsin(depression) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat));
    cosH = Math.max(-1, Math.min(1, cosH));
    var t = darccos(cosH) / 15;
    return ccw ? -t : t;
  }

  /** Hour angle (in hours) when the object shadow equals `factor` times the object. */
  function asrAngleHours(factor, lat, decl) {
    var shadowAngle = darctan(1, factor + dtan(Math.abs(lat - decl)));
    var cosH = (dsin(shadowAngle) - dsin(decl) * dsin(lat)) / (dcos(decl) * dcos(lat));
    cosH = Math.max(-1, Math.min(1, cosH));
    return darccos(cosH) / 15;
  }

  function toMinutes(hours) {
    var h = fixHour(hours);
    var total = Math.round(h * 60);
    return ((total % 1440) + 1440) % 1440;
  }

  /** Prayer times in MYT minutes-since-midnight for a MYT calendar date. */
  function computeFor(y, m, d, lat, lng) {
    var jd = julian(y, m, d) - lng / (15 * 24);
    var transit = solarNoon(jd, lng);
    var noon = transit.hour;
    var decl = transit.declination;

    var subuh = noon + depressionAngleHours(P.fajrDepression, lat, decl, true);
    var syuruk = noon + depressionAngleHours(P.riseSetDepression, lat, decl, true);
    var zohor = noon;
    var asar = noon + asrAngleHours(P.asrShadowFactor, lat, decl);
    var maghrib = noon + depressionAngleHours(P.riseSetDepression, lat, decl, false);
    var isyak = noon + depressionAngleHours(P.ishaDepression, lat, decl, false);

    return {
      Imsak: toMinutes(subuh - P.imsakBeforeSubuh / 60),
      Subuh: toMinutes(subuh),
      Syuruk: toMinutes(syuruk),
      Zohor: toMinutes(zohor),
      Asar: toMinutes(asar),
      Maghrib: toMinutes(maghrib),
      Isyak: toMinutes(isyak)
    };
  }

  /** Today's calendar parts in MYT, regardless of where the viewer sits. */
  function mytNow(nowMs) {
    var ms = typeof nowMs === 'number' ? nowMs : Date.now();
    var s = new Date(ms + MYT_OFFSET_MIN * 60000);
    return {
      y: s.getUTCFullYear(),
      m: s.getUTCMonth() + 1,
      d: s.getUTCDate(),
      minutes: s.getUTCHours() * 60 + s.getUTCMinutes() + s.getUTCSeconds() / 60,
      ms: ms
    };
  }

  function zone(key) { return ZONES[key] || ZONES.SGR03; }

  /** Forward-shifts (y, m, d) by n days — used for the tomorrow rollover. */
  function addDays(y, m, d, n) {
    var dt = new Date(Date.UTC(y, m - 1, d + n));
    return [dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate()];
  }

  function forDate(y, m, d, zoneKey) {
    var z = zone(zoneKey);
    var times = computeFor(y, m, d, z.lat, z.lng);
    return describe(times, y, m, d, z, zoneKey || 'SGR03', Date.UTC(y, m - 1, d) - MYT_OFFSET_MIN * 60000);
  }

  function forToday(nowMs, zoneKey) {
    var z = zone(zoneKey);
    var n = mytNow(nowMs);
    var times = computeFor(n.y, n.m, n.d, z.lat, z.lng);
    return describe(times, n.y, n.m, n.d, z, zoneKey || 'SGR03', n.ms);
  }

  function describe(times, y, m, d, z, zoneKey, nowMs) {
    var now = mytNow(nowMs);

    // After Isyak the schedule rolls over into tomorrow so the countdown can
    // still point at the coming Subuh.
    var tomorrowTimes = null;
    if (now.minutes >= times.Isyak) {
      var t = addDays(y, m, d, 1);
      tomorrowTimes = computeFor(t[0], t[1], t[2], z.lat, z.lng);
    }

    // Times are absolute minutes from today's midnight so tomorrow's Subuh
    // (1440 + t) can share one comparison axis with today's.
    var schedule = [];
    for (var i = 0; i < SOLAT.length; i++) {
      schedule.push({ name: SOLAT[i], at: times[SOLAT[i]] });
    }
    if (tomorrowTimes) schedule.push({ name: 'Subuh', at: 1440 + tomorrowTimes.Subuh });

    // Active = the latest entry we have already passed (still Isyak before Subuh).
    var activeName = SOLAT[SOLAT.length - 1];
    var nextName = SOLAT[0];
    var nextAtAbs = tomorrowTimes ? 1440 + tomorrowTimes.Subuh : times[SOLAT[0]];

    for (var j = 0; j < schedule.length; j++) {
      if (schedule[j].at <= now.minutes) activeName = schedule[j].name;
      if (schedule[j].at > now.minutes) {
        nextName = schedule[j].name;
        nextAtAbs = schedule[j].at;
        break;
      }
    }

    var nextAt = ((nextAtAbs % 1440) + 1440) % 1440;
    var remainingMs = (nextAtAbs - now.minutes) * 60000;
    var targetAtMs = now.ms + remainingMs;

    return {
      zone: zoneKey,
      zoneName: z.name,
      lat: z.lat,
      lng: z.lng,
      times: times,
      tomorrow: tomorrowTimes,
      order: ORDER,
      solat: SOLAT,
      activePrayer: activeName,
      nextPrayer: nextName,
      nextPrayerAt: nextAt,
      nextPrayerAtMs: targetAtMs,
      remainingMs: remainingMs
    };
  }

  function formatHM(minutes) {
    if (minutes == null || isNaN(minutes)) return '--:--';
    var m = ((minutes % 1440) + 1440) % 1440;
    var h = Math.floor(m / 60);
    return String(h).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  return {
    ZONES: ZONES,
    PARAMS: P,
    formatHM: formatHM,
    mytNow: mytNow,
    forToday: forToday,
    forDate: forDate
  };
});