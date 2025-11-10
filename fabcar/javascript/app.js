'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

async function getWallet(walletPath) {
    return Wallets.newFileSystemWallet(walletPath);
}

async function connect(walletPath, userId) {
    const wallet = await getWallet(walletPath);
    if (!await wallet.get(userId)) {
        throw new Error(`Identity ${userId} not found in wallet`);
    }
    const gateway = new Gateway();
    await gateway.connect(ccp, { wallet, identity: userId, discovery: { enabled: true, asLocalhost: true } });
    const network = await gateway.getNetwork('mychannel'); // replace if needed
    const contract = network.getContract('fabcar'); // replace if needed
    return { gateway, contract };
}

async function submitRegistration(name, passwordHash, country, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.submitTransaction('SubmitRegistration', name, passwordHash, country);
        console.log(`SubmitRegistration result: ${result.toString()}`);
        return result.toString();
    } finally {
        gateway.disconnect();
    }
}

async function participantExists(networkAddress, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ParticipantExists', networkAddress);
        return result.toString() === 'true';
    } finally {
        gateway.disconnect();
    }
}

async function requestTokenRequest(name, networkAddress, passwordHash, country, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('RequestTokenRequest', name, networkAddress, passwordHash, country);
        console.log('Token request submitted');
    } finally {
        gateway.disconnect();
    }
}

async function getPendingTokenRequests(walletPath, adminId) {
    const { gateway, contract } = await connect(walletPath, adminId);
    try {
        const result = await contract.evaluateTransaction('GetPendingTokenRequests');
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function approveTokenRequest(networkAddress, walletPath, adminId) {
    const { gateway, contract } = await connect(walletPath, adminId);
    try {
        await contract.submitTransaction('ApproveTokenRequest', networkAddress);
        console.log('Token request approved');
    } finally {
        gateway.disconnect();
    }
}

async function getTokenAccess(networkAddress, passwordHash, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('GetTokenAccess', networkAddress, passwordHash);
        return result.toString();
    } finally {
        gateway.disconnect();
    }
}

async function requestMintCoins(networkAddress, passwordHash, amount, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('RequestMintCoins', networkAddress, passwordHash, amount.toString());
        console.log('Mint request submitted');
    } finally {
        gateway.disconnect();
    }
}

async function getPendingMintRequests(walletPath, adminId) {
    const { gateway, contract } = await connect(walletPath, adminId);
    try {
        const result = await contract.evaluateTransaction('GetPendingMintRequests');
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function approveMintRequest(requestId, walletPath, adminId) {
    const { gateway, contract } = await connect(walletPath, adminId);
    try {
        await contract.submitTransaction('ApproveMintRequest', requestId);
        console.log('Mint request approved');
    } finally {
        gateway.disconnect();
    }
}

async function getWalletInfo(networkAddress, passwordHash, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('GetWalletInfo', networkAddress, passwordHash);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function viewAllTokens(walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ViewAllTokens');
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function registerCustomer(networkAddress, name, passwordHash, tokenID, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('RegisterCustomer', networkAddress, name, passwordHash, tokenID);
        console.log('Customer registration submitted');
    } finally {
        gateway.disconnect();
    }
}

async function viewPendingCustomerRegistrations(tokenID, ownerNetworkAddress, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ViewPendingCustomerRegistrations', tokenID, ownerNetworkAddress);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function approveCustomerRegistration(requestId, ownerNetworkAddress, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('ApproveCustomerRegistration', requestId, ownerNetworkAddress);
        console.log('Customer registration approved');
    } finally {
        gateway.disconnect();
    }
}

async function customerRequestMint(networkAddress, tokenID, amount, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('CustomerRequestMint', networkAddress, tokenID, amount.toString());
        console.log('Customer mint request submitted');
    } finally {
        gateway.disconnect();
    }
}

async function viewPendingCustomerMintRequests(tokenID, ownerNetworkAddress, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ViewPendingCustomerMintRequests', tokenID, ownerNetworkAddress);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function approveCustomerMint(requestId, ownerNetworkAddress, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('ApproveCustomerMint', requestId, ownerNetworkAddress);
        console.log('Customer mint approved');
    } finally {
        gateway.disconnect();
    }
}

async function viewCustomerWallet(networkAddress, tokenID, passwordHash, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ViewCustomerWallet', networkAddress, tokenID, passwordHash);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function createTransferRequest(senderParticipantID, receiverParticipantID, senderTokenTransferID, receiverTokenTransferID, tokenID, amount, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const transferRequestID = await contract.submitTransaction(
            'CreateTransferRequest',
            senderParticipantID,
            receiverParticipantID,
            senderTokenTransferID,
            receiverTokenTransferID,
            tokenID,
            amount.toString()
        );
        console.log(`Transfer request created: ${transferRequestID.toString()}`);
        return transferRequestID.toString();
    } finally {
        gateway.disconnect();
    }
}

async function approveTransferByOwner(transferRequestID, approver, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('ApproveTransferByOwner', transferRequestID, approver);
        console.log('Transfer approved by owner');
    } finally {
        gateway.disconnect();
    }
}

async function approveTransferByReceiver(transferRequestID, approver, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        await contract.submitTransaction('ApproveTransferByReceiver', transferRequestID, approver);
        console.log('Transfer approved by receiver');
    } finally {
        gateway.disconnect();
    }
}

async function viewTransferRequestsForOwner(ownerID, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ViewTransferRequestsForOwner', ownerID);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function viewTransferRequestsForReceiver(receiverID, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('ViewTransferRequestsForReceiver', receiverID);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function getParticipantTransferHistory(participantTransferID, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('GetParticipantTransferHistory', participantTransferID);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function getTokenTransferHistory(tokenID, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('GetTokenTransferHistory', tokenID);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function getTokenParticipantsAndTransactions(tokenID, callerTransferID, walletPath, userId) {
    const { gateway, contract } = await connect(walletPath, userId);
    try {
        const result = await contract.evaluateTransaction('GetTokenParticipantsAndTransactions', tokenID, callerTransferID);
        return JSON.parse(result.toString());
    } finally {
        gateway.disconnect();
    }
}

async function getParticipantTransferHistorybyowner(participantTransferID, walletPath, userId) {
  const { gateway, contract } = await connect(walletPath, userId);
  try {
    const result = await contract.evaluateTransaction('GetParticipantTransferHistorybyowner', participantTransferID);
    return JSON.parse(result.toString());
  } finally {
    gateway.disconnect();
  }
}


module.exports = {
    submitRegistration,
    participantExists,
    requestTokenRequest,
    getPendingTokenRequests,
    approveTokenRequest,
    getTokenAccess,
    requestMintCoins,
    getPendingMintRequests,
    approveMintRequest,
    getWalletInfo,
    viewAllTokens,
    registerCustomer,
    viewPendingCustomerRegistrations,
    approveCustomerRegistration,
    customerRequestMint,
    viewPendingCustomerMintRequests,
    approveCustomerMint,
    viewCustomerWallet,
    createTransferRequest,
    approveTransferByOwner,
    approveTransferByReceiver,
    viewTransferRequestsForOwner,
    viewTransferRequestsForReceiver,
    getParticipantTransferHistory,
    getTokenTransferHistory,
    getTokenParticipantsAndTransactions,
    getParticipantTransferHistorybyowner,
};
