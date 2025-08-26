// Get current IP address of Render.com service
const https = require('https');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3002;

// Function to get external IP
function getExternalIP() {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org?format=json', (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    resolve(result.ip);
                } catch (error) {
                    reject(error);
                }
            });
        }).on('error', (error) => {
            reject(error);
        });
    });
}

// Endpoint to get IP info
app.get('/', async (req, res) => {
    try {
        const externalIP = await getExternalIP();
        
        res.json({
            message: 'Render.com Service IP Information',
            external_ip: externalIP,
            user_agent: req.get('User-Agent'),
            headers: req.headers,
            connection_info: {
                remote_address: req.connection?.remoteAddress,
                remote_port: req.connection?.remotePort,
                local_address: req.connection?.localAddress,
                local_port: req.connection?.localPort
            },
            instructions: [
                `Whitelist this IP in your database: ${externalIP}`,
                'Note: Render.com IPs can change, so this may need updates',
                'Consider using connection strings instead of IP whitelisting'
            ],
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({
            error: 'Could not determine IP',
            message: error.message
        });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`IP detection service running on port ${PORT}`);
    
    // Show IP on startup
    getExternalIP()
        .then(ip => {
            console.log(`🌐 Current external IP: ${ip}`);
            console.log(`📋 Add this IP to your database whitelist: ${ip}`);
        })
        .catch(err => {
            console.error('❌ Could not get IP:', err.message);
        });
});

🤖 Generated with [Memex](https://memex.tech)
Co-Authored-By: Memex <noreply@memex.tech>