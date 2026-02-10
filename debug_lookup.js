
const db = require('./src/database/db');

async function run() {
    await db.initDatabase();

    console.log("--- Testing Ticket 2 Lookup ---");
    // Fetch directly to see exact value
    const stmt = db.getDb().prepare("SELECT custom_id FROM tickets WHERE id = 2");
    if (stmt.step()) {
        const val = stmt.getAsObject().custom_id;
        console.log(`Raw DB value for ID 2: '${val}'`);
        console.log(`Length: ${val.length}`);
        console.log(`Char codes: ${val.split('').map(c => c.charCodeAt(0)).join(',')}`);
    } else {
        console.log("Ticket 2 not found via direct ID fetch");
    }
    stmt.free();

    // Test helper function logic
    console.log("\n--- Testing Helper Function ---");
    const testCases = [
        '2',
        'Shipping_Issue_11-02-26',
        'shipping_issue_11-02-26',
        'Shipping_Issue_11-02-26 ', // trailing space
        ' Shipping_Issue_11-02-26'  // leading space
    ];

    for (const input of testCases) {
        const result = db.getTicketByIdOrCustomId(input);
        console.log(`Input '${input}': ${result ? 'FOUND' : 'NOT FOUND'}`);
    }
}

run();
