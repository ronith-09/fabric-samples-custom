'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const bodyParser = require('body-parser');

// Import app functions and configuration. Try ./app first, then fallback to ./app.js.bak.
let appFunctions;
let config = {};

// Allow running the backend in a demo mode that does not load Fabric integrations.
// Set environment variable FABCAR_DEMO=true to enable demo mode.
if (process.env.FABCAR_DEMO === 'true') {
    console.warn('FABCAR_DEMO is set: running in demo mode (Fabric integration disabled)');
    appFunctions = {}; // empty object -> server will use demo responses
} else {
    try {
        try {
            // Prefer the normal app.js
            appFunctions = require('./app');
        } catch (innerErr) {
            // If ./app isn't present, try app.js.bak as requested
            console.warn('Could not load ./app, attempting to load ./app.js.bak');
            try {
                appFunctions = require('./app.js.bak');
                console.log('Loaded ./app.js.bak successfully');
            } catch (bakErr) {
                console.error('Fatal: Could not load ./app or ./app.js.bak. Backend requires the real app functions to run.');
                console.error(bakErr && bakErr.message ? bakErr.message : bakErr);
                process.exit(1);
            }
        }

        if (!appFunctions || Object.keys(appFunctions).length === 0) {
            console.error('Error: app module did not export any functions. Ensure the module exports the Fabric functions.');
            process.exit(1);
        }
    } catch (e) {
        console.error('Fatal error while loading app functions:', e && e.message ? e.message : e);
        process.exit(1);
    }
}

try {
    config = require('../config.local');
} catch (e) {
    console.warn('Warning: Could not load config.local.js, using minimal defaults');
    config = {
        api: { port: 3000, host: 'localhost' },
        wallet: { path: path.join(__dirname, 'wallet') },
        security: { passwordHashAlgorithm: 'sha256' }
    };
}

const app = express();
const port = process.env.PORT || config.api.port || 3000;

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Simple request logging middleware (writes concise access logs to /tmp/backend_access.log)
app.use((req, res, next) => {
    const start = Date.now();
    res.on('finish', () => {
        try {
            const entry = {
                time: new Date().toISOString(),
                method: req.method,
                url: req.originalUrl,
                status: res.statusCode,
                duration_ms: Date.now() - start,
                ip: req.ip
            };
            fs.appendFileSync('/tmp/backend_access.log', JSON.stringify(entry) + '\n');
        } catch (e) {
            // ignore logging errors
        }
    });
    next();
});

// Wallet path
const walletPath = config.wallet.path;

// Helper function to hash password
function hashPassword(password) {
    return crypto.createHash(config.security.passwordHashAlgorithm).update(password).digest('hex');
}

// Demo response helper (when app.js is not available)
function demoResponse(functionName, params) {
    return {
        success: true,
        message: `${functionName} executed successfully (demo mode)`,
        data: { functionName, params, timestamp: new Date() }
    };
}

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'Backend server is running', timestamp: new Date() });
});

// ============ Registration Endpoints ============

/**
 * POST /api/register
 * Register a participant with credentials
 */
app.post('/api/register', async (req, res) => {
    try {
        const { userId, name, password, country } = req.body;

        if (!userId || !name || !password || !country) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, name, password, country'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.submitRegistration) {
            const result = await appFunctions.submitRegistration(name, passwordHash, country, walletPath, userId);
            res.json({
                success: true,
                message: 'Participant registered successfully',
                networkAddress: result
            });
        } else {
            res.json({
                success: true,
                message: 'Participant registered successfully',
                networkAddress: 'ADDR-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                mode: 'demo'
            });
        }
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/wallet/register-user
 * Register and enroll a new user via Fabric CA (backend equivalent of registerUser.js)
 * Accepts { name, password } and returns the network_address and password_hash
 */
app.post('/api/wallet/register-user', async (req, res) => {
    try {
        const { name, password } = req.body;

        if (!name || !password) {
            return res.status(400).json({ success: false, detail: 'Missing name or password' });
        }

        if (!Wallets) {
            return res.status(400).json({ success: false, detail: 'Fabric network not available' });
        }

        // Load connection profile
        const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        
        if (!fs.existsSync(ccpPath)) {
            return res.status(500).json({ success: false, detail: 'Connection profile not found' });
        }

        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
        const FabricCAServices = require('fabric-ca-client');
        const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
        const ca = new FabricCAServices(caURL);

        const wallet = await Wallets.newFileSystemWallet(walletPath);

        // Check if user already exists
        if (await wallet.get(name)) {
            return res.status(400).json({ success: false, detail: `User identity ${name} already exists in wallet` });
        }

        // Check admin identity for registration
        const adminIdentity = await wallet.get('admin');
        if (!adminIdentity) {
            return res.status(500).json({ success: false, detail: 'Admin identity not found in wallet. Please enroll admin first.' });
        }

        const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
        const adminUser = await provider.getUserContext(adminIdentity, 'admin');

        // Register the user (enrollment secret)
        const secret = await ca.register({ affiliation: 'org1.department1', enrollmentID: name, role: 'client' }, adminUser);

        // Enroll the user using secret
        const enrollment = await ca.enroll({ enrollmentID: name, enrollmentSecret: secret });

        // Import user identity into wallet
        const identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes(),
            },
            mspId: 'Org1MSP',
            type: 'X.509',
        };
        await wallet.put(name, identity);

        // Compute SHA256 password hash
        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

        // Compute user network address (SHA256 of name)
        const networkAddress = crypto.createHash('sha256').update(name).digest('hex');

        res.json({
            success: true,
            name,
            network_address: networkAddress,
            password_hash: passwordHash,
            message: `User "${name}" registered and enrolled successfully.`
        });
    } catch (error) {
        console.error('Wallet register-user error:', error);
        res.status(500).json({
            success: false,
            detail: error.message || 'Failed to register user'
        });
    }
});

/**
 * Compatibility endpoint for frontend: POST /api/auth/register
 * Accepts { name, password, role } and returns a user object expected by the frontend
 * If Fabric is available, calls registerUser flow to enroll identity in wallet
 */
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, password, role = 'customer' } = req.body;

        if (!name || !password) {
            return res.status(400).json({ success: false, detail: 'Missing name or password' });
        }

        const userId = (name || 'user').replace(/\s+/g, '_').toLowerCase();
        const passwordHash = hashPassword(password);
        let networkAddress;

        // Try to register/enroll the user via Fabric CA (uses wallet registration flow)
        if (Wallets && Object.keys(appFunctions).length > 0) {
            try {
                const FabricCAServices = require('fabric-ca-client');
                const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
                
                if (fs.existsSync(ccpPath)) {
                    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));
                    const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
                    const ca = new FabricCAServices(caURL);

                    const wallet = await Wallets.newFileSystemWallet(walletPath);

                    // Check if user already exists
                    if (!await wallet.get(userId)) {
                        // Check admin identity for registration
                        const adminIdentity = await wallet.get('admin');
                        if (adminIdentity) {
                            try {
                                const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
                                const adminUser = await provider.getUserContext(adminIdentity, 'admin');

                                // Register the user (enrollment secret)
                                const secret = await ca.register({ affiliation: 'org1.department1', enrollmentID: userId, role: 'client' }, adminUser);

                                // Enroll the user using secret
                                const enrollment = await ca.enroll({ enrollmentID: userId, enrollmentSecret: secret });

                                // Import user identity into wallet
                                const identity = {
                                    credentials: {
                                        certificate: enrollment.certificate,
                                        privateKey: enrollment.key.toBytes(),
                                    },
                                    mspId: 'Org1MSP',
                                    type: 'X.509',
                                };
                                await wallet.put(userId, identity);

                                console.log(`User "${userId}" registered and enrolled successfully via Fabric CA.`);
                            } catch (caError) {
                                console.warn('CA registration failed, will use demo mode:', caError.message);
                            }
                        }
                    }
                }
            } catch (fabricError) {
                console.warn('Fabric registration setup failed, using demo mode:', fabricError.message);
            }
        }

        // Compute network address
        networkAddress = crypto.createHash('sha256').update(name).digest('hex');

        // Create a lightweight token for frontend sessions
        const token = 'token-' + crypto.randomBytes(8).toString('hex');

        const userObj = {
            token,
            name,
            role,
            network_address: networkAddress,
        };

        // Frontend expects network_address (snake_case) and token
        res.json(userObj);
    } catch (error) {
        console.error('Auth register error:', error);
        res.status(500).json({ success: false, detail: error.message });
    }
});

/**
 * GET /api/participant/:networkAddress
 * Check if participant exists
 */
app.get('/api/participant/:networkAddress', async (req, res) => {
    try {
        const { networkAddress } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.participantExists) {
            const exists = await appFunctions.participantExists(networkAddress, walletPath, userId);
            res.json({ success: true, networkAddress, exists });
        } else {
            res.json({ success: true, networkAddress, exists: true, mode: 'demo' });
        }
    } catch (error) {
        console.error('Participant check error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ============ Token Request Endpoints ============

/**
 * POST /api/token-request
 * Request a new token
 */
app.post('/api/token-request', async (req, res) => {
    try {
        const { userId, name, networkAddress, password, country } = req.body;

        if (!userId || !name || !networkAddress || !password || !country) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.requestTokenRequest) {
            await appFunctions.requestTokenRequest(name, networkAddress, passwordHash, country, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Token request submitted successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Token request error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * Compatibility endpoint for frontend login: POST /api/auth/login
 * Accepts { network_address, password } and returns a user object with token and role
 */
app.post('/api/auth/login', async (req, res) => {
    try {
        const { network_address, password } = req.body;

        if (!network_address || !password) {
            return res.status(400).json({ success: false, detail: 'Missing network_address or password' });
        }

        const passwordHash = hashPassword(password);

        // Attempt to get token access (production) — falls back to demo
        if (Object.keys(appFunctions).length > 0 && appFunctions.getTokenAccess) {
            try {
                const access = await appFunctions.getTokenAccess(network_address, passwordHash, walletPath, 'web');
                // Map access to frontend shape
                const token = access && access.tokenID ? access.tokenID : ('token-' + crypto.randomBytes(8).toString('hex'));
                const userObj = {
                    token,
                    network_address,
                    role: 'customer'
                };
                return res.json(userObj);
            } catch (e) {
                console.error('Auth login (fabric) error:', e);
                // fall through to demo response
            }
        }

        // Demo response
        const demoToken = 'token-' + crypto.randomBytes(8).toString('hex');
        res.json({ token: demoToken, network_address, role: 'customer' });
    } catch (error) {
        console.error('Auth login error:', error);
        res.status(500).json({ success: false, detail: error.message });
    }
});

/**
 * GET /api/token-requests/pending
 * Get pending token requests (admin only)
 */
app.get('/api/token-requests/pending', async (req, res) => {
    try {
        const { adminId } = req.query;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: 'Missing adminId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.getPendingTokenRequests) {
            const requests = await appFunctions.getPendingTokenRequests(walletPath, adminId);
            res.json({ success: true, requests });
        } else {
            res.json({ success: true, requests: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get pending token requests error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/token-requests/:networkAddress/approve
 * Approve a token request (admin only)
 */
app.post('/api/token-requests/:networkAddress/approve', async (req, res) => {
    try {
        const { networkAddress } = req.params;
        const { adminId } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: 'Missing adminId'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.approveTokenRequest) {
            await appFunctions.approveTokenRequest(networkAddress, walletPath, adminId);
        }

        res.json({
            success: true,
            message: 'Token request approved successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Approve token request error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ Token Access Endpoints ============

/**
 * POST /api/token-access
 * Get token access
 */
app.post('/api/token-access', async (req, res) => {
    try {
        const { userId, networkAddress, password } = req.body;

        if (!userId || !networkAddress || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: userId, networkAddress, password'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.getTokenAccess) {
            const access = await appFunctions.getTokenAccess(networkAddress, passwordHash, walletPath, userId);
            res.json({ success: true, access });
        } else {
            res.json({ success: true, access: { tokenID: 'TOKEN-DEMO', approved: true }, mode: 'demo' });
        }
    } catch (error) {
        console.error('Get token access error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ Minting Endpoints ============

/**
 * POST /api/mint-request
 * Request to mint coins
 */
app.post('/api/mint-request', async (req, res) => {
    try {
        const { userId, networkAddress, password, amount } = req.body;

        if (!userId || !networkAddress || !password || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.requestMintCoins) {
            await appFunctions.requestMintCoins(networkAddress, passwordHash, amount, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Mint request submitted successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Mint request error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/mint-requests/pending
 * Get pending mint requests (admin only)
 */
app.get('/api/mint-requests/pending', async (req, res) => {
    try {
        const { adminId } = req.query;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: 'Missing adminId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.getPendingMintRequests) {
            const requests = await appFunctions.getPendingMintRequests(walletPath, adminId);
            res.json({ success: true, requests });
        } else {
            res.json({ success: true, requests: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get pending mint requests error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/mint-requests/:requestId/approve
 * Approve a mint request (admin only)
 */
app.post('/api/mint-requests/:requestId/approve', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { adminId } = req.body;

        if (!adminId) {
            return res.status(400).json({
                success: false,
                error: 'Missing adminId'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.approveMintRequest) {
            await appFunctions.approveMintRequest(requestId, walletPath, adminId);
        }

        res.json({
            success: true,
            message: 'Mint request approved successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Approve mint request error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ Wallet Endpoints ============

/**
 * Wallet API compatibility for frontend's WalletConnect
 * - GET /api/wallet/check-fabric
 * - GET /api/wallet/list-identities
 * - POST /api/wallet/connect
 * - POST /api/wallet/create-identity
 * - POST /api/wallet/import-identity
 */
const { Wallets } = (() => {
    try {
        return require('fabric-network');
    } catch (e) {
        return { Wallets: null };
    }
})();

app.get('/api/wallet/check-fabric', async (req, res) => {
    try {
        if (!Wallets) return res.json({ fabric_available: false });
        const wallet = await Wallets.newFileSystemWallet(walletPath);
        const identities = await wallet.list();
        res.json({ fabric_available: true, count: identities.length });
    } catch (e) {
        console.error('check-fabric error:', e.message || e);
        res.json({ fabric_available: false });
    }
});

app.get('/api/wallet/list-identities', async (req, res) => {
    try {
        if (!Wallets) return res.json({ identities: [] });
        // The Wallets API may return identity entries without a `label` depending on the
        // implementation/version. To ensure the frontend gets usable labels and network
        // addresses, read identities from the filesystem wallet directory and map them.
        const walletDir = walletPath;
        const files = fs.existsSync(walletDir) ? fs.readdirSync(walletDir) : [];
        const identities = [];
        for (const f of files) {
            if (!f.endsWith('.id')) continue;
            const label = path.basename(f, '.id');
            try {
                const content = fs.readFileSync(path.join(walletDir, f), 'utf8');
                const parsed = JSON.parse(content);
                identities.push({ label, mspId: parsed.mspId || parsed.mspID || 'Org1MSP' });
            } catch (e) {
                identities.push({ label, mspId: 'Org1MSP' });
            }
        }

        const mapped = identities.map(id => ({ label: id.label, mspId: id.mspId, network_address: (id.label ? crypto.createHash('sha256').update(id.label).digest('hex') : null) }));
        res.json({ identities: mapped });
    } catch (e) {
        console.error('list-identities error:', e.message || e);
        res.json({ identities: [] });
    }
});

app.post('/api/wallet/connect', async (req, res) => {
    try {
        const { identity_label } = req.body;
        if (!identity_label) return res.status(400).json({ success: false, detail: 'Missing identity_label' });

        if (!Wallets) {
            // Demo connect
            const network_address = crypto.createHash('sha256').update(identity_label).digest('hex');
            return res.json({ token: 'token-' + crypto.randomBytes(8).toString('hex'), label: identity_label, network_address, mspId: 'Org1MSP' });
        }

        const wallet = await Wallets.newFileSystemWallet(walletPath);
        const identity = await wallet.get(identity_label);
        if (!identity) return res.status(404).json({ success: false, detail: 'Identity not found' });

        const network_address = crypto.createHash('sha256').update(identity_label).digest('hex');
        res.json({ token: 'token-' + crypto.randomBytes(8).toString('hex'), label: identity_label, network_address, mspId: identity.mspId || 'Org1MSP' });
    } catch (e) {
        console.error('connect wallet error:', e.message || e);
        res.status(500).json({ success: false, detail: e.message });
    }
});

app.post('/api/wallet/create-identity', async (req, res) => {
    try {
        const { name, password, role = 'customer' } = req.body;
        if (!name || !password) return res.status(400).json({ success: false, detail: 'Missing name or password' });

        // If Fabric is available, instruct the user to run registerUser script or create via CA; for now create a mock identity
        const network_address = crypto.createHash('sha256').update(name).digest('hex');
        const token = 'token-' + crypto.randomBytes(8).toString('hex');
        // Optionally, if appFunctions exposes a helper to create identity, we could call it.
        res.json({ token, name, network_address, role });
    } catch (e) {
        console.error('create-identity error:', e.message || e);
        res.status(500).json({ success: false, detail: e.message });
    }
});

app.post('/api/wallet/import-identity', async (req, res) => {
    try {
        const { name, certificate, private_key, password, role = 'customer' } = req.body;
        if (!name || !certificate || !private_key) return res.status(400).json({ success: false, detail: 'Missing required fields' });

        if (Wallets) {
            const wallet = await Wallets.newFileSystemWallet(walletPath);
            const identity = {
                credentials: { certificate, privateKey: private_key },
                mspId: 'Org1MSP',
                type: 'X.509'
            };
            await wallet.put(name, identity);
            const network_address = crypto.createHash('sha256').update(name).digest('hex');
            return res.json({ success: true, name, network_address });
        }

        // Demo import
        const network_address = crypto.createHash('sha256').update(name).digest('hex');
        res.json({ success: true, name, network_address });
    } catch (e) {
        console.error('import-identity error:', e.message || e);
        res.status(500).json({ success: false, detail: e.message });
    }
});

/**
 * GET /api/wallet/:networkAddress
 * Get wallet information
 */
app.get('/api/wallet/:networkAddress', async (req, res) => {
    try {
        const { networkAddress } = req.params;
        const { userId, password } = req.query;

        if (!userId || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or password'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.getWalletInfo) {
            const walletInfo = await appFunctions.getWalletInfo(networkAddress, passwordHash, walletPath, userId);
            res.json({ success: true, walletInfo });
        } else {
            res.json({ success: true, walletInfo: { balance: 0, tokenID: 'TOKEN-DEMO' }, mode: 'demo' });
        }
    } catch (error) {
        console.error('Get wallet info error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/tokens
 * View all tokens
 */
app.get('/api/tokens', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.viewAllTokens) {
            const tokens = await appFunctions.viewAllTokens(walletPath, userId);
            res.json({ success: true, tokens });
        } else {
            res.json({ success: true, tokens: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('View all tokens error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ Customer Registration Endpoints ============

/**
 * POST /api/customer-register
 * Register a customer
 */
app.post('/api/customer-register', async (req, res) => {
    try {
        const { userId, networkAddress, name, password, tokenID } = req.body;

        if (!userId || !networkAddress || !name || !password || !tokenID) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.registerCustomer) {
            await appFunctions.registerCustomer(networkAddress, name, passwordHash, tokenID, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Customer registration submitted successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Customer registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/customer-registrations/pending
 * Get pending customer registrations
 */
app.get('/api/customer-registrations/pending', async (req, res) => {
    try {
        const { userId, tokenID, ownerNetworkAddress } = req.query;

        if (!userId || !tokenID || !ownerNetworkAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.viewPendingCustomerRegistrations) {
            const registrations = await appFunctions.viewPendingCustomerRegistrations(tokenID, ownerNetworkAddress, walletPath, userId);
            res.json({ success: true, registrations });
        } else {
            res.json({ success: true, registrations: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get pending customer registrations error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/customer-registrations/:requestId/approve
 * Approve customer registration
 */
app.post('/api/customer-registrations/:requestId/approve', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { userId, ownerNetworkAddress } = req.body;

        if (!userId || !ownerNetworkAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or ownerNetworkAddress'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.approveCustomerRegistration) {
            await appFunctions.approveCustomerRegistration(requestId, ownerNetworkAddress, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Customer registration approved successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Approve customer registration error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ Customer Minting Endpoints ============

/**
 * POST /api/customer-mint-request
 * Customer requests to mint
 */
app.post('/api/customer-mint-request', async (req, res) => {
    try {
        const { userId, networkAddress, tokenID, amount } = req.body;

        if (!userId || !networkAddress || !tokenID || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.customerRequestMint) {
            await appFunctions.customerRequestMint(networkAddress, tokenID, amount, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Customer mint request submitted successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Customer mint request error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/customer-mint-requests/pending
 * Get pending customer mint requests
 */
app.get('/api/customer-mint-requests/pending', async (req, res) => {
    try {
        const { userId, tokenID, ownerNetworkAddress } = req.query;

        if (!userId || !tokenID || !ownerNetworkAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.viewPendingCustomerMintRequests) {
            const requests = await appFunctions.viewPendingCustomerMintRequests(tokenID, ownerNetworkAddress, walletPath, userId);
            res.json({ success: true, requests });
        } else {
            res.json({ success: true, requests: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get pending customer mint requests error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/customer-mint-requests/:requestId/approve
 * Approve customer mint request
 */
app.post('/api/customer-mint-requests/:requestId/approve', async (req, res) => {
    try {
        const { requestId } = req.params;
        const { userId, ownerNetworkAddress } = req.body;

        if (!userId || !ownerNetworkAddress) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or ownerNetworkAddress'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.approveCustomerMint) {
            await appFunctions.approveCustomerMint(requestId, ownerNetworkAddress, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Customer mint approved successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Approve customer mint error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/customer-wallet/:networkAddress
 * Get customer wallet information
 */
app.get('/api/customer-wallet/:networkAddress', async (req, res) => {
    try {
        const { networkAddress } = req.params;
        const { userId, tokenID, password } = req.query;

        if (!userId || !tokenID || !password) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters'
            });
        }

        const passwordHash = hashPassword(password);
        
        if (Object.keys(appFunctions).length > 0 && appFunctions.viewCustomerWallet) {
            const walletInfo = await appFunctions.viewCustomerWallet(networkAddress, tokenID, passwordHash, walletPath, userId);
            res.json({ success: true, walletInfo });
        } else {
            res.json({ success: true, walletInfo: { balance: 0, tokenID }, mode: 'demo' });
        }
    } catch (error) {
        console.error('Get customer wallet error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ Transfer Endpoints ============

/**
 * POST /api/transfer-request
 * Create a transfer request
 */
app.post('/api/transfer-request', async (req, res) => {
    try {
        const { userId, senderParticipantID, receiverParticipantID, senderTokenTransferID, receiverTokenTransferID, tokenID, amount } = req.body;

        if (!userId || !senderParticipantID || !receiverParticipantID || !senderTokenTransferID || !receiverTokenTransferID || !tokenID || !amount) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.createTransferRequest) {
            const transferRequestID = await appFunctions.createTransferRequest(
                senderParticipantID,
                receiverParticipantID,
                senderTokenTransferID,
                receiverTokenTransferID,
                tokenID,
                amount,
                walletPath,
                userId
            );
            res.json({
                success: true,
                message: 'Transfer request created successfully',
                transferRequestID
            });
        } else {
            res.json({
                success: true,
                message: 'Transfer request created successfully',
                transferRequestID: 'TRANSFER-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
                mode: 'demo'
            });
        }
    } catch (error) {
        console.error('Create transfer request error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/transfer-requests/:transferRequestID/approve-owner
 * Approve transfer by owner
 */
app.post('/api/transfer-requests/:transferRequestID/approve-owner', async (req, res) => {
    try {
        const { transferRequestID } = req.params;
        const { userId, approver } = req.body;

        if (!userId || !approver) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or approver'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.approveTransferByOwner) {
            await appFunctions.approveTransferByOwner(transferRequestID, approver, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Transfer approved by owner successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Approve transfer by owner error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * POST /api/transfer-requests/:transferRequestID/approve-receiver
 * Approve transfer by receiver
 */
app.post('/api/transfer-requests/:transferRequestID/approve-receiver', async (req, res) => {
    try {
        const { transferRequestID } = req.params;
        const { userId, approver } = req.body;

        if (!userId || !approver) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or approver'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.approveTransferByReceiver) {
            await appFunctions.approveTransferByReceiver(transferRequestID, approver, walletPath, userId);
        }

        res.json({
            success: true,
            message: 'Transfer approved by receiver successfully',
            mode: Object.keys(appFunctions).length === 0 ? 'demo' : 'production'
        });
    } catch (error) {
        console.error('Approve transfer by receiver error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/transfer-requests/owner/:ownerID
 * Get transfer requests for owner
 */
app.get('/api/transfer-requests/owner/:ownerID', async (req, res) => {
    try {
        const { ownerID } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.viewTransferRequestsForOwner) {
            const requests = await appFunctions.viewTransferRequestsForOwner(ownerID, walletPath, userId);
            res.json({ success: true, requests });
        } else {
            res.json({ success: true, requests: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get transfer requests for owner error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/transfer-requests/receiver/:receiverID
 * Get transfer requests for receiver
 */
app.get('/api/transfer-requests/receiver/:receiverID', async (req, res) => {
    try {
        const { receiverID } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.viewTransferRequestsForReceiver) {
            const requests = await appFunctions.viewTransferRequestsForReceiver(receiverID, walletPath, userId);
            res.json({ success: true, requests });
        } else {
            res.json({ success: true, requests: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get transfer requests for receiver error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// ============ History Endpoints ============

/**
 * GET /api/transfer-history/participant/:participantTransferID
 * Get participant transfer history
 */
app.get('/api/transfer-history/participant/:participantTransferID', async (req, res) => {
    try {
        const { participantTransferID } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.getParticipantTransferHistory) {
            const history = await appFunctions.getParticipantTransferHistory(participantTransferID, walletPath, userId);
            res.json({ success: true, history });
        } else {
            res.json({ success: true, history: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get participant transfer history error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/transfer-history/token/:tokenID
 * Get token transfer history
 */
app.get('/api/transfer-history/token/:tokenID', async (req, res) => {
    try {
        const { tokenID } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.getTokenTransferHistory) {
            const history = await appFunctions.getTokenTransferHistory(tokenID, walletPath, userId);
            res.json({ success: true, history });
        } else {
            res.json({ success: true, history: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get token transfer history error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/token-participants/:tokenID
 * Get token participants and transactions
 */
app.get('/api/token-participants/:tokenID', async (req, res) => {
    try {
        const { tokenID } = req.params;
        const { userId, callerTransferID } = req.query;

        if (!userId || !callerTransferID) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId or callerTransferID parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.getTokenParticipantsAndTransactions) {
            const data = await appFunctions.getTokenParticipantsAndTransactions(tokenID, callerTransferID, walletPath, userId);
            res.json({ success: true, data });
        } else {
            res.json({ success: true, data: { participants: [], transactions: [] }, mode: 'demo' });
        }
    } catch (error) {
        console.error('Get token participants error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

/**
 * GET /api/transfer-history/owner/:participantTransferID
 * Get participant transfer history by owner
 */
app.get('/api/transfer-history/owner/:participantTransferID', async (req, res) => {
    try {
        const { participantTransferID } = req.params;
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'Missing userId parameter'
            });
        }

        if (Object.keys(appFunctions).length > 0 && appFunctions.getParticipantTransferHistorybyowner) {
            const history = await appFunctions.getParticipantTransferHistorybyowner(participantTransferID, walletPath, userId);
            res.json({ success: true, history });
        } else {
            res.json({ success: true, history: [], mode: 'demo' });
        }
    } catch (error) {
        console.error('Get participant transfer history by owner error:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found'
    });
});

// Start server
app.listen(port, () => {
    console.log(`FabCar Backend Server running on http://localhost:${port}`);
    console.log(`API Documentation available at http://localhost:${port}/api/health`);
});

module.exports = app;
