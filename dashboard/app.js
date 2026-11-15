// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/
// by main.ts) and renders the ranked board, a filterable table, a
// per-protocol detail view with the model's own inputs and the protocol's
// farm plan, and the live-token set kept apart at the market's own value.
// No network: every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;
  app.setAttribute('aria-busy', 'false');

  var state = {
    q: '',
    category: 'all',
    chain: 'all',
    tab: 'pre-token', // 'pre-token' | 'watchlist' | 'live'
    sort: 'implied',
    dir: -1,
    page: 0,
    selected: null,
  };
  var PAGE_SIZE = 25;

  var usd0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd0.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return 'x' + n.toFixed(2);
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + (Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    var extra = Math.max(0, Math.min((row.chains || []).length - 1, m.breadth_max_chains));
    var breadth = 1 + m.breadth_step * extra;
    return Math.max(1, Math.round(row.tvl_usd * row.category_multiple * growthMult * maturity * breadth));
  }

  // The watchlist is the snapshot's own list: a row is on it when its slug
  // is one of the watchlist's, which main.ts marks on the data it writes.
  var WATCH = {};
  (DATA.watchlist_slugs || []).forEach(function (s) { WATCH[s] = true; });

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { (r.chains || []).forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.tab === 'watchlist' && !WATCH[r.slug]) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (q && (r.name.toLowerCase().indexOf(q) < 0 && r.slug.toLowerCase().indexOf(q) < 0)) return false;
      return true;
    });
    var key = state.sort;
    var dir = state.dir;
    rows.sort(function (a, b) {
      var av, bv;
      if (key === 'implied') { av = a.implied_value_usd; bv = b.implied_value_usd; }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? -1 : a.age_days; bv = b.age_days === null ? -1 : b.age_days; }
      else { av = a.rank; bv = b.rank; }
      if (av !== bv) return (av < bv ? -1 : 1) * dir;
      return a.slug < b.slug ? -1 : 1;
    });
    return rows;
  }

  function changeCell(v) {
    if (v === null || v === undefined) return '<span class="flat">n/a</span>';
    var cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
    return '<span class="' + cls + '">' + fmtPct(v) + '</span>';
  }

  function boardTable(rows, total) {
    var pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = rows.slice(state.page * PAGE_SIZE, state.page * PAGE_SIZE + PAGE_SIZE);
    var head = '<thead><tr>' +
      '<th class="num">Rank</th><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num"><button data-sort="tvl">TVL</button></th>' +
      '<th class="num"><button data-sort="growth">7d</button></th>' +
      '<th class="num"><button data-sort="age">Age</button></th>' +
      '<th class="num"><button data-sort="implied">Implied value</button></th></tr></thead>';
    var body = slice.map(function (r) {
      var checked = impliedOf(r) === r.implied_value_usd;
      return '<tr data-slug="' + esc(r.slug) + '" class="' + (state.selected === r.slug ? 'sel' : '') + '">' +
        '<td class="num rank">#' + r.rank + '</td>' +
        '<td><div class="name">' + esc(r.name) + '</div><div class="sub">' + esc(r.slug) +
        (WATCH[r.slug] ? ' <span class="badge watch">Watchlist</span>' : '') +
        (checked ? '' : ' <span class="badge">recheck</span>') + '</div></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num">' + changeCell(r.change_7d) + '</td>' +
        '<td class="num">' + fmtAge(r.age_days) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.implied_value_usd) + '</b></td></tr>';
    }).join('');
    if (!slice.length) body = '<tr><td colspan="8"><div class="empty">No protocols match this filter. Clear the search or pick another category.</div></td></tr>';
    var pager = '<div class="pager"><button data-page="-1"' + (state.page === 0 ? ' disabled' : '') + '>← Previous</button>' +
      '<span>Page ' + (state.page + 1) + ' of ' + pages + ' · ' + rows.length + ' of ' + total + ' protocols</span>' +
      '<button data-page="1"' + (state.page >= pages - 1 ? ' disabled' : '') + '>Next →</button></div>';
    return '<div class="tablewrap"><table>' + head + '<tbody>' + body + '</tbody></table>' + pager + '</div>';
  }

  function liveTable() {
    var rows = DATA.live || [];
    var head = '<thead><tr><th>Protocol</th><th>Category</th><th>Chains</th>' +
      '<th class="num">TVL</th><th class="num">Market cap</th><th class="num">7d</th></tr></thead>';
    var body = rows.map(function (r) {
      return '<tr><td><div class="name">' + esc(r.name) + '</div><div class="sub">' + esc(r.slug) + '</div></td>' +
        '<td>' + esc(r.category || 'Uncategorised') + '</td>' +
        '<td>' + esc((r.chains || []).slice(0, 3).join(', ') || '—') + '</td>' +
        '<td class="num">' + fmtUsd(r.tvl_usd) + '</td>' +
        '<td class="num"><b>' + fmtUsd(r.mcap_usd) + '</b></td>' +
        '<td class="num">' + changeCell(r.change_7d) + '</td></tr>';
    }).join('');
    return '<div class="tablewrap"><table>' + head + '<tbody>' + body + '</tbody></table></div>' +
      '<p class="sub" style="margin-top:10px">These tokens already trade, so the board shows the market\u2019s own value for them — never a model\u2019s guess — and never ranks them against the pre-token board.</p>';
  }

  function detailHtml(row) {
    var m = DATA.model;
    var steps = (row.farm_steps || []).map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('');
    var multNote = row.multiple_source === 'category'
      ? 'the median market-cap / TVL of live ' + (row.category || 'Uncategorised') + ' protocols'
      : 'the global median market-cap / TVL (too few live ' + (row.category || 'Uncategorised') + ' protocols to calibrate)';
    return '<section class="detail" id="detail" aria-label="Protocol detail">' +
      '<h2>' + esc(row.name) + ' <span class="sub">#' + row.rank + ' · ' + esc(row.slug) + '</span></h2>' +
      '<p class="meta">' + esc(row.category || 'Uncategorised') + ' · ' + esc((row.chains || []).join(', ') || 'no chain listed') +
      ' · TVL ' + fmtUsd(row.tvl_usd) + ' · 7d ' + fmtPct(row.change_7d) + ' · tracked since ' + esc(row.listed_at || 'unknown') +
      ' (' + fmtAge(row.age_days) + ') · records no token.</p>' +
      '<h3>Implied value — ' + fmtUsd(row.implied_value_usd) + '</h3>' +
      '<div class="modelgrid">' +
      '<div class="mcell"><div class="v">' + fmtMult(row.category_multiple) + '</div><div class="k">Category multiple</div><div class="f">' + esc(multNote) + '</div></div>' +
      '<div class="mcell"><div class="v">' + fmtMult(row.growth_multiplier) + '</div><div class="k">Growth multiplier</div><div class="f">7d ' + fmtPct(row.change_7d) + ', weight ' + m.growth_weight + '</div></div>' +
      '<div class="mcell"><div class="v">' + fmtMult(row.maturity_multiplier) + '</div><div class="k">Maturity multiplier</div><div class="f">' + fmtAge(row.age_days) + ' old, floor ' + m.maturity_floor + '</div></div>' +
      '<div class="mcell"><div class="v">' + fmtMult(row.breadth_multiplier) + '</div><div class="k">Chain breadth</div><div class="f">' + (row.chains || []).length + ' chain' + ((row.chains || []).length === 1 ? '' : 's') + '</div></div>' +
      '</div>' +
      '<div class="formula">implied = TVL × ' + row.category_multiple.toFixed(2) + ' × ' + row.growth_multiplier.toFixed(2) + ' × ' + row.maturity_multiplier.toFixed(2) + ' × ' + row.breadth_multiplier.toFixed(2) + ' = ' + fmtUsd(row.implied_value_usd) + '</div>' +
      '<h3>How to farm it — six steps, each with its cost and time</h3>' +
      '<ol class="steps">' + steps + '</ol>' +
      '<p class="warn">This board says the protocol <b>records</b> no token — never that it has none. A protocol on this list may still have a token its DefiLlama record does not carry, and no implied value here predicts whether or when a token is issued.</p>' +
      '</section>';
  }

  function render() {
    var top = DATA.rows[0];
    var watchRows = DATA.rows.filter(function (r) { return WATCH[r.slug]; }).length;
    var medianImplied = DATA.rows.length ? DATA.rows[Math.floor(DATA.rows.length / 2)].implied_value_usd : 0;
    var header = '<header class="hero">' +
      '<p class="eyebrow">Token launch radar · snapshot ' + esc(DATA.as_of) + '</p>' +
      '<h1>Protocols with no token yet, <span class="accent">ranked by what one would be worth</span></h1>' +
      '<p class="lede">Every protocol below <b>records no token</b> in DefiLlama\u2019s snapshot of ' + esc(DATA.as_of) +
      '. The board ranks them by an implied value built only from that snapshot — TVL, seven-day growth, age with no token, and how many chains it runs on — calibrated against the live tokens that already trade. Each row carries a farm plan: concrete steps, with what they cost and how long they take.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="num">' + DATA.board_size + '</div><div class="lbl">protocols ranked</div></div>' +
      '<div class="stat"><div class="num lime">' + DATA.watchlist_size + '</div><div class="lbl">on the $50M watchlist</div></div>' +
      '<div class="stat"><div class="num">' + DATA.early_size + '</div><div class="lbl">early finds below the floor</div></div>' +
      '<div class="stat"><div class="num">' + fmtUsd(medianImplied) + '</div><div class="lbl">median implied value</div></div>' +
      '<div class="stat"><div class="num">' + fmtUsd(top ? top.implied_value_usd : 0) + '</div><div class="lbl">top implied value' + (top ? ' · ' + esc(top.name) : '') + '</div></div>' +
      '</div></header>';

    var catOpts = '<option value="all">All categories</option>' + categories().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.category === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var chainOpts = '<option value="all">All chains</option>' + chains().map(function (c) {
      return '<option value="' + esc(c) + '"' + (state.chain === c ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');
    var controls = '<div class="controls">' +
      '<div class="tabs" role="group" aria-label="Board view">' +
      '<button class="tab" data-tab="pre-token" aria-pressed="' + (state.tab === 'pre-token') + '">Pre-token board</button>' +
      '<button class="tab" data-tab="watchlist" aria-pressed="' + (state.tab === 'watchlist') + '">Watchlist only</button>' +
      '<button class="tab" data-tab="live" aria-pressed="' + (state.tab === 'live') + '">Live tokens</button>' +
      '</div>' +
      '<input type="search" id="q" placeholder="Search name or slug…" value="' + esc(state.q) + '" aria-label="Search protocols">' +
      '<select id="cat" aria-label="Filter by category">' + catOpts + '</select>' +
      '<select id="chain" aria-label="Filter by chain">' + chainOpts + '</select>' +
      '<span class="count">' + (state.tab === 'live' ? DATA.live_size + ' live tokens' : watchRows + ' watchlist · ' + DATA.board_size + ' ranked') + '</span>' +
      '</div>';

    var main;
    if (state.tab === 'live') {
      main = liveTable();
    } else {
      main = boardTable(filteredRows(), DATA.board_size);
    }
    var selected = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
    var detail = selected ? detailHtml(selected) : '';

    var m = DATA.model;
    var calib = (DATA.calibration || []).filter(function (c) { return c.source === 'category'; }).slice(0, 12).map(function (c) {
      return '<div class="cal"><div class="c">' + esc(c.category) + '</div><div class="m">' + fmtMult(c.multiple) + '</div><div class="s">' + c.samples + ' live protocols · median market-cap / TVL</div></div>';
    }).join('');
    var modelSection = '<section class="block"><h2>How the value is built</h2>' +
      '<p><b>implied = TVL × category multiple × growth × maturity × breadth.</b> The category multiple is the median market-cap / TVL of that category\u2019s protocols that already trade (global median ' + fmtMult(DATA.global_multiple) + ' where a category has fewer than ' + m.min_category_samples + ' live samples). Growth is the seven-day TVL change, clamped to ' + m.growth_floor + '% … +' + m.growth_cap + '%, weighted ' + m.growth_weight + '. Maturity rises from ' + m.maturity_floor + ' to 1.0 over ' + m.maturity_days + ' days with no token. Breadth adds ' + (m.breadth_step * 100) + '% per extra chain, up to ' + m.breadth_max_chains + '. No name is ever special-cased: the same function scores every row, and the page recomputes each row\u2019s number from the snapshot figures.</p>' +
      '<div class="calib">' + calib + '</div></section>';

    var footer = '<footer><p>Data: DefiLlama snapshot of ' + esc(DATA.as_of) + ' (' + esc(DATA.source) + '). Model ' + esc(DATA.model_version) + '.</p>' +
      '<p>The board is a model\u2019s claim, not a prediction: it does not say whether or when any protocol issues a token, and an implied value is not a price. Farm steps are a starting point — verify every address and link on the protocol\u2019s own pages before you send funds.</p></footer>';

    app.innerHTML = '<div class="wrap">' + header + controls + main + detail + modelSection + footer + '</div>';
    bind();
  }

  function bind() {
    var q = document.getElementById('q');
    if (q) q.addEventListener('input', function () { state.q = q.value; state.page = 0; render(); var nq = document.getElementById('q'); if (nq) { nq.focus(); nq.setSelectionRange(nq.value.length, nq.value.length); } });
    var cat = document.getElementById('cat');
    if (cat) cat.addEventListener('change', function () { state.category = cat.value; state.page = 0; render(); });
    var chain = document.getElementById('chain');
    if (chain) chain.addEventListener('change', function () { state.chain = chain.value; state.page = 0; render(); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (b) {
      b.addEventListener('click', function () { state.tab = b.getAttribute('data-tab'); state.page = 0; state.selected = null; render(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-sort]'), function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'implied' || key === 'tvl' ? -1 : 1; }
        state.page = 0;
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-page]'), function (b) {
      b.addEventListener('click', function () {
        state.page += parseInt(b.getAttribute('data-page'), 10);
        render();
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('tbody tr[data-slug]'), function (tr) {
      tr.addEventListener('click', function () {
        state.selected = tr.getAttribute('data-slug');
        render();
        var d = document.getElementById('detail');
        if (d) d.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  render();
})();
