
/* ==========================================================
   price-filter-integration.js — Earth Property (TEP)
   Wires the PriceFilter panel (price-filter.js) into index.html's
   existing client-side filter/search logic.

   BEHAVIOUR: tapping any purpose button (Buy/Rent/Rent+Sell/Plot/
   Commercial/PG) automatically opens the price-range panel for
   that category — no separate "Price" button needed. Tapping
   "All" clears both the purpose filter and the price filter.

   HOW TO USE:
   1. Make sure price-filter.js is included BEFORE this file.
   2. Include this file with a normal <script> tag, placed
      AFTER index.html's main inline <script> block (i.e. right
      before </body>). It safely re-defines setFilter() and
      applyFilterAndSearch() with price filtering added — no
      need to edit the big existing script by hand.
   ========================================================== */

let activePriceRange = null; // {min, max} or null

// Maps the active purpose-filter button to a PriceFilter category
function mapActiveFilterToPurpose() {
    switch (activeFilter) {
        case 'rent': return 'Rent';
        case 'pg': return 'PG';
        case 'commercial': return 'CommercialSell'; // saleLike presets
        case 'plot': return 'Plot';
        case 'buy': return 'Sell';
        case 'rentsell': return 'RentSell';
        default: return 'Sell'; // 'all' -> default to saleLike presets
    }
}

// ---------- Re-definition of setFilter (original + auto price panel) ----------
// Tapping a purpose button shows purpose-filtered results immediately,
// then opens the matching price-range panel so the person can narrow further.
function setFilter(type) {
    activeFilter = type;
    ['all', 'buy', 'rent', 'rentsell', 'plot', 'commercial', 'pg'].forEach(f => {
        const b = document.getElementById('filter-' + f);
        if (!b) return;
        if (f === type) b.classList.add('active-filter'); else b.classList.remove('active-filter');
    });
    trackEvent('filter_click', { filter_type: type });

    if (type === 'all') {
        activePriceRange = null; // reset price filter too when going back to All
        applyFilterAndSearch();
        return;
    }

    // Show purpose-only results right away (don't make user wait on the panel)
    applyFilterAndSearch();

    // Then open the price range panel for this category
    const purpose = mapActiveFilterToPurpose();
    PriceFilter.open(purpose, function (range) {
        activePriceRange = range; // null if user tapped "Clear Selection"
        trackEvent('price_filter_apply', {
            filter_type: type,
            min: range ? range.min : null,
            max: range ? (range.max ?? 'open') : null
        });
        applyFilterAndSearch();
    });
}

function updatePriceButtonUI() {
    const btn = document.getElementById('filter-price');
    if (!btn) return;
    if (activePriceRange) {
        btn.classList.add('active-filter');
    } else {
        btn.classList.remove('active-filter');
    }
}

// Applies the selected price range to any array of property docs
function applyPriceRangeFilter(arr) {
    if (!activePriceRange) return arr;
    return arr.filter(a => {
        const price = Number(a.price || 0);
        if (typeof activePriceRange.min === 'number' && price < activePriceRange.min) return false;
        if (typeof activePriceRange.max === 'number' && activePriceRange.max !== null && price > activePriceRange.max) return false;
        return true;
    });
}

// ---------- City search (paged, same query shape as the city page) ----------
let citySearch = null;
const SEARCH_PAGE_SIZE = 20;
const SEARCH_CITY_ALIASES = {
    gurgaon: 'gurugram', bombay: 'mumbai', bangalore: 'bengaluru', calcutta: 'kolkata',
    madras: 'chennai', poona: 'pune', allahabad: 'prayagraj', baroda: 'vadodara',
    trivandrum: 'thiruvananthapuram', cochin: 'kochi', pondicherry: 'puducherry',
    mysore: 'mysuru', mangalore: 'mangaluru', banaras: 'varanasi', benares: 'varanasi'
};

function findSearchCity(val) {
    let v = String(val || '').trim().toLowerCase();
    if (v.length < 3) return null;
    v = SEARCH_CITY_ALIASES[v] || v;
    const exact = allCitiesCache.find(c => c.name.toLowerCase() === v);
    if (exact) return exact;
    const starts = allCitiesCache.filter(c => c.name.toLowerCase().startsWith(v));
    return starts.length === 1 ? starts[0] : null;
}

function matchesPurpose(a) {
    if (activeFilter === 'all') return true;
    const p = (a.purpose || '').toLowerCase();
    if (activeFilter === 'buy') return p === 'sell';
    if (activeFilter === 'rent') return p === 'rent';
    if (activeFilter === 'rentsell') return p === 'rentsell';
    if (activeFilter === 'plot') return p === 'plot';
    if (activeFilter === 'commercial') return p.startsWith('commercial');
    if (activeFilter === 'pg') return p === 'pg' || p === 'pg/hostel';
    return true;
}

function renderCitySearch() {
    if (!citySearch) return;
    let list = applyPriceRangeFilter(citySearch.items.filter(matchesPurpose));
    displayedAds = list;
    isDataLoaded = true;
    renderAds(list);
    document.getElementById('loadMoreContainer').style.display = citySearch.done ? 'none' : 'block';
}

async function loadCitySearchPage(isMore) {
    const cs = citySearch;
    if (!cs || cs.loading) return;
    cs.loading = true;
    const btn = document.getElementById('loadMoreBtn');
    if (isMore && btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="loading-spinner"></span>';
    }

    try {
        const n = cs.city.name;
        let q = db.collection('properties')
            .where('city', 'in', [n, n.toUpperCase(), n.toLowerCase()])
            .where('isExpired', '==', false)
            .orderBy('createdAt', 'desc')
            .limit(SEARCH_PAGE_SIZE);

        if (cs.last) q = q.startAfter(cs.last);

        const snap = await q.get();
        if (citySearch !== cs) return;

        const now = new Date();
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => {
            if (a.status && a.status !== 'active') return false;
            if (a.expiryDate && a.expiryDate.toDate() < now) return false;
            return true;
        });

        if (snap.docs.length) cs.last = snap.docs[snap.docs.length - 1];
        cs.done = snap.docs.length < SEARCH_PAGE_SIZE;
        cs.items = cs.items.concat(items);

        renderCitySearch();
        trackEvent('search', { search_term: n });

    } catch (err) {
        console.error('City search error:', err);
        if (citySearch === cs) {
            isDataLoaded = true;
            document.getElementById('propertyList').innerHTML =
                '<center style="margin-top:50px;color:#d32f2f;padding:20px;">❌ Search failed.<br><small>' +
                err.message +
                '</small></center>';
        }
    } finally {
        cs.loading = false;
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span id="loadMoreText">' + (getT().loadMore || 'Load More') + '</span>';
        }
    }
}

// ---------- Full re-definition of applyFilterAndSearch ----------
function applyFilterAndSearch() {
    const val = document.getElementById('searchInput').value.trim();
    const valLower = val.toLowerCase();
    const nearbyEnd = document.getElementById('nearbyEnd');

    // City banner
    const banner = document.getElementById('cityMatchBanner');
    const matchedCity = val ? findSearchCity(val) : null;

    if (matchedCity) {
        document.getElementById('cityMatchName').innerText = matchedCity.name;
        banner.style.display = 'flex';
        banner.onclick = () => {
            trackEvent('city_banner_click', {
                city: matchedCity.name,
                slug: matchedCity.slug
            });
            location.href = 'city.html?name=' + encodeURIComponent(normalizeSlug(matchedCity.slug));
        };
    } else {
        banner.style.display = 'none';
    }

    // 1) Known city -> paged city query (20 per load)
    if (matchedCity) {
        nearbyEnd.style.display = 'none';
        document.getElementById('nearbyNote').style.display = 'none';

        if (!citySearch || citySearch.city.slug !== matchedCity.slug) {
            citySearch = {
                city: matchedCity,
                items: [],
                last: null,
                done: false,
                loading: false
            };
            showListSpinner('Searching ' + matchedCity.name + '...');
            loadCitySearchPage(false);
        } else {
            renderCitySearch();
        }
        return;
    }

    citySearch = null;

    let filtered = applyPriceRangeFilter(allAds.filter(matchesPurpose));

    // 2) No search text -> normal feed
    if (!val) {
        if (activeSort === 'nearest' && userLocation) {
            filtered = sortByProximity(filtered);
        } else {
            filtered = filtered.sort((a, b) =>
                (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
            );
        }

        displayedAds = filtered;

        if (allAds.length === 0 && activeSort === 'nearest' && !hasMoreAds) {
            showNearbyEmpty(true);
        } else {
            renderAds(displayedAds);
        }

        document.getElementById('loadMoreContainer').style.display = hasMoreAds ? 'block' : 'none';
        nearbyEnd.style.display =
            (!hasMoreAds && allAds.length > 0 && activeSort === 'nearest') ? 'block' : 'none';
        updateNearbyNote();
        return;
    }

    nearbyEnd.style.display = 'none';

    // 3) Short text -> only filter what is already loaded (no Firestore reads)
    if (val.length < 3) {
        filtered = filtered.filter(a =>
            (a.location || '').toLowerCase().includes(valLower) ||
            (a.title || '').toLowerCase().includes(valLower) ||
            (a.city || '').toLowerCase().includes(valLower) ||
            (a.country || '').toLowerCase().includes(valLower)
        );

        displayedAds = filtered;
        renderAds(displayedAds);
        document.getElementById('loadMoreContainer').style.display = 'none';
        return;
    }

    // 4) Area / country / title text -> prefix search
    document.getElementById('propertyList').innerHTML = `
        <div style="text-align:center;padding:60px 20px;">
            <div class="loading-spinner" style="border-top-color:#2e7d32;border-color:rgba(46,125,50,0.2);width:36px;height:36px;margin:0 auto 15px;"></div>
            <div style="font-size:14px;color:#888;font-weight:600;">Searching...</div>
        </div>`;
    document.getElementById('loadMoreContainer').style.display = 'none';

    const valCapitalized = val.charAt(0).toUpperCase() + val.slice(1).toLowerCase();
    const valUpper = val.toUpperCase();

    const makeQuery = (field, startVal) =>
        db.collection('properties')
            .where('status', '==', 'active')
            .where(field, '>=', startVal)
            .where(field, '<=', startVal + '\uf8ff')
            .limit(50)
            .get();

    Promise.all([
        makeQuery('country', val),
        makeQuery('country', valCapitalized),
        makeQuery('country', valUpper),
        makeQuery('location', val),
        makeQuery('location', valCapitalized),
        makeQuery('location', valUpper),
        makeQuery('title', val),
        makeQuery('title', valCapitalized),
    ]).then(snapshots => {
        const seen = new Set();
        let results = [];

        allAds.forEach(a => {
            if (
                (a.location || '').toLowerCase().includes(valLower) ||
                (a.title || '').toLowerCase().includes(valLower) ||
                (a.city || '').toLowerCase().includes(valLower) ||
                (a.country || '').toLowerCase().includes(valLower) ||
                (a.description || '').toLowerCase().includes(valLower)
            ) {
                if (!seen.has(a.id)) {
                    seen.add(a.id);
                    results.push(a);
                }
            }
        });

        snapshots.forEach(snap => {
            snap.docs.forEach(doc => {
                if (!seen.has(doc.id)) {
                    const data = { id: doc.id, ...doc.data() };
                    if (data.isExpired === true) return;
                    if (data.expiryDate && data.expiryDate.toDate() < new Date()) return;
                    seen.add(doc.id);
                    results.push(data);
                }
            });
        });

        results = applyPriceRangeFilter(results.filter(matchesPurpose));
        results = results.sort((a, b) =>
            (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
        );

        displayedAds = results;
        renderAds(displayedAds);

        if (val.length >= 3) trackEvent('search', { search_term: val });

    }).catch(err => {
        console.error('Search error:', err);
        const fallback = allAds.filter(a =>
            (a.location || '').toLowerCase().includes(valLower) ||
            (a.title || '').toLowerCase().includes(valLower) ||
            (a.country || '').toLowerCase().includes(valLower)
        );

        displayedAds = applyPriceRangeFilter(fallback.filter(matchesPurpose));
        renderAds(displayedAds);
    });
}
