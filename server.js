// Tourbeest WhatsApp Service - Database Configured
// Using whatsapp-web.js official library
// Database: nr104944_tourbeest @ tourbeest.nl:3306

const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const QRCode = require('qrcode');
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const https = require('https');

console.log('🎵 Tourbeest WhatsApp Service - Database Configured');
console.log('📦 Using whatsapp-web.js library v1.24.0');
console.log('🗄️  Database: nr104944_tourbeest @ tourbeest.nl:3306');

// Server configuration
const PORT = process.env.PORT || 3001;
const HOST = '0.0.0.0';
const NODE_ENV = process.env.NODE_ENV || 'development';

console.log(`⚙️  Environment: ${NODE_ENV}`);
console.log(`🔧 Node.js: ${process.version}`);
console.log(`🚀 Server will start on: ${HOST}:${PORT}`);

// Database configuration - Updated to tourbeest.nl
const dbConfig = {
    host: process.env.DB_HOST || 'tourbeest.nl',
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER || 'nr104944_tourbeest',
    password: process.env.DB_PASSWORD || 'Alazfv123!',
    database: process.env.DB_NAME || 'nr104944_tourbeest',
    charset: 'utf8mb4',
    connectTimeout: 30000,
    acquireTimeout: 30000,
    timeout: 30000
};

console.log('📊 Database configuration:');
console.log(`   Host: ${dbConfig.host}:${dbConfig.port}`);
console.log(`   User: ${dbConfig.user}`);
console.log(`   Database: ${dbConfig.database}`);
console.log(`   Password: ${dbConfig.password ? '***configured***' : 'NOT SET'}`);

// Global WhatsApp state
let whatsappClient = null;
let isClientReady = false;
let isClientInitialized = false;
let clientInfo = null;
let qrCodeString = null;
let qrCodeDataURL = null;
let lastQRGenerated = null;
let connectionAttempts = 0;
let lastError = null;
let currentIP = null;

// Service statistics
const stats = {
    startTime: new Date(),
    totalMessagesSent: 0,
    totalErrors: 0,
    qrCodesGenerated: 0,
    databaseConnections: 0
};

// Function to get external IP
async function getExternalIP() {
    return new Promise((resolve, reject) => {
        https.get('https://api.ipify.org?format=json', (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                try {
                    const result = JSON.parse(data);
                    currentIP = result.ip;
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

// Database connection with updated host
async function connectDatabase() {
    try {
        stats.databaseConnections++;
        console.log(`🔌 Connecting to database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
        
        const connection = await mysql.createConnection(dbConfig);
        await connection.ping();
        
        console.log('✅ Database connected successfully!');
        console.log(`📈 Total DB connections: ${stats.databaseConnections}`);
        
        return connection;
    } catch (error) {
        console.error('❌ Database connection failed:');
        console.error(`   Error: ${error.message}`);
        console.error(`   Code: ${error.code || 'Unknown'}`);
        
        if (error.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('🚨 Access denied - check username/password');
        } else if (error.code === 'ENOTFOUND') {
            console.error('🚨 Host not found - check hostname');
        } else if (error.code === 'ER_BAD_DB_ERROR') {
            console.error('🚨 Database not found - check database name');
        } else if (error.code === 'ECONNREFUSED') {
            console.error('🚨 Connection refused - check host/port and firewall');
        }
        
        stats.totalErrors++;
        return null;
    }
}

// Database status update
async function updateDatabaseStatus(status, phone = null) {
    try {
        const db = await connectDatabase();
        if (!db) {
            console.warn('⚠️  Cannot update database status - no connection');
            return;
        }
        
        // Create table if not exists
        await db.execute(`
            CREATE TABLE IF NOT EXISTS whatsapp_service_status (
                id INT PRIMARY KEY,
                status VARCHAR(50),
                phone VARCHAR(50),
                last_connected TIMESTAMP,
                version VARCHAR(50),
                platform VARCHAR(50),
                ip_address VARCHAR(50),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
            )
        `);
        
        // Update status with current IP
        await db.execute(`
            INSERT INTO whatsapp_service_status (id, status, phone, last_connected, version, platform, ip_address) 
            VALUES (1, ?, ?, NOW(), 'whatsapp-web.js-v1.24.0', 'render.com', ?) 
            ON DUPLICATE KEY UPDATE 
                status = ?, phone = ?, last_connected = NOW(), ip_address = ?, updated_at = NOW()
        `, [status, phone, currentIP, status, phone, currentIP]);
        
        await db.end();
        console.log(`📝 Database status updated: ${status}`);
        
    } catch (error) {
        console.error('❌ Database status update failed:', error.message);
    }
}

// WhatsApp Client Initialization with improved Render.com config
async function initializeWhatsApp() {
    if (isClientInitialized) {
        console.log('⚠️  WhatsApp client already initialized');
        return;
    }
    
    try {
        connectionAttempts++;
        console.log(`🔄 Initializing WhatsApp client (attempt ${connectionAttempts})`);
        
        // Enhanced Puppeteer config for Render.com
        const puppeteerConfig = {
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--single-process',
                '--disable-features=TranslateUI',
                '--disable-features=BlinkGenPropertyTrees',
                '--disable-ipc-flooding-protection',
                '--disable-renderer-backgrounding',
                '--disable-backgrounding-occluded-windows',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-default-apps',
                '--disable-domain-reliability',
                '--disable-extensions',
                '--disable-sync',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-field-trial-config',
                '--disable-back-forward-cache',
                '--disable-hang-monitor',
                '--disable-prompt-on-repost',
                '--disable-background-networking',
                '--disable-ipc-flooding-protection',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ],
            defaultViewport: null,
            ignoreHTTPSErrors: true,
            slowMo: 100
        };

        whatsappClient = new Client({
            authStrategy: new LocalAuth({
                clientId: 'tourbeest-render-nr104944',
                dataPath: './whatsapp-session'
            }),
            puppeteer: puppeteerConfig,
            webVersionCache: {
                type: 'remote',
                remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
            }
        });

        // QR Code event
        whatsappClient.on('qr', async (qr) => {
            stats.qrCodesGenerated++;
            qrCodeString = qr;
            lastQRGenerated = new Date();
            
            console.log('📱 QR Code generated for WhatsApp authentication');
            console.log(`🔢 QR Code #${stats.qrCodesGenerated}`);
            console.log('🔗 Available at: /api/qr');
            
            // Generate QR in terminal (smaller for better visibility)
            qrcode.generate(qr, { small: true });
            
            // Generate QR as data URL for web
            try {
                qrCodeDataURL = await QRCode.toDataURL(qr, {
                    width: 512,
                    margin: 2,
                    color: {
                        dark: '#000000',
                        light: '#FFFFFF'
                    }
                });
                console.log('🖼️  QR Code image ready for web display');
            } catch (qrError) {
                console.error('❌ QR Code image generation failed:', qrError.message);
            }
            
            await updateDatabaseStatus('qr_code_generated');
        });

        // Authentication success
        whatsappClient.on('authenticated', async () => {
            console.log('✅ WhatsApp authenticated successfully!');
            qrCodeString = null;
            qrCodeDataURL = null;
            await updateDatabaseStatus('authenticated');
        });

        // Authentication failure
        whatsappClient.on('auth_failure', async (message) => {
            console.error('❌ WhatsApp authentication failed:', message);
            lastError = `Authentication failed: ${message}`;
            stats.totalErrors++;
            qrCodeString = null;
            qrCodeDataURL = null;
            isClientReady = false;
            await updateDatabaseStatus('auth_failed');
            
            // Auto-restart on auth failure
            console.log('🔄 Restarting WhatsApp client after auth failure...');
            setTimeout(() => {
                isClientInitialized = false;
                initializeWhatsApp();
            }, 10000);
        });

        // Client ready
        whatsappClient.on('ready', async () => {
            console.log('🎉 WhatsApp client is ready!');
            isClientReady = true;
            
            clientInfo = whatsappClient.info;
            console.log(`📞 Connected as: ${clientInfo.wid.user}`);
            console.log(`👤 Display name: ${clientInfo.pushname}`);
            console.log(`📱 WhatsApp version: ${clientInfo.wa_version}`);
            
            qrCodeString = null;
            qrCodeDataURL = null;
            lastError = null;
            
            await updateDatabaseStatus('connected', clientInfo.wid.user);
        });

        // Disconnected
        whatsappClient.on('disconnected', async (reason) => {
            console.log('❌ WhatsApp disconnected:', reason);
            isClientReady = false;
            clientInfo = null;
            lastError = `Disconnected: ${reason}`;
            await updateDatabaseStatus('disconnected');
            
            // Auto-reconnect
            console.log('🔄 Attempting to reconnect...');
            setTimeout(() => {
                isClientInitialized = false;
                initializeWhatsApp();
            }, 15000);
        });

        // Loading screen
        whatsappClient.on('loading_screen', (percent, message) => {
            console.log(`📋 Loading WhatsApp... ${percent}% - ${message}`);
        });

        // Initialize client
        isClientInitialized = true;
        console.log('🚀 WhatsApp client initialization started with enhanced config');
        await whatsappClient.initialize();
        
    } catch (error) {
        console.error('❌ WhatsApp initialization error:', error);
        lastError = `Initialization error: ${error.message}`;
        stats.totalErrors++;
        isClientInitialized = false;
        
        // Retry logic with exponential backoff
        const retryDelay = Math.min(30000 * connectionAttempts, 300000); // Max 5 minutes
        if (connectionAttempts < 5) {
            console.log(`🔄 Retrying in ${retryDelay/1000} seconds... (${connectionAttempts}/5)`);
            setTimeout(() => {
                initializeWhatsApp();
            }, retryDelay);
        } else {
            console.error('🚨 Max retry attempts reached. Manual restart required.');
        }
    }
}

// Express App
const app = express();

// Middleware
app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: true
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
    console.log(`📥 ${req.method} ${req.path} from ${req.ip}`);
    next();
});

// Health check endpoint
app.get('/', (req, res) => {
    const uptime = Math.floor(process.uptime());
    
    res.json({
        service: 'Tourbeest WhatsApp Service',
        database: `nr104944_tourbeest @ tourbeest.nl:3306`,
        library: 'whatsapp-web.js v1.24.0',
        status: isClientReady ? 'ready' : (isClientInitialized ? 'initializing' : 'starting'),
        version: '2.2.0',
        platform: 'Render.com',
        current_ip: currentIP,
        uptime: uptime,
        uptime_human: `${Math.floor(uptime / 60)}m ${uptime % 60}s`,
        database_configured: true,
        stats: {
            messages_sent: stats.totalMessagesSent,
            qr_codes_generated: stats.qrCodesGenerated,
            database_connections: stats.databaseConnections,
            errors: stats.totalErrors
        },
        timestamp: new Date().toISOString()
    });
});

// Get IP endpoint
app.get('/api/ip', async (req, res) => {
    try {
        const ip = await getExternalIP();
        
        res.json({
            message: 'Render.com Service IP Information',
            external_ip: ip,
            database_host: `${dbConfig.host}:${dbConfig.port}`,
            connection_info: {
                remote_address: req.connection?.remoteAddress,
                user_agent: req.get('User-Agent')
            },
            instructions: [
                `Current service IP: ${ip}`,
                `Database connection: ${dbConfig.host}:${dbConfig.port}`,
                'Wildcard access configured ✅'
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

// Detailed status endpoint
app.get('/api/status', async (req, res) => {
    // Test database connection
    let dbStatus = 'unknown';
    let dbTestResult = null;
    
    try {
        const db = await connectDatabase();
        if (db) {
            dbStatus = 'connected';
            
            // Test query
            const [rows] = await db.execute('SELECT 1 as test');
            dbTestResult = rows[0];
            
            await db.end();
        } else {
            dbStatus = 'connection_failed';
        }
    } catch (error) {
        dbStatus = `error: ${error.message}`;
    }
    
    res.json({
        service: 'Tourbeest WhatsApp Service',
        whatsapp: {
            status: isClientReady ? 'ready' : (isClientInitialized ? 'initializing' : 'not_started'),
            connected: isClientReady,
            phone: clientInfo?.wid?.user || null,
            pushname: clientInfo?.pushname || null,
            wa_version: clientInfo?.wa_version || null,
            initialized: isClientInitialized,
            connection_attempts: connectionAttempts,
            last_error: lastError
        },
        database: {
            status: dbStatus,
            host: `${dbConfig.host}:${dbConfig.port}`,
            user: dbConfig.user,
            database: dbConfig.database,
            test_query_result: dbTestResult,
            total_connections: stats.databaseConnections
        },
        qr_code: {
            available: !!qrCodeString,
            generated_at: lastQRGenerated,
            expires_in: qrCodeString ? Math.max(0, 120 - Math.floor((Date.now() - lastQRGenerated) / 1000)) : 0
        },
        server: {
            platform: 'Render.com',
            node_version: process.version,
            uptime_seconds: Math.floor(process.uptime()),
            memory_usage: process.memoryUsage(),
            external_ip: currentIP
        },
        statistics: stats,
        timestamp: new Date().toISOString()
    });
});

// QR Code endpoint
app.get('/api/qr', (req, res) => {
    if (qrCodeString) {
        const expiresIn = Math.max(0, 120 - Math.floor((Date.now() - lastQRGenerated) / 1000));
        
        res.json({
            qr_code: qrCodeString,
            status: 'scan_required',
            message: 'Scan deze QR code met WhatsApp app',
            instructions: [
                '1. Open WhatsApp op je telefoon',
                '2. Ga naar Menu → Gekoppelde apparaten',
                '3. Tik op "Apparaat koppelen"',
                '4. Scan deze QR code'
            ],
            generated_at: lastQRGenerated,
            expires_in_seconds: expiresIn,
            qr_number: stats.qrCodesGenerated
        });
    } else if (isClientReady) {
        res.json({
            status: 'authenticated',
            message: 'WhatsApp is already connected',
            phone: clientInfo?.wid?.user || null,
            pushname: clientInfo?.pushname || null
        });
    } else {
        res.json({
            status: isClientInitialized ? 'initializing' : 'starting',
            message: 'WhatsApp service is starting, QR code will appear soon...',
            retry_in_seconds: 10
        });
    }
});

// QR Code image endpoint
app.get('/api/qr/image', (req, res) => {
    if (qrCodeDataURL) {
        res.json({
            image_data_url: qrCodeDataURL,
            format: 'PNG',
            generated_at: lastQRGenerated,
            expires_in_seconds: Math.max(0, 120 - Math.floor((Date.now() - lastQRGenerated) / 1000))
        });
    } else {
        res.json({
            status: 'not_available',
            message: 'QR code image not yet generated'
        });
    }
});

// Send message endpoint
app.post('/api/send-message', async (req, res) => {
    try {
        const { recipients, message } = req.body;
        
        console.log(`📨 Message send request received`);
        console.log(`👥 Recipients: ${recipients?.length || 0}`);
        console.log(`📝 Message: ${message?.length || 0} chars`);
        
        if (!isClientReady) {
            return res.json({
                error: true,
                code: 'CLIENT_NOT_READY',
                message: 'WhatsApp client is not ready. Please scan QR code first.',
                qr_available: !!qrCodeString
            });
        }

        if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
            return res.json({
                error: true,
                code: 'INVALID_RECIPIENTS',
                message: 'Recipients array is required'
            });
        }

        if (!message || message.trim().length === 0) {
            return res.json({
                error: true,
                code: 'INVALID_MESSAGE',
                message: 'Message content is required'
            });
        }

        console.log(`🚀 Starting message send to ${recipients.length} recipients`);
        
        const results = [];
        
        for (const recipient of recipients) {
            try {
                let phoneNumber = recipient.phone?.toString().replace(/\D/g, '');
                
                if (!phoneNumber) {
                    results.push({
                        phone: recipient.phone,
                        name: recipient.name || 'Unknown',
                        status: 'failed',
                        error: 'Invalid phone number'
                    });
                    continue;
                }
                
                // Format Dutch numbers
                if (phoneNumber.length === 9 && phoneNumber.startsWith('6')) {
                    phoneNumber = '31' + phoneNumber;
                } else if (phoneNumber.length === 10 && phoneNumber.startsWith('06')) {
                    phoneNumber = '31' + phoneNumber.substring(1);
                }
                
                const chatId = phoneNumber + '@c.us';
                
                console.log(`📤 Sending to: ${recipient.name} (${phoneNumber})`);
                
                await whatsappClient.sendMessage(chatId, message);
                stats.totalMessagesSent++;
                
                results.push({
                    phone: recipient.phone,
                    formatted_phone: phoneNumber,
                    name: recipient.name || 'Unknown',
                    status: 'sent',
                    sent_at: new Date().toISOString()
                });
                
                console.log(`✅ Message sent to ${recipient.name}`);
                
                // Rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
                
            } catch (sendError) {
                stats.totalErrors++;
                
                results.push({
                    phone: recipient.phone,
                    name: recipient.name || 'Unknown',
                    status: 'failed',
                    error: sendError.message
                });
                
                console.error(`❌ Failed to send to ${recipient.name}: ${sendError.message}`);
            }
        }
        
        const successCount = results.filter(r => r.status === 'sent').length;
        const failedCount = results.filter(r => r.status === 'failed').length;
        
        console.log(`📊 Send completed: ${successCount} sent, ${failedCount} failed`);
        
        res.json({
            error: false,
            message: `${successCount}/${recipients.length} messages sent successfully`,
            summary: {
                total_recipients: recipients.length,
                successful_sends: successCount,
                failed_sends: failedCount,
                success_rate: Math.round((successCount / recipients.length) * 100)
            },
            results: results,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Send message error:', error);
        stats.totalErrors++;
        
        res.status(500).json({
            error: true,
            message: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Test database endpoint
app.get('/api/test-database', async (req, res) => {
    try {
        console.log('🧪 Testing database connection...');
        
        const db = await connectDatabase();
        if (!db) {
            return res.json({
                success: false,
                message: 'Database connection failed',
                config: {
                    host: `${dbConfig.host}:${dbConfig.port}`,
                    user: dbConfig.user,
                    database: dbConfig.database
                }
            });
        }
        
        // Test queries
        const tests = [];
        
        // Test 1: Basic query
        try {
            const [rows] = await db.execute('SELECT 1 as test, NOW() as current_time');
            tests.push({
                test: 'Basic SELECT',
                status: 'success',
                result: rows[0]
            });
        } catch (error) {
            tests.push({
                test: 'Basic SELECT',
                status: 'failed',
                error: error.message
            });
        }
        
        // Test 2: Show tables
        try {
            const [rows] = await db.execute('SHOW TABLES');
            tests.push({
                test: 'Show tables',
                status: 'success',
                table_count: rows.length
            });
        } catch (error) {
            tests.push({
                test: 'Show tables',
                status: 'failed',
                error: error.message
            });
        }
        
        await db.end();
        
        res.json({
            success: true,
            message: 'Database tests completed',
            database: {
                host: `${dbConfig.host}:${dbConfig.port}`,
                user: dbConfig.user,
                database: dbConfig.database
            },
            tests: tests,
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        res.json({
            success: false,
            message: 'Database test failed',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Error handling
app.use((error, req, res, next) => {
    console.error('🚨 Express error:', error);
    stats.totalErrors++;
    
    res.status(500).json({
        error: true,
        message: 'Internal server error',
        timestamp: new Date().toISOString()
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: true,
        message: `Endpoint ${req.method} ${req.path} not found`,
        available_endpoints: [
            'GET /',
            'GET /api/ip',
            'GET /api/status',
            'GET /api/qr',
            'GET /api/qr/image',
            'GET /api/test-database',
            'POST /api/send-message'
        ]
    });
});

// Start server
const server = app.listen(PORT, HOST, () => {
    console.log('');
    console.log('🌟 =====================================');
    console.log('🎵 Tourbeest WhatsApp Service Started');
    console.log('🌟 =====================================');
    console.log(`📡 Server: http://${HOST}:${PORT}`);
    console.log(`🗄️  Database: ${dbConfig.database}@${dbConfig.host}:${dbConfig.port}`);
    console.log(`👤 DB User: ${dbConfig.user}`);
    console.log(`🌐 Platform: Render.com`);
    console.log(`⚙️  Environment: ${NODE_ENV}`);
    console.log(`🔧 Node.js: ${process.version}`);
    console.log('🌟 =====================================');
    console.log('');
    
    // Get and show IP address
    getExternalIP().then(ip => {
        console.log(`🌐 Current external IP: ${ip}`);
        console.log(`✅ Wildcard database access configured`);
    }).catch(err => {
        console.error('❌ Could not get IP:', err.message);
    });
    
    // Test database connection on startup
    console.log('🧪 Testing database connection...');
    connectDatabase().then(db => {
        if (db) {
            console.log('✅ Database connection test successful');
            db.end();
        } else {
            console.error('❌ Database connection test failed');
        }
    });
    
    // Initialize WhatsApp
    console.log('⏳ Starting WhatsApp client in 5 seconds...');
    setTimeout(initializeWhatsApp, 5000);
});

// Graceful shutdown
const gracefulShutdown = (signal) => {
    console.log(`📴 Received ${signal}, shutting down...`);
    
    server.close(async () => {
        console.log('🔌 HTTP server closed');
        
        if (whatsappClient) {
            try {
                await whatsappClient.destroy();
                console.log('📱 WhatsApp client closed');
            } catch (error) {
                console.error('❌ Error closing WhatsApp:', error.message);
            }
        }
        
        console.log('👋 Graceful shutdown completed');
        process.exit(0);
    });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers
process.on('uncaughtException', (error) => {
    console.error('💥 Uncaught Exception:', error);
    stats.totalErrors++;
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 Unhandled Rejection:', reason);
    stats.totalErrors++;
});

console.log('⏳ Tourbeest WhatsApp Service initializing...');
console.log('🔐 Database credentials configured');
console.log('📦 Using whatsapp-web.js official library');