/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';



const FabricCAServices = require('fabric-ca-client');
const { Wallets, Gateway } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

async function main() {
  try {
    const name = process.argv[2];
    const password = process.argv[3];

    if (!name || !password) {
      console.error('Usage: node registerUser.js <name> <password>');
      process.exit(1);
    }

    // Load connection profile
    const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        
    const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

    // Setup Fabric CA client
    const caURL = ccp.certificateAuthorities['ca.org1.example.com'].url;
    const ca = new FabricCAServices(caURL);

    // Setup wallet to hold identities
    const walletPath = path.join(process.cwd(), 'wallet');
    const wallet = await Wallets.newFileSystemWallet(walletPath);

    // Check if user already exists
    if (await wallet.get(name)) {
      console.log(`User identity ${name} already exists in wallet`);
      return;
    }

    // Check admin identity for registration
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
      console.error('Admin identity not found in wallet. Please enroll admin first.');
      return;
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
    const nameHash = crypto.createHash('sha256').update(name).digest('hex');

    console.log(`User "${name}" registered and enrolled successfully.`);
    console.log(`Wallet identity created for user "${name}".`);
    console.log(`Network Address (SHA256 hash of name): ${nameHash}`);
    console.log(`Password Hash (SHA256): ${passwordHash}`);

  } catch (error) {
    console.error(`Error in registration: ${error}`);
  }
}

main();
