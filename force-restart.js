// Force restart script - kills all existing connections on startup
// Add this to the beginning of server.js

const mysql = require('mysql2/promise');

// Database configuration
const dbConfig = {
    host: 'h14.mijn.host',
    port: 3306,
    user: 'nr104944_tourbeest',
    password: 'Alazfv123!',
    database: 'nr104944_tourbeest',
    charset: 'utf8mb4'
};

async function forceKillAllConnections() {
    console.log('🚨 FORCE RESTART: Killing all existing database connections...');
    
    let connection = null;
    try {
        // Create a direct connection (bypass any pool)
        connection = await mysql.createConnection(dbConfig);
        
        // Get current connection ID to avoid killing ourselves
        const [currentResult] = await connection.execute('SELECT CONNECTION_ID() as id');
        const currentConnectionId = currentResult[0].id;
        
        // Get all processes for this user
        const [processes] = await connection.execute(`
            SELECT Id FROM INFORMATION_SCHEMA.PROCESSLIST 
            WHERE User = ? AND Id != ?
        `, [dbConfig.user, currentConnectionId]);
        
        console.log(`Found ${processes.length} connections to kill`);
        
        // Kill all connections except our own
        let killedCount = 0;
        for (const process of processes) {
            try {
                await connection.execute(`KILL ?`, [process.Id]);
                killedCount++;
            } catch (error) {
                // Ignore errors (connection might already be gone)
            }
        }
        
        console.log(`✅ Force killed ${killedCount} database connections`);
        
        // Small delay to let connections close
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return true;
        
    } catch (error) {
        console.error('❌ Force restart failed:', error.message);
        return false;
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (error) {
                // Ignore cleanup errors
            }
        }
    }
}

// Export the function
module.exports = { forceKillAllConnections };