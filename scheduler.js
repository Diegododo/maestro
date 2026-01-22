const admin = require("firebase-admin");
const cron = require("node-cron");
const serviceAccount = require("./service-account.json");

// 1. Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const messaging = admin.messaging();
const db = admin.firestore();

const allAlbums = require("./data.js");
const LAUNCH_DATE_STR = '2026-01-07';
const LAUNCH_DATE = new Date(LAUNCH_DATE_STR); LAUNCH_DATE.setHours(0, 0, 0, 0);

function getDailyAlbum(dateInput) {
    const d = dateInput ? new Date(dateInput) : new Date();
    d.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((d - LAUNCH_DATE) / (1000 * 60 * 60 * 24));
    const index = diffDays < 0 ? 0 : diffDays % allAlbums.length;
    return allAlbums[index];
}

console.log("⏰ Maestro Scheduler Started");
console.log("Waiting for 14h and 20h...");

// 2. Define the Notification Sending Logic
async function sendDailyNotification(hour) {
    const album = getDailyAlbum(new Date());

    let title = "Maestro";
    let body = `C'est l'heure de la musique !`;

    if (hour === 14) {
        title = "Album du jour 🎵";
        body = `Aujourd'hui : ${album.title} par ${album.artist}. Viens écouter bordel !`;
    } else if (hour === 20) {
        title = "Session du soir 🌙";
        body = `T'as écouté ${album.title} ?`;
    }

    const message = {
        data: {
            title: title,
            body: body,
        },
        webpush: {
            fcm_options: {
                link: "https://maestro.fabric.inc"
            }
        }
    };

    try {
        // FETCH TOKENS FROM DB
        const tokensSnap = await db.collection('tokens').get();
        const tokensSet = new Set();
        tokensSnap.forEach(doc => {
            if (doc.data().token) tokensSet.add(doc.data().token);
        });
        const tokens = Array.from(tokensSet);

        if (tokens.length === 0) {
            console.log("⚠️ No tokens found in DB. Make sure to enable notifications in the web app first.");
            return;
        }

        console.log(`[${hour}h] Sending to ${tokens.length} unique devices found in DB...`);

        // Send multicast (efficient for < 500 tokens)
        // If tokens > 500, we need to batch. For now, simple loop or multicast method.
        // admin.messaging().sendEachForMulticast is recommended.

        const response = await messaging.sendEachForMulticast({
            tokens: tokens,
            notification: message.notification,
            webpush: message.webpush
        });

        console.log(`   ✅ Success count: ${response.successCount}`);
        console.log(`   ❌ Failure count: ${response.failureCount}`);

        if (response.failureCount > 0) {
            const failedTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    failedTokens.push(tokens[idx]);
                    // Check error code to see if token is invalid
                    // resp.error.code
                }
            });
            console.log('List of failed tokens:', failedTokens);
            // Optional: Delete invalid tokens from DB here if error is 'messaging/registration-token-not-registered'
        }

    } catch (error) {
        console.log("Error sending message:", error);
    }
}

// 3. Schedule Tasks

// 2:00 PM (14h)
cron.schedule("0 14 * * *", () => {
    sendDailyNotification(14);
});

// 8:00 PM (20h)
cron.schedule("0 20 * * *", () => {
    sendDailyNotification(20);
});

// TEST IMMEDIAT (décommente pour tester tout de suite)
// setTimeout(() => sendDailyNotification(14), 1000);

console.log("✅ Scheduler running. Keep this terminal open.");
