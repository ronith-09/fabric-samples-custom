/*
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict';

const { Gateway, Wallets } = require('fabric-network');
const path = require('path');
const fs = require('fs');

async function connect() {
  const ccpPath = path.resolve(__dirname, '..', '..', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
  const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

  const walletPath = path.join(process.cwd(), 'wallet');
  const wallet = await Wallets.newFileSystemWallet(walletPath);

  const identity = await wallet.get('appUser');
  if (!identity) {
    throw new Error('An identity for the user "appUser" does not exist in the wallet');
  }

  const gateway = new Gateway();
  await gateway.connect(ccp, { wallet, identity: 'appUser', discovery: { enabled: true, asLocalhost: true } });
  const network = await gateway.getNetwork('mychannel');
  const contract = network.getContract('fabcar');

  return { gateway, contract };
}

async function getPendingTokenRequests() {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('GetPendingTokenRequests');
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function getPendingMintRequests() {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('GetPendingMintRequests');
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function getWalletInfo(networkAddress, passwordHash) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('GetWalletInfo', networkAddress, passwordHash);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function viewAllTokens() {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('ViewAllTokens');
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function viewPendingCustomerRegistrations(tokenID, ownerNetworkAddress) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('ViewPendingCustomerRegistrations', tokenID, ownerNetworkAddress);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function viewPendingCustomerMintRequests(tokenID, ownerNetworkAddress) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('ViewPendingCustomerMintRequests', tokenID, ownerNetworkAddress);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function viewCustomerWallet(networkAddress, tokenID, passwordHash) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('ViewCustomerWallet', networkAddress, tokenID, passwordHash);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function viewTransferRequestsForOwner(ownerID) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('ViewTransferRequestsForOwner', ownerID);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function viewTransferRequestsForReceiver(receiverID) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('ViewTransferRequestsForReceiver', receiverID);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function getParticipantTransferHistory(participantTransferID) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('GetParticipantTransferHistory', participantTransferID);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function getTokenTransferHistory(tokenID) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('GetTokenTransferHistory', tokenID);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

async function getTokenParticipantsAndTransactions(tokenID, callerTransferID) {
  const { gateway, contract } = await connect();
  const result = await contract.evaluateTransaction('GetTokenParticipantsAndTransactions', tokenID, callerTransferID);
  gateway.disconnect();
  return JSON.parse(result.toString());
}

module.exports = {
  getPendingTokenRequests,
  getPendingMintRequests,
  getWalletInfo,
  viewAllTokens,
  viewPendingCustomerRegistrations,
  viewPendingCustomerMintRequests,
  viewCustomerWallet,
  viewTransferRequestsForOwner,
  viewTransferRequestsForReceiver,
  getParticipantTransferHistory,
  getTokenTransferHistory,
  getTokenParticipantsAndTransactions,
};
