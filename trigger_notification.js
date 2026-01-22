const admin = require("firebase-admin");
const allAlbums = require("./data.js");

// Determine behavior: "Is this a test?" or "Auto-detect hour"
// Usage: node trigger_notification.js [hour]
const args = process.argv.slice(2);
let forceHour = args[0] ? parseInt(args[0]) : null;

// Initialize Firebase
const serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const messaging = admin.messaging();
const db = admin.firestore();

// CONSTANTS
const LAUNCH_DATE_STR = '2026-01-07';
const LAUNCH_DATE = new Date(LAUNCH_DATE_STR); LAUNCH_DATE.setHours(0, 0, 0, 0);

function getDailyAlbum() {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - LAUNCH_DATE) / (1000 * 60 * 60 * 24));
    const index = diffDays < 0 ? 0 : diffDays % allAlbums.length;
    return allAlbums[index];
}

async function sendNotification() {
    // Simplify: We will pass the hour explicitly in the YML file.
    const hour = forceHour || 14;

    const album = getDailyAlbum();

    let title = "Maestro";
    let body = `C'est l'heure de la musique !`;

    if (hour === 14) {
        title = "Album du jour 🎵";
        body = `Aujourd'hui : ${album.title} par ${album.artist}. Venez noter !`;
    } else if (hour === 20) {
        title = "Session du soir 🌙";
        body = `Avez-vous écouté ${album.title} ? Donnez votre avis avant minuit !`;
    }

    const message = {
        notification: {
            title: title,
            body: body,
        },
        data: {
            title: title,
            body: body,
            click_action: "https://maestro.fabric.inc"
        },
        webpush: {
            fcm_options: {
                link: "https://maestro.fabric.inc"
            }
        }
    };
    console.log(`Sending Message: ${title} - ${body}`);
    try {
        console.log(`🚀 Starting notification job for ${hour}h...`);

        const tokensSnap = await db.collection('tokens').get();
        const tokensSet = new Set();
        tokensSnap.forEach(doc => {
            if (doc.data().token) tokensSet.add(doc.data().token);
        });

        const tokens = Array.from(tokensSet);

        if (tokens.length === 0) {
            console.log("⚠️ No tokens found. Exiting.");
            process.exit(0);
        }

        console.log(`Found ${tokens.length} unique tokens.`);

        const response = await messaging.sendEachForMulticast({
            tokens: tokens,
            notification: message.notification,
            webpush: message.webpush
        });

        console.log(`✅ Sent! Success: ${response.successCount}, Failed: ${response.failureCount}`);

        if (response.failureCount > 0) {
            console.log("Failed tokens cleanup is not implemented in trigger_notification.js (see scheduler.js for reference)");
        }

        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

sendNotification();
