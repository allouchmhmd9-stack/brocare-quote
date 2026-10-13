/* Puts the insurers' rate books on a quoter page, before the page's own code runs.
     <script src="../tariffs/load.js" data-line="motor"></script>   (or data-line="health")

   · Brocare's own tools: every insurer in DEFAULT, from tariffs/<line>/<insurer>.js.
   · An insurer's demo (its brand file is loaded, see brand.js): that insurer alone,
     from the file its brand settings name (tariffs: { motor: 'brands/<key>/motor.js' }),
     else from tariffs/<line>/<insurer>.js. A line the brand does not sell loads nothing,
     and the page says so.
   Each tariff file adds itself to window.BROCARE_TARIFFS[line][insurer]. */
(function () {
  'use strict';
  var me = document.currentScript, line = me.getAttribute('data-line');
  var root = new URL('..', me.src).href;
  var DEFAULT = { motor: ['fidelity', 'ufa'], health: ['fidelity', 'ufa'] };
  window.BROCARE_TARIFFS = window.BROCARE_TARIFFS || { motor: {}, health: {} };
  var b = window.BROCARE_BRAND, list;
  if (b) {
    var sells = !b.products || b.products.indexOf(line) >= 0;
    var own = b.tariffs && b.tariffs[line];
    list = !sells ? [] : [own || 'tariffs/' + line + '/' + b.insurer + '.js'];
  } else {
    list = DEFAULT[line].map(function (k) { return 'tariffs/' + line + '/' + k + '.js'; });
  }
  /* only plain paths inside this site */
  list.filter(function (p) { return /^[a-z0-9_\-\/]+\.js$/i.test(p) && p.indexOf('..') < 0; })
      .forEach(function (p) { document.write('<script src="' + root + p + '"><\/script>'); });
})();
