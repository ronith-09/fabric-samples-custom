/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');

const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

const walletPath = path.join(__dirname, 'wallet');
const chaincodeName = 'fabcar'; // Change to your chaincode name
const channelName = 'mychannel';

async function getContract(identity) {
  const wallet = await Wallets.newFileSystemWallet(walletPath);
  const gateway = new Gateway();
  await gateway.connect(ccp, { wallet, identity, discovery: { enabled: true, asLocalhost: true } });
  const network = await gateway.getNetwork(channelName);
  return { contract: network.getContract(chaincodeName), gateway };
}

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

async function submitRegistration(name, passwordHash, country) {
  const { contract, gateway } = await getContract(name);
  try {
    await contract.submitTransaction('SubmitRegistration', name, passwordHash, country);
    console.log('SubmitRegistration transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

// Add this async function (somewhere with the other async functions)

async function participantExists(networkAddress) {
  const { contract, gateway } = await getContract('admin'); // or any identity with access
  try {
    const resultBytes = await contract.evaluateTransaction('ParticipantExists', networkAddress);
    // result returned as bytes representing boolean string 'true' or 'false'
    const exists = resultBytes.toString() === 'true';
    console.log(`Participant Exists for networkAddress '${networkAddress}':`, exists);
  } finally {
    gateway.disconnect();
  }
}

async function requestTokenRequest(name, networkAddress, passwordHash, country) {
  const { contract, gateway } = await getContract(name);
  try {
    await contract.submitTransaction('RequestTokenRequest', name, networkAddress, passwordHash, country);
    console.log('RequestTokenRequest transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function approveTokenRequest(networkAddress) {
  const { contract, gateway } = await getContract('admin');
  try {
    await contract.submitTransaction('ApproveTokenRequest', networkAddress);
    console.log('ApproveTokenRequest transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function requestMintCoins(networkAddress, passwordHash, amount) {
  const { contract, gateway } = await getContract(networkAddress);
  try {
    await contract.submitTransaction('RequestMintCoins', networkAddress, passwordHash, amount.toString());
    console.log('RequestMintCoins transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function approveMintRequest(requestID) {
  const { contract, gateway } = await getContract('admin');
  try {
    await contract.submitTransaction('ApproveMintRequest', requestID);
    console.log('ApproveMintRequest transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function registerCustomer(networkAddress, name, passwordHash, tokenID) {
  const { contract, gateway } = await getContract(name);
  try {
    await contract.submitTransaction('RegisterCustomer', networkAddress, name, passwordHash, tokenID);
    console.log('RegisterCustomer transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function approveCustomerRegistration(requestID, ownerNetworkAddress) {
  const { contract, gateway } = await getContract('admin');
  try {
    await contract.submitTransaction('ApproveCustomerRegistration', requestID, ownerNetworkAddress);
    console.log('ApproveCustomerRegistration transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function customerRequestMint(networkAddress, tokenID, amount) {
  const { contract, gateway } = await getContract(networkAddress);
  try {
    await contract.submitTransaction('CustomerRequestMint', networkAddress, tokenID, amount.toString());
    console.log('CustomerRequestMint transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function approveCustomerMint(requestID, ownerNetworkAddress) {
  const { contract, gateway } = await getContract('admin');
  try {
    await contract.submitTransaction('ApproveCustomerMint', requestID, ownerNetworkAddress);
    console.log('ApproveCustomerMint transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function createTransferRequest(senderID, receiverID, senderTokenTransferID, receiverTokenTransferID, tokenID, amount) {
  const { contract, gateway } = await getContract(senderID);
  try {
    await contract.submitTransaction(
      'CreateTransferRequest',
      senderID,
      receiverID,
      senderTokenTransferID,
      receiverTokenTransferID,
      tokenID,
      amount.toString()
    );
    console.log('CreateTransferRequest transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function approveTransferByOwner(transferRequestID, approver) {
  const { contract, gateway } = await getContract(approver);
  try {
    await contract.submitTransaction('ApproveTransferByOwner', transferRequestID, approver);
    console.log('ApproveTransferByOwner transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function approveTransferByReceiver(transferRequestID, approver) {
  const { contract, gateway } = await getContract(approver);
  try {
    await contract.submitTransaction('ApproveTransferByReceiver', transferRequestID, approver);
    console.log('ApproveTransferByReceiver transaction has been submitted');
  } finally {
    gateway.disconnect();
  }
}

async function getPendingTokenRequests() {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('GetPendingTokenRequests');
    console.log('Pending Token Requests:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function getPendingMintRequests() {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('GetPendingMintRequests');
    console.log('Pending Mint Requests:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function getWalletInfo(networkAddress, passwordHash) {
  const { contract, gateway } = await getContract(networkAddress);
  try {
    const result = await contract.evaluateTransaction('GetWalletInfo', networkAddress, passwordHash);
    console.log('Wallet Info:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function viewAllTokens() {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('ViewAllTokens');
    console.log('All Tokens:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function viewPendingCustomerRegistrations(tokenID, ownerNetworkAddress) {
  const { contract, gateway } = await getContract(ownerNetworkAddress);
  try {
    const result = await contract.evaluateTransaction('ViewPendingCustomerRegistrations', tokenID, ownerNetworkAddress);
    console.log('Pending Customer Registrations:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function viewPendingCustomerMintRequests(tokenID, ownerNetworkAddress) {
  const { contract, gateway } = await getContract(ownerNetworkAddress);
  try {
    const result = await contract.evaluateTransaction('ViewPendingCustomerMintRequests', tokenID, ownerNetworkAddress);
    console.log('Pending Customer Mint Requests:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function viewCustomerWallet(networkAddress, tokenID, passwordHash) {
  const { contract, gateway } = await getContract(networkAddress);
  try {
    const result = await contract.evaluateTransaction('ViewCustomerWallet', networkAddress, tokenID, passwordHash);
    console.log('Customer Wallet:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function viewTransferRequestsForOwner(ownerID) {
  const { contract, gateway } = await getContract(ownerID);
  try {
    const result = await contract.evaluateTransaction('ViewTransferRequestsForOwner', ownerID);
    console.log('Transfer Requests For Owner:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function viewTransferRequestsForReceiver(receiverID) {
  const { contract, gateway } = await getContract(receiverID);
  try {
    const result = await contract.evaluateTransaction('ViewTransferRequestsForReceiver', receiverID);
    console.log('Transfer Requests For Receiver:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function getParticipantTransferHistory(participantTransferID) {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('GetParticipantTransferHistory', participantTransferID);
    console.log('Participant Transfer History:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function getParticipantTransferHistorybyowner(arg1, arg2, arg3) {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('GetParticipantTransferHistorybyowner', arg1, arg2, arg3);
    console.log('Participant Transfer History by Owner:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function getTokenTransferHistory(tokenID) {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('GetTokenTransferHistory', tokenID);
    console.log('Token Transfer History:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function getTokenParticipantsAndTransactions(tokenID, callerTransferID) {
  const { contract, gateway } = await getContract('admin');
  try {
    const result = await contract.evaluateTransaction('GetTokenParticipantsAndTransactions', tokenID, callerTransferID);
    console.log('Token Participants and Transactions:', JSON.parse(result.toString()));
  } finally {
    gateway.disconnect();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  try {
    switch (cmd) {
      case 'submitRegistration':
        await submitRegistration(args[1], args[2], args[3]);
        break;
      case 'participantExists':
        await participantExists(args[1]);
        break;

      case 'requestTokenRequest':
        await requestTokenRequest(args[1], args[2], args[3], args[4]);
        break;
      case 'approveTokenRequest':
        await approveTokenRequest(args[1]);
        break;
      case 'requestMintCoins':
        await requestMintCoins(args[1], args[2], args[3]);
        break;
      case 'approveMintRequest':
        await approveMintRequest(args[1]);
        break;
      case 'registerCustomer':
        await registerCustomer(args[1], args[2], args[3], args[4]);
        break;
      case 'approveCustomerRegistration':
        await approveCustomerRegistration(args[1], args[2]);
        break;
      case 'customerRequestMint':
        await customerRequestMint(args[1], args[2], args[3]);
        break;
      case 'approveCustomerMint':
        await approveCustomerMint(args[1], args[2]);
        break;
      case 'createTransferRequest':
        await createTransferRequest(args[1], args[2], args[3], args[4], args[5], args[6]);
        break;
      case 'approveTransferByOwner':
        await approveTransferByOwner(args[1], args[2]);
        break;
      case 'approveTransferByReceiver':
        await approveTransferByReceiver(args[1], args[2]);
        break;
      case 'getPendingTokenRequests':
        await getPendingTokenRequests();
        break;
      case 'getPendingMintRequests':
        await getPendingMintRequests();
        break;
      case 'getWalletInfo':
        await getWalletInfo(args[1], args[2]);
        break;
      case 'viewAllTokens':
        await viewAllTokens();
        break;
      case 'viewPendingCustomerRegistrations':
        await viewPendingCustomerRegistrations(args[1], args[2]);
        break;
      case 'viewPendingCustomerMintRequests':
        await viewPendingCustomerMintRequests(args[1], args[2]);
        break;
      case 'viewCustomerWallet':
        await viewCustomerWallet(args[1], args[2], args[3]);
        break;
      case 'viewTransferRequestsForOwner':
        await viewTransferRequestsForOwner(args[1]);
        break;
      case 'viewTransferRequestsForReceiver':
        await viewTransferRequestsForReceiver(args[1]);
        break;
      case 'getParticipantTransferHistory':
        await getParticipantTransferHistory(args[1]);
        break;
      case 'getParticipantTransferHistorybyowner':
        await getParticipantTransferHistorybyowner(args[1], args[2], args[3]);
        break;
      case 'getTokenTransferHistory':
        await getTokenTransferHistory(args[1]);
        break;
      case 'getTokenParticipantsAndTransactions':
        await getTokenParticipantsAndTransactions(args[1], args[2]);
        break;
      default:
        console.log('Available commands:');
        console.log(' submitRegistration <name> <passwordHash> <country>');
        console.log(' participantExists <networkAddress>');
        console.log(' requestTokenRequest <name> <networkAddress> <passwordHash> <country>');
        console.log(' approveTokenRequest <networkAddress>');
        console.log(' requestMintCoins <networkAddress> <passwordHash> <amount>');
        console.log(' approveMintRequest <requestID>');
        console.log(' registerCustomer <networkAddress> <name> <passwordHash> <tokenID>');
        console.log(' approveCustomerRegistration <requestID> <ownerNetworkAddress>');
        console.log(' customerRequestMint <networkAddress> <tokenID> <amount>');
        console.log(' approveCustomerMint <requestID> <ownerNetworkAddress>');
        console.log(' createTransferRequest <senderID> <receiverID> <senderTokenTransferID> <receiverTokenTransferID> <tokenID> <amount>');
        console.log(' approveTransferByOwner <transferRequestID> <approver>');
        console.log(' approveTransferByReceiver <transferRequestID> <approver>');
        console.log(' getPendingTokenRequests');
        console.log(' getPendingMintRequests');
        console.log(' getWalletInfo <networkAddress> <passwordHash>');
        console.log(' viewAllTokens');
        console.log(' viewPendingCustomerRegistrations <tokenID> <ownerNetworkAddress>');
        console.log(' viewPendingCustomerMintRequests <tokenID> <ownerNetworkAddress>');
        console.log(' viewCustomerWallet <networkAddress> <tokenID> <passwordHash>');
        console.log(' viewTransferRequestsForOwner <ownerID>');
        console.log(' viewTransferRequestsForReceiver <receiverID>');
        console.log(' getParticipantTransferHistory <participantTransferID>');
        console.log(' getParticipantTransferHistorybyowner <arg1> <arg2> <arg3>');
        console.log(' getTokenTransferHistory <tokenID>');
        console.log(' getTokenParticipantsAndTransactions <tokenID> <callerTransferID>');
    }
  } catch (err) {
    console.error('Error:', err);
  }
}

main();
