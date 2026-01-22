const admin = require("firebase-admin");
const cron = require("node-cron");
const serviceAccount = require("./service-account.json");

// 1. Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const messaging = admin.messaging();
const db = admin.firestore();

console.log("⏰ Maestro Scheduler Started");
console.log("Waiting for 14h and 20h...");

// 2. Define the Notification Sending Logic
async function sendDailyNotification(hour) {
    let title = "Maestro";
    let body = `C'est l'heure de la musique ! (${hour}h)`;

    // Customize message based on hour
    if (hour === 14) {
        title = "OnlyFans";
        body = "Votre abonnement OnlyFans à SexyBunny53 expire demain !";
    } else if (hour === 20) {
        title = "Session du soir 🌙";
        body = "Dernière chance pour noter l'album d'aujourd'hui !";
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
        const tokens = [];
        tokensSnap.forEach(doc => {
            if (doc.data().token) tokens.push(doc.data().token);
        });

        if (tokens.length === 0) {
            console.log("⚠️ No tokens found in DB. Make sure to enable notifications in the web app first.");
            return;
        }

        console.log(`[${hour}h] Sending to ${tokens.length} devices found in DB...`);

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
                }
            });
            console.log('List of invalid tokens to cleanup:', failedTokens);
            // Optional: Delete invalid tokens from DB here
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
