/* Brocare tools: layout shell, loaded last on each tool page.
   1. Marks the page as embedded when the console opens it in its frame.
   2. Splits a quoter into two columns (inputs | price and document panel).
      Nodes are moved, not copied, so every listener the tool attached stays. */
(function () {
  'use strict';
  var root = document.documentElement;
  try { if (window.self !== window.top) root.classList.add('embedded'); } catch (_) { root.classList.add('embedded'); }

  var wrap = document.querySelector('.wrap');
  if (!wrap) return;
  var sideIds = ['priceCard', 'bandsBox', 's4', 'crossBox', 'ivBox', 'broPanel'];
  var side = sideIds.map(function (id) { return document.getElementById(id); })
    .filter(function (el) { return el && el.parentNode === wrap; });
  if (!side.length) return;

  var main = document.createElement('div');
  main.className = 'col-main';
  var aside = document.createElement('aside');
  aside.className = 'col-side';

  var keep = /^(backlink|brandbar|foot)$/;
  Array.prototype.slice.call(wrap.children).forEach(function (el) {
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    if (keep.test(el.className)) return;
    if (side.indexOf(el) !== -1) return;
    main.appendChild(el);
  });
  side.forEach(function (el) { aside.appendChild(el); });

  var brand = wrap.querySelector(':scope > .brandbar');
  var anchor = brand ? brand.nextSibling : wrap.firstChild;
  wrap.insertBefore(aside, anchor);
  wrap.insertBefore(main, aside);
  var foot = wrap.querySelector(':scope > .foot');
  if (foot) wrap.appendChild(foot);
  wrap.classList.add('cols');
})();
