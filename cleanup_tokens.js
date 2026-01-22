const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function wipeTokens() {
    console.log("🧨 Starting TOTAL token wipe...");

    try {
        const snapshot = await db.collection('tokens').get();

        if (snapshot.empty) {
            console.log("No tokens found.");
            return;
        }

        console.log(`Found ${snapshot.size} tokens to delete.`);

        const batch = db.batch();
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref);
        });

        await batch.commit();

        console.log("✅ All tokens deleted successfully.");

    } catch (error) {
        console.error("Error:", error);
    }
}

wipeTokens();
