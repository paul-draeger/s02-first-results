/* ---------------------------------------------------------------------------
 * tud-slides.js — the runtime every presentation in this repository shares.
 *
 * It gives a deck the three things the reports get from LaTeX:
 *
 *   - the symbols of shared/variables.tex as MathJax macros, so a slide writes
 *     \density where the report writes \density;
 *   - \cite, as `[@key]` in prose or <cite data-key="key">, resolved against
 *     shared/literatur.bib -- als Nummer in der Reihenfolge des ersten
 *     Auftretens oder als [Autor, Jahr], siehe citationStyle;
 *   - the back matter: a nomenclature listing exactly the symbols the deck used
 *     and a bibliography listing exactly the references it cited.
 *
 * plus the CD furniture: the logo band on the title slide, the footer, and a
 * slide number on every slide.
 *
 * A deck loads shared_data.js and this file, then calls TUD.init({...}) instead
 * of Reveal.initialize({...}). See S00_main/README.md.
 * ------------------------------------------------------------------------- */

window.TUD = (function () {
  'use strict';

  var SHARED = window.TUD_SHARED || { macros: {}, symbols: {}, bib: {} };

  var DEFAULTS = {
    // Path from the deck to S00_main's theme and lib, overridden by a deck that
    // sits somewhere else in the tree.
    assets: '..',
    // 'en' or 'de' — picks the wordmark on the title slide.
    language: 'en',
    // Extra MathJax macros, on top of the ones from variables.tex.
    macros: {},
    /* Ein Symbol fuer diesen Vortrag anders schreiben, als variables.tex es
       schreibt: { surf: { formula: '\\sigma', sort: 'sigma' } }.
       Gebraucht, wo ein Fachgebiet dasselbe anders setzt -- die
       Oberflaechenspannung heisst in variables.tex gamma und in den Plots
       dieses Vortrags sigma. Die Aenderung greift an beiden Orten zugleich,
       auf der Folie und in der Nomenklatur, weil die Formel auch das
       MathJax-Makro ist. Sie gilt nur fuer diese Seite; variables.tex bleibt
       unberuehrt, und damit jeder Bericht des Repos. */
    symbols: {},
    // Symbols to list in the nomenclature even though no slide writes them.
    includeSymbols: [],
    // Also list the symbols that a listed symbol's own description refers to.
    expandNomenclature: true,
    // References to list in the bibliography even though no slide cites them.
    includeReferences: [],
    /* Wie ein Zitat auf der Folie steht:

         'nummer'  [1], in der Reihenfolge des ersten Auftretens, und ein
                   nummeriertes Literaturverzeichnis dazu. Die Vorgabe.
         'autor'   [Dalmon et al., 2018] -- wer und wann, ohne dass jemand
                   nach hinten blaettern muss. Das Verzeichnis ist dann
                   unnummeriert und alphabetisch, denn eine Nummer, auf die
                   keine Folie zeigt, ist keine. */
    citationStyle: 'nummer',
    // Rows of back matter per slide, before it is broken onto another slide.
    backMatterRows: 10,
    // Merged into the reveal.js configuration.
    reveal: {}
  };

  var GROUPS = [{ type: 'latin' }, { type: 'greek' }, { type: 'operator' }];

  /* Was der Rückstand sagt, in der Sprache des Vortrags.
   *
   * `language` schaltete bisher nur die Wortmarke der Titelfolie. Ein deutscher
   * Vortrag bekam damit eine Nomenklatur mit der Überschrift "Nomenclature" und
   * den Gruppen "Latin" und "Greek" -- Text, den kein Autor geschrieben hat und
   * den er ohne diese Tabelle auch nicht ändern kann, weil er zur Laufzeit
   * entsteht. Eine Folie, deren Überschrift im Quelltext steht, gilt weiterhin
   * vor: der Rückstand nimmt sie, wenn der Autor eine schreibt. */
  var TEXTS = {
    en: {
      nomenclature: 'Nomenclature', references: 'References',
      latin: 'Latin', greek: 'Greek', operator: 'Operators', other: 'Other',
      noSymbols: 'No symbols used.', nothingCited: 'Nothing cited.'
    },
    de: {
      nomenclature: 'Nomenklatur', references: 'Literatur',
      latin: 'Lateinisch', greek: 'Griechisch', operator: 'Operatoren',
      other: 'Sonstige',
      noSymbols: 'Keine Symbole verwendet.', nothingCited: 'Nichts zitiert.'
    }
  };

  function say(name) {
    var table = TEXTS[options && options.language === 'de' ? 'de' : 'en'];
    return table[name];
  }

  var options = null;
  var citationOrder = [];      // bib keys, in order of first appearance
  var usedSymbols = [];        // symbol labels, in order of first appearance

  // ------------------------------------------------------------------ utils

  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var source = arguments[i] || {};
      for (var key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) target[key] = source[key];
      }
    }
    return target;
  }

  function el(tag, className, html) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function escapeHTML(text) {
    return String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function asset(path) {
    return options.assets.replace(/\/$/, '') + '/' + path;
  }

  function leafSlides() {
    return Array.prototype.filter.call(
      document.querySelectorAll('.reveal .slides section'),
      function (section) { return !section.querySelector('section'); });
  }

  function isGenerated(section) {
    return section.hasAttribute('data-generate');
  }

  // -------------------------------------------------------------- citations

  /* Ein Zitat in der Form [Autor, Jahr]. Die Quelle steht nicht dabei --
     sie ist auf einer Folie die laengste und die unwichtigste der drei
     Angaben: wer im Publikum die Arbeit kennt, erkennt sie an Name und Jahr,
     und wer sie nicht kennt, findet sie hinten im Verzeichnis, wo sie
     vollstaendig steht. */
  function zitatAutorJahr(entry) {
    return [entry.authors, entry.year].filter(Boolean).join(', ');
  }

  /* `[@key]`, `[@key1; @key2]` in a text node, and <cite data-key="a,b">. Both
     become a <span class="cite">, labelled on the second pass. */

  var CITE_IN_TEXT = /\[@([A-Za-z0-9_:.-]+(?:\s*[;,]\s*@?[A-Za-z0-9_:.-]+)*)\]/g;
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, PRE: 1, CODE: 1, TEXTAREA: 1 };

  function markCitationsInText(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (node.parentNode && SKIP_TAGS[node.parentNode.nodeName]) return NodeFilter.FILTER_REJECT;
        // lastIndex zuruecksetzen, bevor getestet wird. CITE_IN_TEXT traegt /g
        // -- das braucht der replace() weiter unten --, und .test() auf einem
        // globalen Regex merkt sich, wo es aufgehoert hat. Ohne diese Zeile
        // beginnt jeder zweite Test mitten im vorigen Text: der Knoten wird
        // abgewiesen und sein Zitat bleibt als [@schluessel] stehen.
        CITE_IN_TEXT.lastIndex = 0;
        return CITE_IN_TEXT.test(node.nodeValue) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    var pending = [], node;
    while ((node = walker.nextNode())) pending.push(node);

    pending.forEach(function (textNode) {
      var html = escapeHTML(textNode.nodeValue).replace(CITE_IN_TEXT, function (_, keys) {
        var list = keys.split(/[;,]/).map(function (k) { return k.trim().replace(/^@/, ''); });
        return '<cite data-key="' + list.join(',') + '"></cite>';
      });
      var holder = el('span', null, html);
      var parent = textNode.parentNode;
      while (holder.firstChild) parent.insertBefore(holder.firstChild, textNode);
      parent.removeChild(textNode);
    });
  }

  function numberCitations() {
    var nachAutor = options.citationStyle === 'autor';
    var elements = document.querySelectorAll('.reveal .slides cite[data-key]');
    Array.prototype.forEach.call(elements, function (node) {
      var teile = node.getAttribute('data-key').split(',').map(function (key) {
        key = key.trim();
        if (!key) return null;
        if (!SHARED.bib[key]) {
          console.warn('[tud-slides] unknown bibliography key: ' + key);
          return '?';
        }
        if (citationOrder.indexOf(key) === -1) citationOrder.push(key);
        return nachAutor ? zitatAutorJahr(SHARED.bib[key])
                         : citationOrder.indexOf(key) + 1;
      }).filter(function (n) { return n !== null; });

      node.className = (node.className ? node.className + ' ' : '') + 'cite'
        + (nachAutor ? ' autor' : '');
      // Mehrere Quellen in einer Klammer: das Semikolon trennt sie, weil
      // jedes Zitat selbst schon ein Komma fuehrt.
      node.textContent = '[' + teile.join(nachAutor ? '; ' : ', ') + ']';
    });

    options.includeReferences.forEach(function (key) {
      if (!SHARED.bib[key]) {
        console.warn('[tud-slides] unknown bibliography key: ' + key);
      } else if (citationOrder.indexOf(key) === -1) {
        citationOrder.push(key);
      }
    });
  }

  // ---------------------------------------------------------------- symbols

  function macroPattern() {
    var names = Object.keys(SHARED.macros).sort(function (a, b) { return b.length - a.length; });
    if (!names.length) return null;
    return new RegExp('\\\\(' + names.join('|') + ')(?![A-Za-z])', 'g');
  }

  /* Die Umschreibungen aus `symbols` anwenden -- vor allem anderen, damit
     Folien, Nomenklatur und die Beschreibungen der uebrigen Symbole dieselbe
     Schreibweise sehen. Die Beschreibungen tragen die Makros selbst
     ("$\bondrot = \density \rotrate^2 \armlen \tankrad^2 / \surf$"), also
     zieht ein geaendertes Makro sie mit. */
  function applySymbolOverrides() {
    var wishes = options.symbols || {};
    Object.keys(wishes).forEach(function (cmd) {
      var symbol = SHARED.symbols && SHARED.symbols[cmd];
      if (!symbol) {
        console.warn('[tud-slides] symbols: no such symbol in variables.tex: ' + cmd);
        return;
      }
      var wish = wishes[cmd];
      Object.keys(wish).forEach(function (field) { symbol[field] = wish[field]; });
      if (wish.formula && SHARED.macros && SHARED.macros[cmd] !== undefined) {
        SHARED.macros[cmd] = wish.formula;
      }
    });
  }

  /* Which symbols does the deck actually use? The reports answer this with
     \glsadd inside the symbol command; here the slide source is scanned for the
     same commands before MathJax consumes them. */
  function collectSymbols() {
    var byCommand = {};
    Object.keys(SHARED.symbols).forEach(function (label) {
      var cmd = SHARED.symbols[label].cmd;
      if (cmd) byCommand[cmd] = label;
    });

    var pattern = macroPattern();
    leafSlides().forEach(function (section) {
      if (isGenerated(section)) return;

      if (pattern) {
        pattern.lastIndex = 0;
        var source = section.innerHTML, match;
        while ((match = pattern.exec(source)) !== null) {
          var label = byCommand[match[1]];
          if (label && usedSymbols.indexOf(label) === -1) usedSymbols.push(label);
        }
      }

      Array.prototype.forEach.call(section.querySelectorAll('[data-sym]'), function (node) {
        node.getAttribute('data-sym').split(',').forEach(function (label) {
          label = label.trim();
          if (!label) return;
          if (!SHARED.symbols[label]) {
            console.warn('[tud-slides] unknown symbol: ' + label);
            return;
          }
          if (usedSymbols.indexOf(label) === -1) usedSymbols.push(label);
          if (!node.innerHTML.trim()) {
            node.innerHTML = '\\(' + SHARED.symbols[label].formula + '\\)';
          }
        });
      });
    });

    options.includeSymbols.forEach(function (label) {
      if (!SHARED.symbols[label]) {
        console.warn('[tud-slides] unknown symbol: ' + label);
      } else if (usedSymbols.indexOf(label) === -1) {
        usedSymbols.push(label);
      }
    });

    if (options.expandNomenclature) expandSymbols(byCommand, pattern);
  }

  /* A description explains one symbol in terms of others — \re reads
     "Re = \ub \db / \vis". Those have to be in the table too, or the reader
     meets a symbol the nomenclature does not define. This is what \glsadd does
     inside a printed description; here it is a fixed point over the set. */
  function expandSymbols(byCommand, pattern) {
    if (!pattern) return;
    for (var round = 0; round < 8; round++) {
      var before = usedSymbols.length;
      usedSymbols.slice().forEach(function (label) {
        var symbol = SHARED.symbols[label];
        var source = symbol.formula + ' ' + symbol.description + ' ' + symbol.unit;
        pattern.lastIndex = 0;
        var match;
        while ((match = pattern.exec(source)) !== null) {
          var found = byCommand[match[1]];
          if (found && found !== label && usedSymbols.indexOf(found) === -1) usedSymbols.push(found);
        }
      });
      if (usedSymbols.length === before) return;
    }
    console.warn('[tud-slides] nomenclature expansion did not settle after 8 rounds');
  }

  // ------------------------------------------------------------ back matter

  function symbolRowHTML(symbol) {
    return '<tr>' +
      '<td class="sym">\\(' + symbol.formula + '\\)</td>' +
      '<td class="unit">' + (symbol.unitHTML || '—') + '</td>' +
      '<td class="desc">' + (symbol.descriptionHTML || '') +
      (symbol.noteHTML ? '<span class="note">' + symbol.noteHTML + '</span>' : '') +
      '</td></tr>';
  }

  /* The back matter is paginated rather than scrolled: a nomenclature of two
     dozen symbols does not fit on one slide, and a slide a viewer has to
     scroll is a slide half the room never sees. Pages are cut on a row budget
     rather than by measuring, so the same deck always breaks in the same
     place — tune the budget with backMatterRows if a deck's descriptions run
     long. A group heading costs a row. */

  function nomenclaturePages() {
    if (!usedSymbols.length) return ['<p class="muted">' + say('noSymbols') + '</p>'];

    var sorted = usedSymbols.slice().sort(function (a, b) {
      var sa = (SHARED.symbols[a].sort || a).toLowerCase();
      var sb = (SHARED.symbols[b].sort || b).toLowerCase();
      return sa < sb ? -1 : sa > sb ? 1 : 0;
    });

    var grouped = GROUPS.map(function (g) { return g.type; });
    var sections = GROUPS.map(function (group) {
      return {
        heading: say(group.type),
        labels: sorted.filter(function (l) { return SHARED.symbols[l].type === group.type; })
      };
    });
    // A symbol whose type is none of the three groups would vanish silently.
    sections.push({
      heading: say('other'),
      labels: sorted.filter(function (l) { return grouped.indexOf(SHARED.symbols[l].type) === -1; })
    });

    var budget = options.backMatterRows;
    var pages = [], html = '', used = 0;

    function flush() {
      if (html) pages.push(html);
      html = '';
      used = 0;
    }

    sections.forEach(function (group) {
      if (!group.labels.length) return;
      var index = 0;
      while (index < group.labels.length) {
        if (used + 2 > budget) flush();                 // no orphan headings
        html += '<h4>' + group.heading + '</h4><table class="nomenclature"><tbody>';
        used += 1;
        while (index < group.labels.length && used < budget) {
          html += symbolRowHTML(SHARED.symbols[group.labels[index]]);
          index += 1;
          used += 1;
        }
        html += '</tbody></table>';
        if (index < group.labels.length) flush();
      }
    });
    flush();
    return pages.length ? pages : ['<p class="muted">' + say('noSymbols') + '</p>'];
  }

  function referenceHTML(entry) {
    var parts = [];
    if (entry.authors) parts.push(escapeHTML(entry.authors));
    if (entry.year) parts.push('(' + escapeHTML(entry.year) + ')');
    var head = parts.join(' ');

    var html = (head ? head + ': ' : '') +
      '<span class="bib-title">' + escapeHTML(entry.title) + '</span>';
    if (entry.source) html += '. <span class="bib-source">' + escapeHTML(entry.source) + '</span>';
    if (entry.detail) html += ' ' + escapeHTML(entry.detail);
    html += '.';
    if (entry.doi) {
      html += ' <a href="https://doi.org/' + encodeURI(entry.doi) + '">doi:' +
        escapeHTML(entry.doi) + '</a>';
    } else if (entry.url) {
      html += ' <a href="' + encodeURI(entry.url) + '">' + escapeHTML(entry.url) + '</a>';
    }
    return html;
  }

  function bibliographyPages() {
    if (!citationOrder.length) return ['<p class="muted">' + say('nothingCited') + '</p>'];

    /* Die Reihenfolge folgt dem Zitat: wer auf der Folie [1] liest, sucht
       hinten die 1; wer [Dalmon et al., ...] liest, sucht das D. */
    var nachAutor = options.citationStyle === 'autor';
    var reihe = citationOrder.slice();
    if (nachAutor) {
      reihe.sort(function (a, b) {
        var ea = SHARED.bib[a], eb = SHARED.bib[b];
        return (ea.authors || '').localeCompare(eb.authors || '', 'de')
            || String(ea.year || '').localeCompare(String(eb.year || ''));
      });
    }

    // A reference wraps to two lines more often than not, so it costs two rows.
    var perPage = Math.max(1, Math.floor(options.backMatterRows / 2));
    var pages = [];
    for (var start = 0; start < reihe.length; start += perPage) {
      var slice = reihe.slice(start, start + perPage);
      var eintraege = slice.map(function (key) {
        return '<li>' + referenceHTML(SHARED.bib[key]) + '</li>';
      }).join('');
      pages.push(nachAutor
        ? '<ul class="bibliography autor">' + eintraege + '</ul>'
        : '<ol class="bibliography" start="' + (start + 1) + '">' + eintraege + '</ol>');
    }
    return pages;
  }

  /* Replace every <section data-generate="nomenclature|bibliography"> with as
     many slides as its content needs. The placeholder's own attributes and any
     heading the author wrote are carried onto the first page. */
  function fillBackMatter() {
    Array.prototype.forEach.call(
      document.querySelectorAll('.reveal .slides section[data-generate]'),
      function (placeholder) {
        var kind = placeholder.getAttribute('data-generate');
        var pages = kind === 'nomenclature' ? nomenclaturePages()
          : kind === 'bibliography' ? bibliographyPages() : null;
        if (pages === null) {
          console.warn('[tud-slides] unknown data-generate value: ' + kind);
          return;
        }

        var authored = placeholder.querySelector('h1, h2, h3');
        var title = authored ? authored.textContent
          : say(kind === 'nomenclature' ? 'nomenclature' : 'references');
        var anchor = placeholder;

        pages.forEach(function (body, index) {
          var section = index === 0 ? placeholder : el('section');
          if (index > 0) {
            section.setAttribute('data-generate', kind);
            anchor.parentNode.insertBefore(section, anchor.nextSibling);
          }
          section.classList.add('backmatter-slide');
          section.innerHTML = '';
          // Numbered rather than marked "(cont.)": on the third page of a
          // nomenclature the reader wants to know which page, not that it
          // continues — which the heading already says.
          section.appendChild(el('h2', null, escapeHTML(title) +
            (pages.length > 1 ? ' <span class="page-of">' + (index + 1) +
              '<span class="sep">/</span>' + pages.length + '</span>' : '')));
          section.appendChild(el('div', 'backmatter', body));
          anchor = section;
        });
      });
  }

  // -------------------------------------------------------------- furniture

  function buildTitleSlide() {
    var title = document.querySelector('.reveal .slides section.title-slide');
    if (!title || title.querySelector('.title-logos')) return;

    var band = el('div', 'title-logos');
    var tud = el('img', 'tud-logo');
    tud.src = asset('theme/logos/tud_horizontal_white_' +
      (options.language === 'de' ? 'de' : 'en') + '.svg');
    tud.alt = 'TU Dresden';
    var ism = el('img', 'ism-logo');
    ism.src = asset('theme/logos/ism_logo_white.png');
    ism.alt = 'Institute of Fluid Mechanics';
    band.appendChild(tud);
    band.appendChild(ism);

    /* Bottom row of the title slide: the logos on the left, the grey imprint
       beside them. The deck writes .affiliation and .occasion as ordinary
       paragraphs and they are moved in here, so a deck never has to know that
       the logos exist. */
    var row = el('div', 'title-bottom');
    row.appendChild(band);

    var imprint = el('div', 'title-imprint');
    Array.prototype.forEach.call(
      title.querySelectorAll('.affiliation, .occasion'),   // document order
      function (node) { imprint.appendChild(node); });
    if (imprint.childNodes.length) row.appendChild(imprint);

    title.appendChild(row);

    /* A deck with a single author may write .author and .email straight into
       the slide; wrap them so the row is a column of one and a second author
       is only a matter of adding another block. */
    if (!title.querySelector('.authors')) {
      var loose = title.querySelectorAll(':scope > .author, :scope > .email');
      if (loose.length) {
        var authors = el('div', 'authors');
        var block = el('div', 'author-block');
        Array.prototype.forEach.call(loose, function (node) { block.appendChild(node); });
        authors.appendChild(block);
        title.insertBefore(authors, row);
      }
    }

    /* The three rows are spread over the full height of the slide by a flex
       column — on an inner element, not on the <section>: reveal's own
       `display: block` on the present slide outranks anything that could be
       written for the section without also breaking the `display: none` that
       hides the others. A wrapper is not subject to that rule at all, and if
       its height does not resolve the rows simply stack from the top. */
    var grid = el('div', 'title-grid');
    while (title.firstChild) grid.appendChild(title.firstChild);
    title.appendChild(grid);
  }

  /* The footer carries the slide number and nothing else. The logos belong to
     the title slide; repeating them on every slide, with a rule above them, is
     furniture the audience stops seeing after slide two. */
  /* A divider is a short block that belongs in the middle of the slide. Same
     trick as the title grid: the flex column goes on a wrapper, because the
     <section> itself cannot be made a flex container without breaking the
     `display: none` that hides every slide but the current one. */
  function buildSectionSlides() {
    wrapChildren('.reveal .slides section.section-slide', 'center-grid');
    // A slide written as data-layout="fill" gives its figure whatever height is
    // left under the heading, instead of the figure taking the whole slide and
    // pushing its own caption off the bottom.
    wrapChildren('.reveal .slides section[data-layout="fill"]', 'fill-grid');
  }

  function wrapChildren(selector, className) {
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (section) {
      if (section.querySelector(':scope > .' + className)) return;
      var grid = el('div', className);
      while (section.firstChild) grid.appendChild(section.firstChild);
      section.appendChild(grid);
    });
  }

  function buildFooters() {
    var slides = leafSlides();
    var total = slides.length;
    slides.forEach(function (section, index) {
      if (section.querySelector(':scope > .tud-footer')) return;
      var footer = el('div', 'tud-footer');
      footer.appendChild(el('span', 'slide-no',
        '<span class="current">' + (index + 1) + '</span>' +
        '<span class="sep">/</span>' +
        '<span class="total">' + total + '</span>'));
      section.appendChild(footer);
    });
  }

  // ------------------------------------------------------------------- init

  /* variables.tex is written for the report preamble, which loads bm, siunitx
     and stmaryrd. MathJax knows none of those by that name, so the commands the
     formulas actually use are mapped onto what it does know — without them a
     symbol renders as red error text instead of a glyph. */
  var PREAMBLE_MACROS = {
    si: ['\\mathrm{#1}', 1],
    unit: ['\\mathrm{#1}', 1],
    bm: ['\\boldsymbol{#1}', 1],
    ensuremath: ['{#1}', 1],
    llbracket: '[\\![',
    rrbracket: ']\\!]',
    coloneqq: ':=',
    upalpha: '\\alpha',
    upbeta: '\\beta',
    upgamma: '\\gamma'
  };

  function revealConfig() {
    var macros = assign({}, PREAMBLE_MACROS, SHARED.macros, options.macros);

    var plugins = [];
    ['RevealMarkdown', 'RevealHighlight', 'RevealNotes', 'RevealZoom', 'RevealSearch']
      .forEach(function (name) { if (window[name]) plugins.push(window[name]); });
    if (window.RevealMath) plugins.push(window.RevealMath.MathJax3);

    var base = {
      width: 1280,
      height: 720,
      margin: 0.0,
      minScale: 0.2,
      maxScale: 2.0,
      hash: true,
      history: false,
      transition: 'fade',
      transitionSpeed: 'fast',
      backgroundTransition: 'none',
      // The number is drawn into the footer by buildFooters(), so that it sits
      // on the footer's baseline and survives the PDF export; reveal's own
      // element is positioned against the viewport and would not line up.
      slideNumber: false,
      controls: true,
      controlsLayout: 'edges',
      progress: true,
      center: false,
      pdfSeparateFragments: false,
      plugins: plugins,
      mathjax3: {
        mathjax: asset('lib/mathjax/tex-svg-full.js'),
        loader: { load: ['[tex]/ams', '[tex]/boldsymbol'] },
        tex: {
          packages: { '[+]': ['ams', 'boldsymbol'] },
          inlineMath: [['\\(', '\\)']],
          displayMath: [['\\[', '\\]'], ['$$', '$$']],
          macros: macros
        },
        options: {
          skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
          renderActions: { addMenu: [] }        // no right-click MathJax menu
        },
        svg: { fontCache: 'global' }
      }
    };

    var merged = assign({}, base, options.reveal);
    // reveal's own merge is shallow, so nested blocks the caller touched are
    // merged here instead of being replaced wholesale.
    if (options.reveal.mathjax3) merged.mathjax3 = assign({}, base.mathjax3, options.reveal.mathjax3);
    if (options.reveal.plugins) merged.plugins = base.plugins.concat(options.reveal.plugins);
    return merged;
  }

  function init(userOptions) {
    options = assign({}, DEFAULTS, userOptions || {});
    options.includeSymbols = options.includeSymbols || [];
    options.includeReferences = options.includeReferences || [];

    if (!window.TUD_SHARED) {
      console.warn('[tud-slides] shared_data.js was not loaded — no macros, ' +
        'no nomenclature, no bibliography. Run S00_main/build/sync_shared.py.');
    }

    // Order matters: citations and symbols are read from the authored slides
    // before the generated slides are appended, and everything is in the DOM
    // before Reveal (and with it MathJax) starts.
    applySymbolOverrides();
    markCitationsInText(document.querySelector('.reveal .slides'));
    collectSymbols();
    numberCitations();
    fillBackMatter();
    buildTitleSlide();
    buildSectionSlides();
    buildFooters();

    return Reveal.initialize(revealConfig());
  }

  return {
    init: init,
    shared: SHARED,
    // Exposed for a deck that wants to reason about its own back matter.
    citations: function () { return citationOrder.slice(); },
    symbols: function () { return usedSymbols.slice(); }
  };
})();
