import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getMessaging, getToken, deleteToken, onMessage } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging.js";


import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, query, where, onSnapshot, orderBy, serverTimestamp, deleteDoc, doc, getDocs, updateDoc, arrayUnion, arrayRemove, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";




const firebaseConfig = {
    apiKey: "AIzaSyBCcZZ-IvQY7MhSosS69ImZpJCwHMyVziA",
    authDomain: "maestro-868c5.firebaseapp.com",
    projectId: "maestro-868c5",
    storageBucket: "maestro-868c5.firebasestorage.app",
    messagingSenderId: "584400657420", appId: "1:584400657420:web:99361ef62ff0a40552e229",
    measurementId: "G-PMZ9MZH2L2"
};

const LAUNCH_DATE_STR = '2026-01-07';
const LAUNCH_DATE = new Date(LAUNCH_DATE_STR); LAUNCH_DATE.setHours(0, 0, 0, 0);

let app, auth, db, provider, messaging;
try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    messaging = getMessaging(app);
    provider = new GoogleAuthProvider();

} catch (e) { console.error("Firebase Init Error:", e); }



// --- RESET HISTORY LOGIC ---
window.resetHistory = async () => {
    if (!confirm("⚠️ ATTENTION : Cela va effacer tout votre historique et vos statistiques (sauf aujourd'hui).\\n\\nÊtes-vous sûr ?")) return;

    if (!currentUser) return alert("Vous devez être connecté.");

    try {
        const q = query(collection(db, "reviews"), where("userId", "==", currentUser.uid));
        const snapshot = await getDocs(q);
        // Delete everything BEFORE Launch Date (Test Data)
        let count = 0;

        const promises = [];
        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            let revDate;
            if (data.timestamp && data.timestamp.toDate) {
                revDate = data.timestamp.toDate();
            } else if (data.date) {
                revDate = new Date(data.date);
            } else {
                return; // Skip invalid
            }
            revDate.setHours(0, 0, 0, 0);

            if (revDate < LAUNCH_DATE) {
                promises.push(deleteDoc(docSnap.ref));
                count++;
            }
        });

        await Promise.all(promises);

        // Reset Streak to 1
        await updateDoc(doc(db, "users", currentUser.uid), {
            currentStreak: 1,
            maxStreak: 1,
            lastVisit: serverTimestamp() // Reset last visit to ensure streak starts fresh
        });

        alert(`♻️ Terminé ! ${count} anciens avis supprimés. Vos stats sont nettoyées.`);
        window.location.reload();

    } catch (e) {
        console.error(e);
        alert("Erreur lors du nettoyage : " + e.message);
    }
};

let currentUser = null, currentRating = 0, currentAlbumId = "", viewDate = new Date();

window.switchTab = (t) => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach(p => p.classList.remove('active'));

    // Find the correct button index: 0=Reviews, 1=Chat, 2=Archives
    // Dynamic selection based on onclick attribute to support HTML reordering
    const btn = document.querySelector(`.tab-btn[onclick="switchTab('${t}')"]`);
    if (btn) btn.classList.add('active');

    if (t === 'chat') {
        document.getElementById('view-chat').classList.add('active');
        loadChat();
    } else if (t === 'reviews') {
        document.getElementById('view-reviews').classList.add('active');
    } else {
        document.getElementById('view-calendar').classList.add('active');
        renderCalendar();
    }
};
window.backToToday = () => { loadAlbumByDate(new Date(), false); window.switchTab('reviews'); };

async function initApp() {
    if (!window.allAlbums) { alert("Erreur chargement data.js"); return; }

    const starContainer = document.getElementById('starInput');
    for (let i = 1; i <= 5; i++) {
        const d = document.createElement('div');
        d.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;

        // Half-star detection
        d.onmousemove = (e) => {
            const rect = d.getBoundingClientRect();
            const isHalf = (e.clientX - rect.left) < (rect.width / 2);
            updateStars(isHalf ? i - 0.5 : i);
        };

        d.onclick = (e) => {
            // Mobile (Touch): Toggle Full <-> Half
            if (window.matchMedia("(pointer: coarse)").matches) {
                if (currentRating === i) currentRating = i - 0.5;
                else currentRating = i;
            }
            // Desktop (Mouse): Precise Left/Right Click
            else {
                const rect = d.getBoundingClientRect();
                const isHalf = (e.clientX - rect.left) < (rect.width / 2);
                currentRating = isHalf ? i - 0.5 : i;
            }
            updateStars(currentRating);
            document.getElementById('currentRatingDisplay').textContent = currentRating;
        };
        d.onmouseleave = () => updateStars(currentRating); // Reset on leave particular star
        starContainer.appendChild(d);
    }
    starContainer.onmouseleave = () => updateStars(currentRating);

    // Check Persistence
    // Check Persistence - REMOVED TO FORCE TODAY'S ALBUM
    // const lastDate = localStorage.getItem('last_view_date');
    // if (lastDate && !isNaN(new Date(lastDate).getTime())) {
    //     loadAlbumByDate(new Date(lastDate), true);
    // } else {
    loadAlbumByDate(new Date(), false);
    // }
}

function updateStars(v) {
    const stars = document.getElementById('starInput').children;
    for (let i = 0; i < 5; i++) {
        const svg = stars[i].querySelector('svg');
        if (v >= i + 1) {
            svg.style.fill = "var(--accent)"; // Full
        } else if (v > i) {
            svg.style.fill = "url(#halfGrad)"; // Half
        } else {
            svg.style.fill = "#444"; // Empty
        }
    }
}

async function loadAlbumByDate(date, isArchive_unused) {
    const d = new Date(date); d.setHours(0, 0, 0, 0);
    window.currentViewedDate = new Date(d); // Store for calendar highlighting
    localStorage.setItem('last_view_date', d.toISOString()); // PERSISTENCE
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const isPast = d.getTime() < today.getTime();

    const diffDays = Math.floor((d - LAUNCH_DATE) / (1000 * 60 * 60 * 24));
    const index = diffDays < 0 ? 0 : diffDays % window.allAlbums.length;
    const album = window.allAlbums[index];
    window.currentAlbumObj = album;

    // Gestion du Badge
    const badge = document.getElementById('archiveBadge');
    badge.classList.remove('hidden');
    if (isPast) {
        badge.textContent = `ARCHIVE ${d.getDate()}/${d.getMonth() + 1}`;
        badge.className = "tag-pill archive";
    } else {
        badge.textContent = "ALBUM DU JOUR";
        badge.className = "tag-pill today";
    }

    currentAlbumId = `${album.artist}-${album.title}`.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    const titleEl = document.getElementById('title');
    const artistEl = document.getElementById('artist');
    const yearEl = document.getElementById('meta-year');
    const genreEl = document.getElementById('meta-genre');

    titleEl.textContent = album.title;
    artistEl.textContent = album.artist;
    yearEl.textContent = album.year || "----";
    genreEl.textContent = album.genre || "----";

    // Remove Skeletons
    [titleEl, artistEl, yearEl, genreEl].forEach(el => {
        el.classList.remove('skeleton', 'skeleton-text');
        el.style.width = '';
        el.style.height = '';
    });

    // Trigger Vinyl Animation
    const vinylDisc = document.querySelector('.vinyl-disc');
    vinylDisc.classList.remove('vinyl-enter');
    void vinylDisc.offsetWidth; // Trigger reflow
    vinylDisc.classList.add('vinyl-enter');

    const img = document.getElementById('albumImg');
    img.classList.remove('loaded');

    const setCover = (url) => {
        img.src = url;
        document.getElementById('bg-layer').style.backgroundImage = `url('${url}')`;
        img.onload = () => img.classList.add('loaded');
    };

    const cached = localStorage.getItem(`cover_${currentAlbumId}`);

    if (album.coverUrl) {
        setCover(album.coverUrl);
    } else if (cached) { setCover(cached); }
    else {
        try {
            // Utilisation de JSONP pour contourner le CORS
            const data = await jsonpFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(album.artist + " " + album.title)}&entity=album&limit=1`);

            if (data.results[0]) {
                const url = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                localStorage.setItem(`cover_${currentAlbumId}`, url);
                setCover(url);
                // Si l'API renvoie des infos plus précises, on met à jour
                /* Optionnel : décommenter si tu préfères les genres iTunes
                const apiYear = data.results[0].releaseDate.substring(0,4);
                const apiGenre = data.results[0].primaryGenreName;
                document.getElementById('meta-year').textContent = apiYear;
                document.getElementById('meta-genre').textContent = apiGenre; 
                */
            } else {
                // Fallback si pas trouvé sur iTunes
                console.warn("Cover not found on iTunes for:", album.artist, album.title);
                img.src = 'images/logo.png'; // Image par défaut
            }
        } catch (e) { console.error("iTunes Only Error", e); }
    }
    loadReviews();
}

// Helper JSONP pour contourner le CORS
function jsonpFetch(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_callback_' + Math.round(100000 * Math.random());
        window[callbackName] = function (data) {
            delete window[callbackName];
            document.body.removeChild(script);
            resolve(data);
        };
        const script = document.createElement('script');
        script.src = url + (url.indexOf('?') >= 0 ? '&' : '?') + 'callback=' + callbackName;
        script.onerror = () => {
            delete window[callbackName];
            document.body.removeChild(script);
            reject(new Error('JSONP request failed'));
        };
        document.body.appendChild(script);
    });
}

// --- LOGIQUE AVIS ---
// --- LOGIQUE AVIS ---
let unsub = null;
let repliesListenerStarted = false;

function loadReviews() {
    if (unsub) unsub();

    // Initial cleanup if completely switching context, but we want to keep container for granular updates
    const list = document.getElementById('reviewsList');
    // We clear list only if we are switching albums. 
    // Ideally we check if album changed. For simplicity we clear on load.
    // Wait, if we clear, docChanges will just be "moves"? 
    // Actually docChanges is relative to the SNAPSHOT version. 
    // If it's a fresh call, we might want to clear.
    list.innerHTML = ""; // Start fresh for this album load

    // Loading indicator
    const loader = document.createElement('div');
    loader.id = 'reviews-loader';
    loader.style.cssText = 'text-align:center; padding:20px; opacity:0.5';
    loader.textContent = 'Chargement...';
    list.appendChild(loader);

    const q = query(collection(db, "reviews"), where("albumId", "==", currentAlbumId), orderBy("timestamp", "desc"));

    unsub = onSnapshot(q, (snap) => {
        // Remove loader if exists
        const l = document.getElementById('reviews-loader');
        if (l) l.remove();

        if (snap.empty && list.children.length === 0) {
            list.innerHTML = "<div class='empty-state' id='no-reviews-msg'>Aucun avis pour l'instant.</div>";
            updateMaestroScore([]);
            return;
        }

        // If we have content now, remove empty state
        const empty = document.getElementById('no-reviews-msg');
        if (empty) empty.remove();

        snap.docChanges().forEach(change => {
            const r = change.doc.data();
            const rid = change.doc.id;

            if (change.type === "added") {
                const el = createReviewElement(rid, r);
                // Insert in correct order? 
                // Firestore returns changes. For "added", if it's new (timestamp desc), it should be top.
                // But "added" also fires for all docs on first load.
                // We rely on simple append for first load (since order is correct in snap), 
                // but for new additions (real-time), we might need prepend?
                // Actually snap handles order for initial. For new real-time adds (descending), they come first.
                // Prepend if list has children?
                // Simplest strategy: Append, then let Flexbox order? No.
                // Real Strategy: "added" index is provided? 

                // Let's just use prepend for real-time consistency if it's newer than first child
                // or just standard append and rely on re-ordering?
                // Implementing specific index insertion is complex.
                // Hack: Prepend if it's a NEW review (Date > nowish?) 
                // BETTER: Just Prepend everything? No, initial load is top-to-bottom.
                // Since our query is orderBy timestamp DESC, the first docs are the newest.
                // So appendChild works for initial load.
                // For a NEW arriving doc (future), it enters as "added" at index 0?
                // `change.newIndex` gives the index.

                const refNode = list.children[change.newIndex];
                if (refNode) {
                    list.insertBefore(el, refNode);
                } else {
                    list.appendChild(el);
                }

            }
            if (change.type === "modified") {
                updateReviewElement(rid, r);
            }
            if (change.type === "removed") {
                const el = document.getElementById(`review-${rid}`);
                if (el) el.remove();
            }
        });

        // Recalculate Score from FULL snapshot data (not just changes)
        const allReviews = snap.docs.map(d => d.data());
        updateMaestroScore(allReviews);

        // Start listening to replies ONCE per album load
        if (!repliesListenerStarted) {
            listenToReplies();
            repliesListenerStarted = true;
        }
    }, (error) => {
        console.error("Error loading reviews:", error);
        document.getElementById('reviewsList').innerHTML = `<div class="empty-state" style="color:var(--danger)">Erreur chargement avis: ${error.message}</div>`;
    });
}

function createReviewElement(id, r) {
    const div = document.createElement('div');
    div.className = 'review-item';
    div.id = `review-${id}`;

    // We build internal HTML specifically
    updateReviewContent(div, id, r);
    // Check for cached replies (race condition fix)
    if (window.renderRepliesForReview) {
        window.setTimeout(() => window.renderRepliesForReview(id), 0);
    }
    return div;
}

function updateReviewElement(id, r) {
    const div = document.getElementById(`review-${id}`);
    if (!div) return; // Should not happen
    updateReviewContent(div, id, r);
}

function updateReviewContent(div, id, r) {
    const likes = r.likedBy || [];
    const isLiked = currentUser && likes.includes(currentUser.uid);
    const safeName = r.userName.replace(/'/g, "\\'");

    // Preserve replies container if it exists
    const existingReplies = div.querySelector('.replies-container');
    const existingForm = div.querySelector('.reply-input-box');

    const repliesHTML = existingReplies ? existingReplies.innerHTML : '';
    const formClass = existingForm ? existingForm.className : 'reply-input-box hidden';

    div.innerHTML = `
        <div class="review-head">
            <img src="${r.userPhoto}" class="user-avatar">
            <div class="user-name" onclick="showUserProfile('${r.userId}', '${safeName}', '${r.userPhoto}')">${r.userName.split(' ')[0]}</div>
            <span class="date">${(() => {
            if (r.timestamp) return new Date(r.timestamp.seconds * 1000).toLocaleDateString();
            if (r.date) {
                const d = new Date(r.date);
                return isNaN(d.getTime()) ? "Date inconnue" : d.toLocaleDateString();
            }
            return "À l'instant";
        })()}</span>
            ${(currentUser && r.userId === currentUser.uid) ? `<span onclick="deleteReview('${id}')" style="cursor:pointer; color:var(--danger); margin-left:10px">✕</span>` : ''}
        </div>
        
        <div class="review-stars">
            ${Array(5).fill(0).map((_, i) => {
            let fill = "#444";
            if (r.rating >= i + 1) fill = "var(--accent)";
            else if (r.rating > i) fill = "url(#halfGrad)";
            return `<svg fill="${fill}" viewBox="0 0 24 24"><path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/></svg>`;
        }).join('')}
        </div>

        ${r.favTrack ? `<div class="fav-track">💎 ${r.favTrack}</div>` : ''}
        <div class="review-text">${r.text}</div>

        <div class="review-actions">
                <button class="like-btn ${isLiked ? 'liked' : ''}" onclick="toggleLike('${id}')">
                ${isLiked ? '❤️' : '🤍'} ${likes.length || ''}
            </button>
            ${currentUser ? `<button class="reply-btn" onclick="toggleReplyForm('${id}')">Répondre</button>` : ''}
        </div>

        <!-- REPLIES CONTAINER -->
        <div id="replies-${id}" class="replies-container">${repliesHTML}</div>

        <!-- REPLY FORM -->
        <div id="reply-box-${id}" class="${formClass}">
                <input type="text" id="reply-input-${id}" placeholder="Répondre...">
                <button onclick="submitReply('${id}')">Envoyer</button>
        </div>
    `;
    // Re-attach event listeners? Logic is inline onclick, safe for this scale.
}

function updateMaestroScore(reviews) {
    const mBlock = document.getElementById('maestroBlock');
    if (reviews.length > 0) {
        let total = 0;
        reviews.forEach(r => total += r.rating);
        const avg = Math.round((total / reviews.length) * 10) / 10;

        mBlock.classList.remove('hidden');
        document.getElementById('maestroValue').textContent = avg;

        document.getElementById('maestroStars').innerHTML = Array(5).fill(0).map((_, i) => {
            const color = i < Math.round(avg) ? 'var(--accent)' : 'rgba(255,255,255,0.2)';
            return `<svg width="20" height="20" viewBox="0 0 24 24" fill="${color}">
                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"/>
            </svg>`;
        }).join('');
    } else {
        mBlock.classList.add('hidden');
    }
}

window.submitReview = async () => {
    if (!currentUser || !currentRating) return alert("Note ?");
    await addDoc(collection(db, "reviews"), {
        albumId: currentAlbumId, userId: currentUser.uid, userName: currentUser.displayName, userPhoto: currentUser.photoURL,
        rating: currentRating, text: document.getElementById('commentText').value, favTrack: document.getElementById('favTrackInput').value,
        likedBy: [], timestamp: serverTimestamp()
    });
    document.getElementById('commentText').value = ""; document.getElementById('favTrackInput').value = "";
    currentRating = 0; updateStars(0); document.getElementById('currentRatingDisplay').textContent = "0";
};

window.toggleLike = async (rid) => {
    if (!currentUser) return;
    const ref = doc(db, "reviews", rid);
    const snap = await getDoc(ref);
    if (snap.exists()) {
        const likes = snap.data().likedBy || [];
        if (likes.includes(currentUser.uid)) await updateDoc(ref, { likedBy: arrayRemove(currentUser.uid) });
        else await updateDoc(ref, { likedBy: arrayUnion(currentUser.uid) });
    }
};

// Forces clear of old SW cache if issues persist
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistrations().then(function (registrations) {
        for (let registration of registrations) { window.swRegistry = registration; }
    });
}

let reviewToDelete = null;

window.deleteReview = (id) => {
    console.log("Delete requested for", id);
    reviewToDelete = id;
    const modal = document.getElementById('confirmModal');
    if (modal) modal.classList.add('open');
    else alert("Erreur: Modal introuvable");
};

window.closeConfirmModal = () => {
    reviewToDelete = null;
    document.getElementById('confirmModal').classList.remove('open');
};

window.confirmDeleteAction = async () => {
    if (reviewToDelete) {
        // Cascade delete: delete all replies for this review first
        try {
            const q = query(collection(db, "replies"), where("reviewId", "==", reviewToDelete));
            const snap = await getDocs(q);
            const batchPromises = snap.docs.map(d => deleteDoc(d.ref));
            await Promise.all(batchPromises);
        } catch (e) { console.error(e); }

        await deleteDoc(doc(db, "reviews", reviewToDelete));
        closeConfirmModal();
    }
};

// --- PROFIL ---
window.showUserProfile = async (uid, name, photo) => {
    const m = document.getElementById('profileModal');
    document.getElementById('prof-img').src = photo || "";
    document.getElementById('prof-name').textContent = name.split(' ')[0];
    m.classList.add('open');
    const q = query(collection(db, "reviews"), where("userId", "==", uid));
    const s = await getDocs(q);
    let c = 0, sum = 0, g = {};
    s.forEach(d => {
        const r = d.data();
        let date;
        if (r.timestamp && r.timestamp.toDate) {
            date = r.timestamp.toDate();
        } else if (r.date) {
            date = new Date(r.date);
        } else {
            return; // Skip invalid data
        }

        // Check validity
        if (isNaN(date.getTime())) return;

        // DEBUG LOGS
        // console.log("Review Date:", date, "Launch Date:", LAUNCH_DATE);

        if (date < LAUNCH_DATE) return;

        c++; sum += r.rating;
        const alb = window.allAlbums.find(a => `${a.artist}-${a.title}`.replace(/[^a-z0-9]/gi, '-').toLowerCase() === r.albumId);
        if (alb) {
            const mg = alb.genre.split(',')[0].trim();
            g[mg] = (g[mg] || 0) + r.rating;
        }
    });
    document.getElementById('stat-count').textContent = c;
    document.getElementById('stat-avg').textContent = c > 0 ? (sum / c).toFixed(1) : "-";
    let top = "-", max = 0; for (const [k, v] of Object.entries(g)) { if (v > max) { max = v; top = k; } }
    document.getElementById('stat-genre').textContent = top;
};
window.closeProfile = () => document.getElementById('profileModal').classList.remove('open');
window.openMyProfile = () => {
    if (currentUser) {
        window.showUserProfile(currentUser.uid, currentUser.displayName, currentUser.photoURL);
    }
};





// --- CALENDRIER ---
window.changeMonth = (d) => {
    viewDate.setMonth(viewDate.getMonth() + d); renderCalendar();     // Notification Button State
    checkNotificationState();
};

function renderCalendar() {
    const g = document.getElementById('calendarGrid'); g.innerHTML = "";
    document.getElementById('calTitle').textContent = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(viewDate);
    const y = viewDate.getFullYear(), m = viewDate.getMonth();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);

    const firstDay = new Date(y, m, 1).getDay() || 7;
    for (let i = 1; i < firstDay; i++) g.innerHTML += `<div></div>`;

    const missingCovers = [];

    for (let d = 1; d <= daysInMonth; d++) {
        const curr = new Date(y, m, d); curr.setHours(0, 0, 0, 0);
        const cell = document.createElement('div');
        const isPreLaunch = curr < LAUNCH_DATE;
        const isFuture = curr > today;
        const isLocked = isPreLaunch || isFuture;

        let cellClass = 'day-cell';
        if (isPreLaunch) cellClass += ' locked';
        if (isFuture) cellClass += ' future';
        if (curr.getTime() === today.getTime()) cellClass += ' today';
        if (window.currentViewedDate && curr.getTime() === window.currentViewedDate.getTime()) cellClass += ' selected-date';

        cell.className = cellClass;
        let html = `<span class="day-num">${d}</span>`;
        if (!isLocked) {
            const idx = getAlbumIndexForDate(curr);
            const album = window.allAlbums[idx];
            const aid = `${album.artist}-${album.title}`.replace(/[^a-z0-9]/gi, '-').toLowerCase();

            let imgUrl = localStorage.getItem(`cover_${aid}`);
            if (!imgUrl && album.coverUrl) imgUrl = album.coverUrl;

            if (imgUrl) {
                html += `<img class="day-bg-img" src="${imgUrl}">`;
            } else {
                // Queue for fetching
                missingCovers.push({ aid, album, cell });
            }

            cell.onclick = () => {
                loadAlbumByDate(curr, true);
                window.switchTab('reviews');
                if (window.matchMedia("(max-width: 1100px)").matches) window.scrollToSlide(0);
            };
        }
        cell.innerHTML = html;
        g.appendChild(cell);
    }

    // Process Missing Covers Queue
    if (missingCovers.length > 0) processMissingCovers(missingCovers);
}

async function processMissingCovers(queue) {
    for (const item of queue) {
        if (localStorage.getItem(`cover_${item.aid}`)) continue; // Already handled?

        try {
            const data = await jsonpFetch(`https://itunes.apple.com/search?term=${encodeURIComponent(item.album.artist + " " + item.album.title)}&entity=album&limit=1`);
            if (data.results[0]) {
                const url = data.results[0].artworkUrl100.replace('100x100bb', '600x600bb');
                localStorage.setItem(`cover_${item.aid}`, url);

                // Update UI if cell is still valid
                const img = document.createElement('img');
                img.className = 'day-bg-img';
                img.src = url;
                item.cell.appendChild(img);
            }
        } catch (e) {
            console.error("Auto-fetch error (JSONP):", e);
            // Mark as failed to avoid infinite retry loop? 
            // Or better, just ignore.
        }

        // Slight delay to be nice to API
        await new Promise(r => setTimeout(r, 200));
    }
}

function getAlbumIndexForDate(date) {
    const diff = Math.floor((date - LAUNCH_DATE) / (1000 * 60 * 60 * 24));
    return diff < 0 ? 0 : diff % window.allAlbums.length;
}

// --- AUTH ---
// --- STREAK LOGIC ---
async function checkStreak(u) {
    if (!u) {
        document.getElementById('streakBadge')?.classList.add('hidden');
        return;
    }

    const userRef = doc(db, "users", u.uid);
    const snap = await getDoc(userRef);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    let streak = 0;

    if (snap.exists()) {
        const data = snap.data();
        const lastVisit = data.lastVisit?.toDate();
        if (lastVisit) lastVisit.setHours(0, 0, 0, 0);
        streak = data.currentStreak || 0;

        // RESET STREAK if last visit was before Launch OR if undefined
        if (!lastVisit || lastVisit < LAUNCH_DATE) {
            streak = 1;
            await updateDoc(userRef, { lastVisit: serverTimestamp(), currentStreak: 1 });
        } else if (today.getTime() === LAUNCH_DATE.getTime() && streak > 1) {
            streak = 1;
            await updateDoc(userRef, { currentStreak: 1 });
        } else {
            const diffTime = Math.abs(today - lastVisit);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                streak++;
                await updateDoc(userRef, { lastVisit: serverTimestamp(), currentStreak: streak });
            } else if (diffDays > 1) {
                streak = 1;
                await updateDoc(userRef, { lastVisit: serverTimestamp(), currentStreak: 1 });
            }
        }
    } else {
        // Premier jour
        streak = 1;
        await setDoc(userRef, {
            userId: u.uid,
            lastVisit: serverTimestamp(),
            currentStreak: 1,
            maxStreak: 1
        });
    }

    // UI Update
    const badge = document.getElementById('streakBadge');
    if (badge) {
        document.getElementById('streakValue').textContent = streak;
        badge.classList.remove('hidden');
    }
}

onAuthStateChanged(auth, (u) => {
    // MOCK USER FOR DEBUGGING

    currentUser = u;
    document.getElementById('authContainer').innerHTML = u
        ? `<button onclick="openMyProfile()"><img src="${u.photoURL}"> ${u.displayName.split(' ')[0]}</button>`
        : `<button onclick="signIn()">CONNEXION</button>`;
    document.getElementById('reviewForm').classList.toggle('hidden', !u);
    document.getElementById('loginPrompt').classList.toggle('hidden', !!u);
    if (currentAlbumId) loadReviews();
    checkStreak(u);
});
window.signIn = () => signInWithPopup(auth, provider);



window.openSpotify = () => {
    if (window.currentAlbumObj) {
        const query = encodeURIComponent(window.currentAlbumObj.artist + " " + window.currentAlbumObj.title);
        // Tente d'ouvrir l'application Desktop
        window.location.href = `spotify:search:${query}`;

        // (Optionnel) Fallback : Si l'app ne s'ouvre pas après 500ms, on ouvre le web
        setTimeout(() => {
            // window.open(`https://open.spotify.com/search/${query}`, '_blank');
        }, 500);
    }
};
initApp();

// --- MOBILE SLIDER LOGIC ---
window.scrollToSlide = (index) => {
    const container = document.querySelector('.glass-container');
    const width = container.clientWidth; // Use container width, not window
    container.scrollTo({
        left: width * index,
        behavior: 'smooth'
    });
};

// Update active dot on scroll
const container = document.querySelector('.glass-container');
if (container) {
    container.addEventListener('scroll', () => {
        if (window.innerWidth > 1100) return; // Mobile only

        const scrollLeft = container.scrollLeft;
        const width = container.clientWidth; // Safer
        const index = Math.round(scrollLeft / width);

        document.querySelectorAll('.nav-dot').forEach((dot, i) => {
            dot.classList.toggle('active', i === index);
        });
    });
} window.signOutUser = () => {
    signOut(auth).then(() => {
        closeProfile();
        window.location.reload();
    });
};

// --- CHAT LOGIC ---
let chatUnsub = null;
window.loadChat = () => {
    // FORCE RELOAD LOGIC (Reverted optimization for safety)
    if (chatUnsub) {
        if (window.chatListeningAlbumId === currentAlbumId) return;
        chatUnsub();
        chatUnsub = null;
    }

    window.chatListeningAlbumId = currentAlbumId;
    const list = document.getElementById('chatMessages');
    list.innerHTML = ""; // Always clear on load/switch

    const scrollToBottom = () => {
        list.scrollTop = list.scrollHeight;
    };

    const q = query(collection(db, "chats_messages"), where("albumId", "==", currentAlbumId), orderBy("timestamp", "asc"));

    chatUnsub = onSnapshot(q, (snap) => {

        if (snap.empty && list.children.length === 0) {
            list.innerHTML = "<div class='empty-state' id='chat-empty'>Sois le premier à parler de cet album !</div>";
            return;
        }

        const empty = document.getElementById('chat-empty');
        if (empty) empty.remove();

        let newMessages = false;

        snap.docChanges().forEach(change => {
            const m = change.doc.data();
            const id = change.doc.id;

            if (change.type === "added") {
                newMessages = true;
                const isMine = currentUser && m.userId === currentUser.uid;
                const div = document.createElement('div');
                div.className = `chat-msg ${isMine ? 'mine' : 'others'}`;
                div.id = `chat-${id}`;
                const safeName = m.userName ? m.userName.split(' ')[0] : 'Anonyme';
                div.innerHTML = `
                    <div class="chat-header">
                        <span class="chat-user">${safeName}</span>
                        ${isMine ? `<span class="delete-chat-btn" onclick="deleteChatMessage('${id}')">✕</span>` : ''}
                    </div>
                    <div class="chat-content">${m.text}</div>`;
                list.appendChild(div);
            }
            if (change.type === "removed") {
                const el = document.getElementById(`chat-${id}`);
                if (el) el.remove();
            }
        });

        if (newMessages) scrollToBottom();
    }, (error) => {
        console.error("Error loading chat:", error);
        list.innerHTML = `<div class="empty-state" style="color:var(--danger)">Erreur chargement chat: ${error.message}</div>`;
    });

    document.getElementById('chatInputArea').classList.toggle('hidden', !currentUser);
    document.getElementById('chatLoginPrompt').classList.toggle('hidden', !!currentUser);
};

window.sendChatMessage = async () => {
    const input = document.getElementById('chatInput');
    const txt = input.value.trim();
    if (!txt || !currentUser) return;

    try {
        await addDoc(collection(db, "chats_messages"), {
            albumId: currentAlbumId,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            text: txt,
            timestamp: serverTimestamp()
        });
        input.value = "";
    } catch (e) { console.error(e); alert("Erreur envoi message"); }
};

window.deleteChatMessage = async (id) => {
    try {
        await deleteDoc(doc(db, "chats_messages", id));
    } catch (e) {
        console.error("Error deleting chat message:", e);
    }
};

// --- REPLIES LOGIC ---
window.toggleReplyForm = (reviewId) => {
    const el = document.getElementById(`reply-box-${reviewId}`);
    if (el) el.classList.toggle('hidden');
};

window.submitReply = async (reviewId) => {
    const input = document.getElementById(`reply-input-${reviewId}`);
    const txt = input.value.trim();
    if (!currentUser) {
        alert("Tu dois être connecté pour répondre.");
        return;
    }
    if (!txt) return;

    try {
        await addDoc(collection(db, "replies"), {
            reviewId: reviewId,
            albumId: currentAlbumId,
            userId: currentUser.uid,
            userName: currentUser.displayName,
            text: txt,
            timestamp: serverTimestamp()
        });
        input.value = "";
        window.toggleReplyForm(reviewId);
    } catch (e) {
        console.error("Reply Error:", e);
        alert("Erreur lors de l'envoi de la réponse. Vérifie ta connexion.");
    }
};

// Global Listener for Replies on this Album 
let repliesUnsub = null;
// Memory cache to handle race conditions (Replies ready before Review DOM)
window.repliesCache = {}; // Map<reviewId, Array<ReplyHTMLKey>>

window.listenToReplies = () => {
    if (repliesUnsub) repliesUnsub();
    window.repliesCache = {}; // Reset cache on new album load

    const q = query(collection(db, "replies"), where("albumId", "==", currentAlbumId), orderBy("timestamp", "asc"));

    repliesUnsub = onSnapshot(q, (snap) => {
        snap.docChanges().forEach(change => {
            const r = change.doc.data();
            const rid = r.reviewId;
            const replyId = change.doc.id;

            if (change.type === "added") {
                if (!window.repliesCache[rid]) window.repliesCache[rid] = [];
                // Check dupes in cache
                if (!window.repliesCache[rid].find(x => x.id === replyId)) {
                    window.repliesCache[rid].push({ id: replyId, data: r });
                }
                renderReply(rid, replyId, r);
            }
            if (change.type === "removed") {
                const el = document.getElementById(`reply-${replyId}`);
                if (el) el.remove();
                // Remove from cache
                if (window.repliesCache[rid]) {
                    window.repliesCache[rid] = window.repliesCache[rid].filter(x => x.id !== replyId);
                }
            }
        });
    }, (error) => {
        console.error("Error loading replies:", error);
    });
};

// Helper to render a reply if container exists
function renderReply(reviewId, replyId, r) {
    const container = document.getElementById(`replies-${reviewId}`);
    if (container) {
        // Avoid duplicates in DOM
        if (document.getElementById(`reply-${replyId}`)) return;

        const isMine = currentUser && r.userId === currentUser.uid;
        const div = document.createElement('div');
        div.className = "reply-item";
        div.id = `reply-${replyId}`;
        div.innerHTML = `<div class="reply-header">
            <span class="reply-user">${r.userName}</span>
            ${isMine ? `<span onclick="deleteReply('${replyId}')" style="cursor:pointer; color:var(--danger); font-size:0.7rem; margin-left:auto;">✕</span>` : ''}
        </div>
        <div class="reply-text">${r.text}</div>`;
        container.appendChild(div);
    }
    // If no container, it stays in cache only, waiting for Review to spawn.
}

// EXPORT TO WINDOW so loadReviews can call it when creating a review element
window.renderRepliesForReview = (reviewId) => {
    const cache = window.repliesCache[reviewId];
    if (cache && cache.length > 0) {
        cache.forEach(item => {
            renderReply(reviewId, item.id, item.data);
        });
    }
};

window.deleteReply = async (rid) => {
    try {
        await deleteDoc(doc(db, "replies", rid));
    } catch (e) { console.error(e); }
};

async function checkNotificationState() {
    const notifBtn = document.getElementById('btnNotif');
    if (!notifBtn) return;

    if (Notification.permission === 'granted') {
        notifBtn.textContent = "🔕 DÉSACTIVER LES NOTIFICATIONS";
        notifBtn.classList.add('active');
        notifBtn.onclick = toggleNotifications;
        notifBtn.disabled = false;
    } else {
        notifBtn.textContent = "🔔 ACTIVER LES NOTIFICATIONS";
        notifBtn.classList.remove('active');
        notifBtn.onclick = toggleNotifications;
    }
}

window.toggleNotifications = async () => {
    const btn = document.getElementById('btnNotif');

    // CAS 1 : DÉSACTIVATION
    if (Notification.permission === 'granted' && btn.classList.contains('active')) {
        try {
            const VAPID_KEY = "BCE4_NFS_Q5pYoJaiHIfji5Cbv42XUZzSlycjt-ReiZ-9ZowIxOJpvclT6c__9fPjLtKQpBEOHhH_3sr54Cj50c";
            const registration = await navigator.serviceWorker.ready;

            const currentToken = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (currentToken) {
                await deleteDoc(doc(db, "tokens", currentToken));
                console.log("Token removed from DB");
            }
            await deleteToken(messaging);
            console.log("Token deleted.");
            btn.textContent = "🔔 ACTIVER LES NOTIFICATIONS";
            btn.classList.remove('active');
            alert("Notifications désactivées.");
        } catch (e) {
            console.error("Error deleting token", e);
            alert("Erreur lors de la désactivation (Vérifie la console).");
        }
        return;
    }

    // CAS 2 : ACTIVATION
    if (!("Notification" in window)) {
        alert("Ce navigateur ne supporte pas les notifications.");
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const VAPID_KEY = "BCE4_NFS_Q5pYoJaiHIfji5Cbv42XUZzSlycjt-ReiZ-9ZowIxOJpvclT6c__9fPjLtKQpBEOHhH_3sr54Cj50c";

            const registration = await navigator.serviceWorker.ready;
            const token = await getToken(messaging, {
                vapidKey: VAPID_KEY,
                serviceWorkerRegistration: registration
            });

            if (token) {
                console.log("🔥 TON TOKEN FCM (Copie-le !) : ", token);

                // SAVE TOKEN TO FIRESTORE
                try {
                    await setDoc(doc(db, "tokens", token), {
                        token: token,
                        userId: currentUser ? currentUser.uid : "anonymous",
                        timestamp: serverTimestamp()
                    });
                    console.log("Token saved to DB");
                } catch (e) {
                    console.error("Error saving token to DB:", e);
                }

                checkNotificationState();

                new Notification("Maestro", {
                    body: "Notifications activées ! (Et enregistrées)",
                    icon: "images/logo.png"
                });
            } else {
                console.log('No registration token available.');
            }
        } else {
            alert("Permission refusée.");
        }
    } catch (e) {
        console.error("Erreur FCM:", e);
        alert("Erreur activation notifs : " + e.message);
    }
};
