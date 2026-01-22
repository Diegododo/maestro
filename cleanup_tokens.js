const admin = require("firebase-admin");
const serviceAccount = require("./service-account.json");

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

async function cleanupTokens() {
    console.log("🔍 Starting token cleanup...");

    try {
        const snapshot = await db.collection('tokens').get();
        const tokensByUser = {};
        const allTokens = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const uid = data.userId || 'anonymous';

            if (!tokensByUser[uid]) {
                tokensByUser[uid] = [];
            }
            tokensByUser[uid].push({
                id: doc.id,
                token: data.token,
                timestamp: data.timestamp ? data.timestamp.toDate() : new Date(0)
            });
            allTokens.push(data.token);
        });

        console.log(`Found ${snapshot.size} total tokens.`);

        for (const uid in tokensByUser) {
            const userTokens = tokensByUser[uid];
            if (userTokens.length > 1) {
                console.log(`\n👤 User ${uid} has ${userTokens.length} tokens.`);

                // Sort by timestamp (newest first)
                userTokens.sort((a, b) => b.timestamp - a.timestamp);

                // Keep only the newest one
                const newest = userTokens[0];
                console.log(`   ✅ Keeping newest: ${newest.id} (${newest.timestamp.toISOString()})`);

                for (let i = 1; i < userTokens.length; i++) {
                    const toDelete = userTokens[i];
                    console.log(`   ❌ Deleting old: ${toDelete.id} (${toDelete.timestamp.toISOString()})`);
                    await db.collection('tokens').doc(toDelete.id).delete();
                }
            }
        }

        console.log("\n✅ Cleanup complete.");

    } catch (error) {
        console.error("Error:", error);
    }
}

cleanupTokens();
