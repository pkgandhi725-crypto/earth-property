/* ==========================================================
   price-filter-integration.js — Earth Property (TEP)
   Wires the PriceFilter panel (price-filter.js) into index.html's
   existing client-side filter/search logic.

   HOW TO USE:
   1. Make sure price-filter.js is included BEFORE this file.
   2. Include this file with a normal <script> tag, placed
      AFTER index.html's main inline <script> block (i.e. right
      before </body>). It safely re-defines applyFilterAndSearch()
      with price filtering added — no need to edit the big
      existing script by hand.
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

function openPriceFilterPanel() {
    const purpose = mapActiveFilterToPurpose();
    PriceFilter.open(purpose, function (range) {
        activePriceRange = range; // null if user tapped "Clear Selection"
        updatePriceButtonUI();
        trackEvent('price_filter_apply', {
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

// ---------- Full re-definition of applyFilterAndSearch (original + price filter) ----------
// NOTE: property price is always stored in the `price` field regardless of
// purpose (add-property.html sets priceValue -> price for every case,
// including RentSell where price = sellPrice). So filtering on `a.price`
// matches exactly what's shown on each card.
function applyFilterAndSearch() {
    const val = document.getElementById('searchInput').value.trim();
    const valLower = val.toLowerCase();

    let filtered = [...allAds];

    if (activeFilter !== 'all') {
        filtered = filtered.filter(a => {
            const p = (a.purpose || '').toLowerCase();
            if (activeFilter === 'buy') return p === 'sell';
            if (activeFilter === 'rent') return p === 'rent';
            if (activeFilter === 'rentsell') return p === 'rentsell';
            if (activeFilter === 'plot') return p === 'plot';
            if (activeFilter === 'commercial') return p === 'commercial';
            if (activeFilter === 'pg') return p === 'pg' || p === 'pg/hostel';
            return true;
        });
    }

    filtered = applyPriceRangeFilter(filtered);

    if (!val) {
        if (activeSort === 'nearest' && userLocation) {
            filtered = sortByProximity(filtered);
        } else {
            filtered = filtered.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        }
        displayedAds = filtered;
        renderAds(displayedAds);
        document.getElementById('loadMoreContainer').style.display = hasMoreAds ? 'block' : 'none';
        return;
    }

    if (val.length < 2) {
        filtered = filtered.filter(a =>
            (a.location || '').toLowerCase().includes(valLower) ||
            (a.title || '').toLowerCase().includes(valLower) ||
            (a.country || '').toLowerCase().includes(valLower)
        );
        displayedAds = filtered;
        renderAds(displayedAds);
        document.getElementById('loadMoreContainer').style.display = 'none';
        return;
    }

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

        if (activeFilter !== 'all') {
            results = results.filter(a => {
                const p = (a.purpose || '').toLowerCase();
                if (activeFilter === 'buy') return p === 'sell';
                if (activeFilter === 'rent') return p === 'rent';
                if (activeFilter === 'rentsell') return p === 'rentsell';
                if (activeFilter === 'plot') return p === 'plot';
                if (activeFilter === 'commercial') return p === 'commercial';
                if (activeFilter === 'pg') return p === 'pg' || p === 'pg/hostel';
                return true;
            });
        }

        results = applyPriceRangeFilter(results);

        if (activeSort === 'nearest' && userLocation) {
            results = sortByProximity(results);
        } else {
            results = results.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        }

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
        displayedAds = applyPriceRangeFilter(fallback);
        renderAds(displayedAds);
    });
}

