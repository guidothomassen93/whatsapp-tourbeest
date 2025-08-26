// Emergency API endpoint to kill database connections
// Add this to server.js if needed

app.get('/api/emergency/kill-connections', async (req, res) => {
    let connection = null;
    
    try {
        console.log('🚨 Emergency: Killing all database connections...');
        
        // Create direct connection (not from pool)
        connection = await mysql.createConnection(dbConfig);
        
        // Get all processes/connections for this user
        const [processes] = await connection.execute(`
            SELECT Id, User, Host, db, Command, Time, State 
            FROM INFORMATION_SCHEMA.PROCESSLIST 
            WHERE User = ?
        `, [dbConfig.user]);
        
        console.log(`Found ${processes.length} active connections`);
        
        let killedCount = 0;
        let results = [];
        
        for (const process of processes) {
            try {
                // Don't kill our own connection
                if (process.Id === connection.threadId) {
                    results.push({
                        id: process.Id,
                        host: process.Host,
                        status: 'skipped',
                        reason: 'own_connection'
                    });
                    continue;
                }
                
                await connection.execute(`KILL ?`, [process.Id]);
                results.push({
                    id: process.Id,
                    host: process.Host,
                    status: 'killed',
                    time: process.Time
                });
                killedCount++;
                
            } catch (killError) {
                results.push({
                    id: process.Id,
                    host: process.Host,
                    status: 'failed',
                    error: killError.message
                });
            }
        }
        
        // Verify cleanup
        const [remainingProcesses] = await connection.execute(`
            SELECT COUNT(*) as count 
            FROM INFORMATION_SCHEMA.PROCESSLIST 
            WHERE User = ?
        `, [dbConfig.user]);
        
        const remaining = remainingProcesses[0].count;
        
        res.json({
            success: true,
            message: 'Database connection cleanup completed',
            summary: {
                total_found: processes.length,
                killed: killedCount,
                remaining: remaining,
                cleanup_successful: remaining <= 1
            },
            details: results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Emergency connection cleanup failed:', error);
        
        res.json({
            success: false,
            message: 'Failed to cleanup database connections',
            error: error.message,
            code: error.code,
            timestamp: new Date().toISOString()
        });
    } finally {
        if (connection) {
            try {
                await connection.end();
            } catch (closeError) {
                console.error('Error closing cleanup connection:', closeError.message);
            }
        }
    }
});