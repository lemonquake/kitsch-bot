
const db = require('./src/database/db');
async function run() {
    await db.initDatabase();
    const tickets = db.getDb().exec("SELECT * FROM tickets");
    if (tickets.length > 0) {
        console.log("Columns:", tickets[0].columns);
        console.log("Values:", tickets[0].values);
    } else {
        console.log("No tickets found.");
    }
}
run();
