const admin = require("firebase-admin");

// Determine behavior: "Is this a test?" or "Auto-detect hour"
// Usage: node trigger_notification.js [hour]
// Example: node trigger_notification.js 14 -> Force send 14h message
// Example: node trigger_notification.js -> Auto-detect based on current UTC time

const args = process.argv.slice(2);
let forceHour = args[0] ? parseInt(args[0]) : null;

// Initialize Firebase
// In GitHub Actions, we'll write the secret to a file 'service-account.json'
// Or simpler: we can check if file exists, if not, try env var?
// Let's assume the workflow writes the file.
const serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const messaging = admin.messaging();
const db = admin.firestore();

async function sendNotification() {
    // Current Time in Paris (approx)
    // GitHub Actions servers are usually UTC.
    // Paris is UTC+1 (Winter) or UTC+2 (Summer).
    // Let's be smart: The CRON triggers at specific UTC times.
    // We just rely on the argument passed by the CRON workflow, OR default to generic.

    // If no argument, we guess based on UTC hour
    const now = new Date();
    const utcHour = now.getUTCHours();

    // 14h Paris = 13h UTC (Winter) / 12h UTC (Summer)
    // 20h Paris = 19h UTC (Winter) / 18h UTC (Summer)

    // Simplify: We will pass the hour explicitly in the YML file to avoid timezone headaches.
    const hour = forceHour || 14; // Default to 14 if lost

    let title = "Maestro";
    let body = `C'est l'heure de la musique !`;

    if (hour === 14) {
        title = "Pause café ☕";
        body = "Un petit avis sur l'album du jour ?";
    } else if (hour === 20) {
        title = "Session du soir 🌙";
        body = "Dernière chance pour noter l'album d'aujourd'hui !";
    }

    const message = {
        notification: {
            title: title,
            body: body,
        },
        webpush: {
            fcm_options: {
                link: "https://maestro.fabric.inc" // Replace with your real URL if hosted elsewhere
            }
        }
    };

    try {
        console.log(`🚀 Starting notification job for ${hour}h...`);

        const tokensSnap = await db.collection('tokens').get();
        const tokens = [];
        tokensSnap.forEach(doc => {
            if (doc.data().token) tokens.push(doc.data().token);
        });

        if (tokens.length === 0) {
            console.log("⚠️ No tokens found. Exiting.");
            process.exit(0);
        }

        console.log(`Found ${tokens.length} tokens.`);

        const response = await messaging.sendEachForMulticast({
            tokens: tokens,
            notification: message.notification,
            webpush: message.webpush
        });

        console.log(`✅ Sent! Success: ${response.successCount}, Failed: ${response.failureCount}`);
        process.exit(0);

    } catch (error) {
        console.error("❌ Error:", error);
        process.exit(1);
    }
}

sendNotification();
