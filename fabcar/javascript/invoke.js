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

async function submitRegistration(name, passwordHash, country) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('SubmitRegistration', name, passwordHash, country);
  console.log('SubmitRegistration transaction has been submitted');
  gateway.disconnect();
}

async function requestTokenRequest(name, networkAddress, passwordHash, country) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('RequestTokenRequest', name, networkAddress, passwordHash, country);
  console.log('RequestTokenRequest transaction has been submitted');
  gateway.disconnect();
}

async function approveTokenRequest(networkAddress) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('ApproveTokenRequest', networkAddress);
  console.log('ApproveTokenRequest transaction has been submitted');
  gateway.disconnect();
}

async function requestMintCoins(networkAddress, passwordHash, amount) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('RequestMintCoins', networkAddress, passwordHash, amount.toString());
  console.log('RequestMintCoins transaction has been submitted');
  gateway.disconnect();
}

async function approveMintRequest(requestID) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('ApproveMintRequest', requestID);
  console.log('ApproveMintRequest transaction has been submitted');
  gateway.disconnect();
}

async function registerCustomer(networkAddress, name, passwordHash, tokenID) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('RegisterCustomer', networkAddress, name, passwordHash, tokenID);
  console.log('RegisterCustomer transaction has been submitted');
  gateway.disconnect();
}

async function approveCustomerRegistration(requestID, ownerNetworkAddress) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('ApproveCustomerRegistration', requestID, ownerNetworkAddress);
  console.log('ApproveCustomerRegistration transaction has been submitted');
  gateway.disconnect();
}

async function customerRequestMint(networkAddress, tokenID, amount) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('CustomerRequestMint', networkAddress, tokenID, amount.toString());
  console.log('CustomerRequestMint transaction has been submitted');
  gateway.disconnect();
}

async function approveCustomerMint(requestID, ownerNetworkAddress) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('ApproveCustomerMint', requestID, ownerNetworkAddress);
  console.log('ApproveCustomerMint transaction has been submitted');
  gateway.disconnect();
}

async function createTransferRequest(senderID, receiverID, senderTokenTransferID, receiverTokenTransferID, tokenID, amount) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('CreateTransferRequest', senderID, receiverID, senderTokenTransferID, receiverTokenTransferID, tokenID, amount.toString());
  console.log('CreateTransferRequest transaction has been submitted');
  gateway.disconnect();
}

async function approveTransferByOwner(transferRequestID, approver) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('ApproveTransferByOwner', transferRequestID, approver);
  console.log('ApproveTransferByOwner transaction has been submitted');
  gateway.disconnect();
}

async function approveTransferByReceiver(transferRequestID, approver) {
  const { gateway, contract } = await connect();
  await contract.submitTransaction('ApproveTransferByReceiver', transferRequestID, approver);
  console.log('ApproveTransferByReceiver transaction has been submitted');
  gateway.disconnect();
}

module.exports = {
  submitRegistration,
  requestTokenRequest,
  approveTokenRequest,
  requestMintCoins,
  approveMintRequest,
  registerCustomer,
  approveCustomerRegistration,
  customerRequestMint,
  approveCustomerMint,
  createTransferRequest,
  approveTransferByOwner,
  approveTransferByReceiver,
};
