package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"

	"github.com/google/uuid"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

type Participant struct {
	Name           string   `json:"name"`
	NetworkAddress string   `json:"network_address"`
	ClientID       string   `json:"client_id"`
	Approved       bool     `json:"approved"`
	PasswordHash   string   `json:"password_hash"`
	Country        string   `json:"country"`
	TokenID        string   `json:"token_id"`
	TransferIDs    []string `json:"transfer_ids"`
}

type Token struct {
	TokenID     string   `json:"token_id"`
	Owner       string   `json:"owner"`
	Available   bool     `json:"available"`
	Minted      int      `json:"minted"`
	TransferIDs []string `json:"transfer_ids"`
}

type TokenRequest struct {
	RequestID   string `json:"request_id"`
	NetworkAddr string `json:"network_addr"`
	Status      string `json:"status"` // PENDING, APPROVED
	TokenID     string `json:"token_id"`
}

type MintRequest struct {
	RequestID   string `json:"request_id"`
	TokenID     string `json:"token_id"`
	RequestedBy string `json:"requested_by"`
	Amount      int    `json:"amount"`
	Approved    bool   `json:"approved"`
}

// Customer struct to track customer info linked to a token
type Customer struct {
	NetworkAddress   string   `json:"network_address"`
	Name             string   `json:"name"`
	PasswordHash     string   `json:"password_hash"`
	TokenID          string   `json:"token_id"`
	Approved         bool     `json:"approved"`
	Balance          int      `json:"balance"`
	TransferIDs      []string `json:"transfer_ids"` // List of transfer IDs related to customer
	TokenTransferIDs []string `json:"token_transfer_ids"`
}

// RegisterCustomerRequest for pending customer registrations
type RegisterCustomerRequest struct {
	RequestID      string `json:"request_id"`
	NetworkAddress string `json:"network_address"`
	Name           string `json:"name"`
	PasswordHash   string `json:"password_hash"`
	TokenID        string `json:"token_id"`
	Approved       bool   `json:"approved"`
}

type TransferRequest struct {
	TransferRequestID       string  `json:"transfer_request_id"`
	TokenID                 string  `json:"token_id"`
	Amount                  float64 `json:"amount"`
	SenderTransferID        string  `json:"sender_transfer_id"`
	ReceiverTransferID      string  `json:"receiver_transfer_id"`
	SenderTokenTransferID   string  `json:"sender_token_transfer_id"`
	ReceiverTokenTransferID string  `json:"receiver_token_transfer_id"`
	Status                  string  `json:"status"` // PendingOwnerApproval, PendingReceiverApproval, Completed, Rejected
}

const maxTokens = 25

// InitLedger initializes token pool
func (s *SmartContract) InitLedger(ctx contractapi.TransactionContextInterface) error {
	for i := 1; i <= maxTokens; i++ {
		tid := fmt.Sprintf("token_%d", i)
		token := Token{TokenID: tid, Owner: "", Available: true, Minted: 0}
		b, err := json.Marshal(token)
		if err != nil {
			return err
		}
		if err := ctx.GetStub().PutState(tid, b); err != nil {
			return err
		}
	}

	return nil
}

// SubmitRegistration registers participant with generated network address
func (s *SmartContract) SubmitRegistration(ctx contractapi.TransactionContextInterface, name, passwordHash, country string) (string, error) {
	hash := sha256.Sum256([]byte(name))
	netAddr := hex.EncodeToString(hash[:])

	exists, err := s.ParticipantExists(ctx, netAddr)
	if err != nil {
		return "", err
	}
	if exists {
		return "", fmt.Errorf("participant already exists")
	}

	clientID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return "", err
	}

	p := Participant{Name: name, NetworkAddress: netAddr, ClientID: clientID, Approved: false, PasswordHash: passwordHash, Country: country, TokenID: ""}
	b, _ := json.Marshal(p)
	if err := ctx.GetStub().PutState(netAddr, b); err != nil {
		return "", err
	}
	return netAddr, nil
}

func (s *SmartContract) ParticipantExists(ctx contractapi.TransactionContextInterface, networkAddress string) (bool, error) {
	b, err := ctx.GetStub().GetState(networkAddress)
	if err != nil {
		return false, err
	}
	return b != nil, nil
}

// VerifyAdmin restricts to admin
func (s *SmartContract) VerifyAdmin(ctx contractapi.TransactionContextInterface) error {
	msp, err := ctx.GetClientIdentity().GetMSPID()
	if err != nil {
		return err
	}
	if msp != "Org1MSP" {
		return fmt.Errorf("access denied: admin only")
	}
	return nil
}

// RequestTokenRequest allows participant to request token purchase; only if details match
func (s *SmartContract) RequestTokenRequest(ctx contractapi.TransactionContextInterface, name, networkAddress, passwordHash, country string) error {
	b, err := ctx.GetStub().GetState(networkAddress)
	if err != nil || b == nil {
		return fmt.Errorf("participant not found")
	}
	var p Participant
	if err := json.Unmarshal(b, &p); err != nil {
		return err
	}

	if p.Name != name || p.PasswordHash != passwordHash || p.Country != country {
		return fmt.Errorf("participant details do not match")
	}

	reqID := "tokenrequest_" + networkAddress
	req := TokenRequest{RequestID: reqID, NetworkAddr: networkAddress, Status: "PENDING", TokenID: ""}
	rb, _ := json.Marshal(req)
	return ctx.GetStub().PutState(reqID, rb)
}

// GetPendingTokenRequests returns admin pending token requests
func (s *SmartContract) GetPendingTokenRequests(ctx contractapi.TransactionContextInterface) ([]TokenRequest, error) {
	if err := s.VerifyAdmin(ctx); err != nil {
		return nil, err
	}
	iter, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer iter.Close()
	var list []TokenRequest
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(kv.Key, "tokenrequest_") {
			var r TokenRequest
			if err := json.Unmarshal(kv.Value, &r); err == nil && r.Status == "PENDING" {
				list = append(list, r)
			}
		}
	}
	return list, nil
}

// ApproveTokenRequest admin approves token request and assigns token
func (s *SmartContract) ApproveTokenRequest(ctx contractapi.TransactionContextInterface, networkAddress string) error {
	if err := s.VerifyAdmin(ctx); err != nil {
		return err
	}
	reqID := "tokenrequest_" + networkAddress
	rb, err := ctx.GetStub().GetState(reqID)
	if err != nil || rb == nil {
		return fmt.Errorf("token request not found")
	}
	var r TokenRequest
	json.Unmarshal(rb, &r)
	if r.Status != "PENDING" {
		return fmt.Errorf("request already processed")
	}

	tokenID, err := s.findAvailableToken(ctx)
	if err != nil {
		return err
	}
	if tokenID == "" {
		return fmt.Errorf("no tokens available")
	}

	r.Status = "APPROVED"
	r.TokenID = tokenID
	rb, _ = json.Marshal(r)

	if err = ctx.GetStub().PutState(reqID, rb); err != nil {
		return err
	}

	pb, err := ctx.GetStub().GetState(networkAddress)
	if err != nil || pb == nil {
		return fmt.Errorf("participant not found")
	}
	var p Participant
	json.Unmarshal(pb, &p)
	p.TokenID = tokenID
	p.Approved = true
	pb, _ = json.Marshal(p)

	if err = ctx.GetStub().PutState(networkAddress, pb); err != nil {
		return err
	}

	tb, err := ctx.GetStub().GetState(tokenID)
	if err != nil || tb == nil {
		return fmt.Errorf("token not found")
	}
	var t Token
	json.Unmarshal(tb, &t)
	t.Owner = networkAddress
	t.Available = false
	tb, _ = json.Marshal(t)

	return ctx.GetStub().PutState(tokenID, tb)
}

// findAvailableToken returns first available tokenID or empty string
func (s *SmartContract) findAvailableToken(ctx contractapi.TransactionContextInterface) (string, error) {
	for i := 1; i <= maxTokens; i++ {
		tid := fmt.Sprintf("token_%d", i)
		b, err := ctx.GetStub().GetState(tid)
		if err != nil {
			return "", err
		}
		if b == nil {
			continue
		}
		var t Token
		if err := json.Unmarshal(b, &t); err != nil {
			return "", err
		}
		if t.Available {
			return tid, nil
		}
	}
	return "", nil
}

// GetTokenAccess verifies password and returns token address
func (s *SmartContract) GetTokenAccess(ctx contractapi.TransactionContextInterface, networkAddress, passwordHash string) (string, error) {
	pb, err := ctx.GetStub().GetState(networkAddress)
	if err != nil || pb == nil {
		return "", fmt.Errorf("participant not found")
	}
	var p Participant
	json.Unmarshal(pb, &p)
	if p.PasswordHash != passwordHash {
		return "", fmt.Errorf("password mismatch")
	}
	if p.TokenID == "" {
		return "", fmt.Errorf("token not assigned")
	}
	return p.TokenID, nil
}

// RequestMintCoins allows token owner to request minting coins
// RequestMintCoins verifies participant identity and password hash, then stores mint request
func (s *SmartContract) RequestMintCoins(ctx contractapi.TransactionContextInterface, networkAddress string, passwordHash string, amount int) error {
	// Fetch participant information by network address
	partBytes, err := ctx.GetStub().GetState(networkAddress)
	if err != nil || partBytes == nil {
		return fmt.Errorf("participant not found")
	}
	var participant Participant
	if err := json.Unmarshal(partBytes, &participant); err != nil {
		return err
	}

	// Verify password hash matches stored hash
	if participant.PasswordHash != passwordHash {
		return fmt.Errorf("invalid password")
	}

	// Verify caller identity matches participant client ID
	callerID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return err
	}
	if participant.ClientID != callerID {
		return fmt.Errorf("unauthorized caller")
	}

	// Check token ownership
	tokenBytes, err := ctx.GetStub().GetState(participant.TokenID)
	if err != nil || tokenBytes == nil {
		return fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return err
	}
	if token.Owner != networkAddress {
		return fmt.Errorf("caller is not token owner")
	}

	// Create mint request key unique per token and participant
	reqKey := fmt.Sprintf("mintrequest_%s_%s", participant.TokenID, networkAddress)
	mintReq := MintRequest{
		RequestID:   reqKey,
		TokenID:     participant.TokenID,
		RequestedBy: networkAddress,
		Amount:      amount,
		Approved:    false,
	}
	reqBytes, err := json.Marshal(mintReq)
	if err != nil {
		return err
	}

	// Store the mint request on ledger
	return ctx.GetStub().PutState(reqKey, reqBytes)
}

// GetPendingMintRequests (admin)
func (s *SmartContract) GetPendingMintRequests(ctx contractapi.TransactionContextInterface) ([]MintRequest, error) {
	if err := s.VerifyAdmin(ctx); err != nil {
		return nil, err
	}
	it, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer it.Close()
	var reqs []MintRequest
	for it.HasNext() {
		kv, _ := it.Next()
		if strings.HasPrefix(kv.Key, "mintrequest_") {
			var r MintRequest
			if json.Unmarshal(kv.Value, &r) == nil && !r.Approved {
				reqs = append(reqs, r)
			}
		}
	}
	return reqs, nil
}

// ApproveMintRequest approves mint request and mints coins
func (s *SmartContract) ApproveMintRequest(ctx contractapi.TransactionContextInterface, requestID string) error {
	if err := s.VerifyAdmin(ctx); err != nil {
		return err
	}

	reqBytes, err := ctx.GetStub().GetState(requestID)
	if err != nil || reqBytes == nil {
		return fmt.Errorf("mint request not found")
	}

	var mr MintRequest
	if err := json.Unmarshal(reqBytes, &mr); err != nil {
		return err
	}

	if mr.Approved {
		return fmt.Errorf("mint request already approved")
	}

	mr.Approved = true
	updatedReqBytes, err := json.Marshal(mr)
	if err != nil {
		return err
	}

	if err = ctx.GetStub().PutState(requestID, updatedReqBytes); err != nil {
		return err
	}

	tokenBytes, err := ctx.GetStub().GetState(mr.TokenID)
	if err != nil || tokenBytes == nil {
		return fmt.Errorf("token not found")
	}

	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return err
	}

	token.Minted += mr.Amount
	updatedTokenBytes, err := json.Marshal(token)
	if err != nil {
		return err
	}

	return ctx.GetStub().PutState(mr.TokenID, updatedTokenBytes)
}

func (s *SmartContract) GetWalletInfo(ctx contractapi.TransactionContextInterface, networkAddress, passwordHash string) (map[string]interface{}, error) {
	pb, err := ctx.GetStub().GetState(networkAddress)
	if err != nil || pb == nil {
		return nil, fmt.Errorf("participant not found")
	}
	var p Participant
	json.Unmarshal(pb, &p)

	// Check password hash matches
	if p.PasswordHash != passwordHash {
		return nil, fmt.Errorf("incorrect password")
	}

	// Verify caller client ID matches participant client ID
	callerID, err := ctx.GetClientIdentity().GetID()
	if err != nil {
		return nil, fmt.Errorf("unable to get caller identity: %v", err)
	}
	if p.ClientID != callerID {
		return nil, fmt.Errorf("unauthorized caller")
	}

	tb, err := ctx.GetStub().GetState(p.TokenID)
	if err != nil || tb == nil {
		return nil, fmt.Errorf("token not found")
	}
	var t Token
	json.Unmarshal(tb, &t)
	return map[string]interface{}{
		"networkAddress":   p.NetworkAddress,
		"tokenID":          t.TokenID,
		"mintedCoins":      t.Minted,
		"tokenTransferIDs": t.TransferIDs,
	}, nil
}

// Customer can view all tokens available to select (user function)
func (s *SmartContract) ViewAllTokens(ctx contractapi.TransactionContextInterface) ([]Token, error) {
	iter, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var tokens []Token
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(kv.Key, "token_") {
			var token Token
			if err := json.Unmarshal(kv.Value, &token); err == nil {
				tokens = append(tokens, token)
			}
		}
	}
	return tokens, nil
}

// Customer registers for a token (recorded as pending for token owner approval)
func (s *SmartContract) RegisterCustomer(ctx contractapi.TransactionContextInterface, networkAddress, name, passwordHash, tokenID string) error {
	// Check token exists and approved
	tokenBytes, err := ctx.GetStub().GetState(tokenID)
	if err != nil || tokenBytes == nil {
		return fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil || token.Owner == "" {
		return fmt.Errorf("invalid or unowned token")
	}

	// Build request id composite key
	reqID := "custreq_" + networkAddress + "_" + tokenID

	// Prevent duplicate request
	existsBytes, err := ctx.GetStub().GetState(reqID)
	if err != nil {
		return err
	}
	if existsBytes != nil {
		return fmt.Errorf("customer registration request already exists")
	}

	req := RegisterCustomerRequest{
		RequestID:      reqID,
		NetworkAddress: networkAddress,
		Name:           name,
		PasswordHash:   passwordHash,
		TokenID:        tokenID,
		Approved:       false,
	}
	requestBytes, err := json.Marshal(req)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(reqID, requestBytes)
}

// Token owner views pending customer registrations for their token
func (s *SmartContract) ViewPendingCustomerRegistrations(ctx contractapi.TransactionContextInterface, tokenID, ownerNetworkAddress string) ([]RegisterCustomerRequest, error) {
	// Verify caller is owner of tokenID
	tokenBytes, err := ctx.GetStub().GetState(tokenID)
	if err != nil || tokenBytes == nil {
		return nil, fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return nil, err
	}
	if token.Owner != ownerNetworkAddress {
		return nil, fmt.Errorf("caller is not token owner")
	}

	iter, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var pendingRequests []RegisterCustomerRequest
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(kv.Key, "custreq_") {
			var req RegisterCustomerRequest
			if err := json.Unmarshal(kv.Value, &req); err == nil && req.TokenID == tokenID && !req.Approved {
				pendingRequests = append(pendingRequests, req)
			}
		}
	}
	return pendingRequests, nil
}

// Token owner approves customer registration
func (s *SmartContract) ApproveCustomerRegistration(ctx contractapi.TransactionContextInterface, requestID, ownerNetworkAddress string) error {
	reqBytes, err := ctx.GetStub().GetState(requestID)
	if err != nil || reqBytes == nil {
		return fmt.Errorf("customer registration request not found")
	}
	var req RegisterCustomerRequest
	if err := json.Unmarshal(reqBytes, &req); err != nil {
		return err
	}

	// Verify caller is token owner
	tokenBytes, err := ctx.GetStub().GetState(req.TokenID)
	if err != nil || tokenBytes == nil {
		return fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return err
	}
	if token.Owner != ownerNetworkAddress {
		return fmt.Errorf("caller is not token owner")
	}
	if req.Approved {
		return fmt.Errorf("already approved")
	}

	// Approve customer registration and create customer wallet entry
	req.Approved = true
	updatedReqBytes, _ := json.Marshal(req)
	if err := ctx.GetStub().PutState(requestID, updatedReqBytes); err != nil {
		return err
	}

	customer := Customer{
		NetworkAddress: req.NetworkAddress,
		Name:           req.Name,
		PasswordHash:   req.PasswordHash,
		TokenID:        req.TokenID,
		Approved:       true,
		Balance:        0,
	}
	customerBytes, _ := json.Marshal(customer)
	customerKey := "customer_" + req.NetworkAddress + "_" + req.TokenID
	return ctx.GetStub().PutState(customerKey, customerBytes)
}

// Customer requests coins minting (referenced by token and customer)
func (s *SmartContract) CustomerRequestMint(ctx contractapi.TransactionContextInterface, networkAddress, tokenID string, amount int) error {
	customerKey := "customer_" + networkAddress + "_" + tokenID
	customerBytes, err := ctx.GetStub().GetState(customerKey)
	if err != nil || customerBytes == nil {
		return fmt.Errorf("customer not registered or approved for token")
	}
	var customer Customer
	if err := json.Unmarshal(customerBytes, &customer); err != nil {
		return err
	}

	// Create mint request with unique key
	requestID := fmt.Sprintf("custmintreq_%s_%s", customer.NetworkAddress, tokenID)
	mintReq := MintRequest{
		RequestID:   requestID,
		TokenID:     tokenID,
		RequestedBy: customer.NetworkAddress,
		Amount:      amount,
		Approved:    false,
	}
	reqBytes, _ := json.Marshal(mintReq)
	return ctx.GetStub().PutState(requestID, reqBytes)
}

// Token owner views pending mint requests for their token from customers
func (s *SmartContract) ViewPendingCustomerMintRequests(ctx contractapi.TransactionContextInterface, tokenID, ownerNetworkAddress string) ([]MintRequest, error) {
	tokenBytes, err := ctx.GetStub().GetState(tokenID)
	if err != nil || tokenBytes == nil {
		return nil, fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return nil, err
	}
	if token.Owner != ownerNetworkAddress {
		return nil, fmt.Errorf("caller is not token owner")
	}

	iter, err := ctx.GetStub().GetStateByRange("", "")
	if err != nil {
		return nil, err
	}
	defer iter.Close()

	var pending []MintRequest
	for iter.HasNext() {
		kv, err := iter.Next()
		if err != nil {
			return nil, err
		}
		if strings.HasPrefix(kv.Key, "custmintreq_") {
			var r MintRequest
			if err := json.Unmarshal(kv.Value, &r); err == nil && r.TokenID == tokenID && !r.Approved {
				pending = append(pending, r)
			}
		}
	}
	return pending, nil
}

// Token owner approves customer mint request, increasing customer balance
// Token owner approves customer mint request, increasing customer balance if token has sufficient minted coins
func (s *SmartContract) ApproveCustomerMint(ctx contractapi.TransactionContextInterface, requestID, ownerNetworkAddress string) error {
	// Retrieve the mint request by ID
	reqBytes, err := ctx.GetStub().GetState(requestID)
	if err != nil || reqBytes == nil {
		return fmt.Errorf("mint request not found")
	}
	var mintReq MintRequest
	if err := json.Unmarshal(reqBytes, &mintReq); err != nil {
		return err
	}

	// Retrieve the token state
	tokenBytes, err := ctx.GetStub().GetState(mintReq.TokenID)
	if err != nil || tokenBytes == nil {
		return fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return err
	}

	// Check that caller is indeed token owner
	if token.Owner != ownerNetworkAddress {
		return fmt.Errorf("caller is not token owner")
	}

	// Check if request already approved
	if mintReq.Approved {
		return fmt.Errorf("mint request already approved")
	}

	// Check if the token has enough minted coins to fulfill this request
	if token.Minted < mintReq.Amount {
		return fmt.Errorf("insufficient minted coin balance on token: available %d, requested %d", token.Minted, mintReq.Amount)
	}

	// Approve mint request
	mintReq.Approved = true
	updatedReqBytes, err := json.Marshal(mintReq)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(requestID, updatedReqBytes); err != nil {
		return err
	}

	// Deduct the requested amount from token's minted coins balance
	token.Minted -= mintReq.Amount
	updatedTokenBytes, err := json.Marshal(token)
	if err != nil {
		return err
	}
	if err := ctx.GetStub().PutState(mintReq.TokenID, updatedTokenBytes); err != nil {
		return err
	}

	// Credit the customer’s balance
	customerKey := "customer_" + mintReq.RequestedBy + "_" + mintReq.TokenID
	custBytes, err := ctx.GetStub().GetState(customerKey)
	if err != nil || custBytes == nil {
		return fmt.Errorf("customer not found")
	}
	var cust Customer
	if err := json.Unmarshal(custBytes, &cust); err != nil {
		return err
	}
	cust.Balance += mintReq.Amount
	updatedCustBytes, err := json.Marshal(cust)
	if err != nil {
		return err
	}
	return ctx.GetStub().PutState(customerKey, updatedCustBytes)
}

// Customer views their subtoken wallet info securely
func (s *SmartContract) ViewCustomerWallet(ctx contractapi.TransactionContextInterface, networkAddress, tokenID, passwordHash string) (map[string]interface{}, error) {
	customerKey := "customer_" + networkAddress + "_" + tokenID
	custBytes, err := ctx.GetStub().GetState(customerKey)
	if err != nil || custBytes == nil {
		return nil, fmt.Errorf("customer not found")
	}
	var cust Customer
	if err := json.Unmarshal(custBytes, &cust); err != nil {
		return nil, err
	}
	if cust.PasswordHash != passwordHash {
		return nil, fmt.Errorf("invalid password")
	}
	return map[string]interface{}{
		"networkAddress":         cust.NetworkAddress,
		"tokenID":                cust.TokenID,
		"balance":                cust.Balance,
		"approved":               cust.Approved,
		"participantTransferIDs": cust.TransferIDs,
		"tokenTransferIDs":       cust.TransferIDs,
	}, nil
}

// 1. CreateTransferRequest - generates unique ID and submits new transfer request
func (s *SmartContract) CreateTransferRequest(ctx contractapi.TransactionContextInterface,
	senderParticipantID, receiverParticipantID, senderTokenTransferID, receiverTokenTransferID, tokenID, amountStr string) (string, error) {

	amount, err := strconv.ParseFloat(amountStr, 64)
	if err != nil {
		return "", fmt.Errorf("invalid amount: %v", err)
	}

	uuid, err := uuid.NewRandom()
	if err != nil {
		return "", fmt.Errorf("failed to generate transfer request id: %v", err)
	}
	transferRequestID := "transfer_" + uuid.String()

	request := TransferRequest{
		TransferRequestID:       transferRequestID,
		TokenID:                 tokenID,
		Amount:                  amount,
		SenderTransferID:        senderParticipantID,
		ReceiverTransferID:      receiverParticipantID,
		SenderTokenTransferID:   senderTokenTransferID,
		ReceiverTokenTransferID: receiverTokenTransferID,
		Status:                  "PendingOwnerApproval",
	}

	requestBytes, err := json.Marshal(request)
	if err != nil {
		return "", err
	}
	if err = ctx.GetStub().PutState(transferRequestID, requestBytes); err != nil {
		return "", err
	}

	// Append transfer ID to sender and receiver participant and token is recommended here (omitted for brevity)

	return transferRequestID, nil
}

// 2. ApproveTransferByOwner - owner approves transfer, sets status to pending receiver approval
func (s *SmartContract) ApproveTransferByOwner(ctx contractapi.TransactionContextInterface, transferRequestID, approver string) error {
	reqBytes, err := ctx.GetStub().GetState(transferRequestID)
	if err != nil || reqBytes == nil {
		return fmt.Errorf("transfer request not found")
	}
	var request TransferRequest
	if err := json.Unmarshal(reqBytes, &request); err != nil {
		return err
	}

	if request.Status != "PendingOwnerApproval" {
		return fmt.Errorf("transfer request not pending owner approval")
	}
	if request.SenderTransferID != approver {
		return fmt.Errorf("approver is not the sender participant")
	}

	request.Status = "PendingReceiverApproval"
	updatedBytes, _ := json.Marshal(request)
	return ctx.GetStub().PutState(transferRequestID, updatedBytes)
}

// 3. ApproveTransferByReceiver - receiver approves; completes or rejects the transfer
func (s *SmartContract) ApproveTransferByReceiver(ctx contractapi.TransactionContextInterface, transferRequestID, approver string) error {
	reqBytes, err := ctx.GetStub().GetState(transferRequestID)
	if err != nil || reqBytes == nil {
		return fmt.Errorf("transfer request not found")
	}
	var request TransferRequest
	if err := json.Unmarshal(reqBytes, &request); err != nil {
		return err
	}

	if request.Status != "PendingReceiverApproval" {
		return fmt.Errorf("transfer request not pending receiver approval")
	}

	// Check if approver is the token owner (receiver)
	tokenBytes, err := ctx.GetStub().GetState(request.TokenID)
	if err != nil || tokenBytes == nil {
		return fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return err
	}
	if token.Owner != approver {
		return fmt.Errorf("approver is not the token owner (receiver)")
	}

	// Sender balance check and deduction (participant's balance)
	senderBalBytes, err := ctx.GetStub().GetState(request.SenderTransferID)
	if err != nil || senderBalBytes == nil {
		return fmt.Errorf("sender balance not found")
	}
	senderBalance, err := strconv.ParseFloat(string(senderBalBytes), 64)
	if err != nil {
		return fmt.Errorf("invalid sender balance")
	}
	if senderBalance < request.Amount {
		// Reject transfer: insufficient funds
		request.Status = "Rejected"
		updatedBytes, _ := json.Marshal(request)
		_ = ctx.GetStub().PutState(transferRequestID, updatedBytes)
		return fmt.Errorf("insufficient funds for transfer")
	}

	// Deduct sender balance
	senderBalance -= request.Amount
	err = ctx.GetStub().PutState(request.SenderTransferID, []byte(fmt.Sprintf("%f", senderBalance)))
	if err != nil {
		return fmt.Errorf("failed to update sender balance")
	}

	// Credit token owner's minted balance (receiver)
	token.Minted += int(request.Amount)
	updatedTokenBytes, err := json.Marshal(token)
	if err != nil {
		return err
	}
	if err = ctx.GetStub().PutState(request.TokenID, updatedTokenBytes); err != nil {
		return err
	}

	// Mark transfer completed
	request.Status = "Completed"
	updatedBytes, _ := json.Marshal(request)
	return ctx.GetStub().PutState(transferRequestID, updatedBytes)
}

// 4. ViewTransferRequestsForOwner lists transfers waiting for owner's approval
func (s *SmartContract) ViewTransferRequestsForOwner(ctx contractapi.TransactionContextInterface, ownerID string) ([]TransferRequest, error) {
	queryString := fmt.Sprintf(`{"selector":{"sender_transfer_id":"%s","status":"PendingOwnerApproval"}}`, ownerID)
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var requests []TransferRequest
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		var tr TransferRequest
		json.Unmarshal(response.Value, &tr)
		requests = append(requests, tr)
	}
	return requests, nil
}

// 5. ViewTransferRequestsForReceiver lists transfers waiting for receiver's approval
func (s *SmartContract) ViewTransferRequestsForReceiver(ctx contractapi.TransactionContextInterface, receiverID string) ([]TransferRequest, error) {
	queryString := fmt.Sprintf(`{"selector":{"receiver_transfer_id":"%s","status":"PendingReceiverApproval"}}`, receiverID)
	resultsIterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer resultsIterator.Close()

	var requests []TransferRequest
	for resultsIterator.HasNext() {
		response, err := resultsIterator.Next()
		if err != nil {
			return nil, err
		}
		var tr TransferRequest
		json.Unmarshal(response.Value, &tr)
		requests = append(requests, tr)
	}
	return requests, nil
}

// GetParticipantTransferHistory lists all transfers involving a participant transfer ID as sender or receiver
func (s *SmartContract) GetParticipantTransferHistory(ctx contractapi.TransactionContextInterface, participantTransferID string) ([]TransferRequest, error) {
	queryString := fmt.Sprintf(`{"selector":{"$or":[{"sender_transfer_id":"%s"},{"receiver_transfer_id":"%s"}]}}`, participantTransferID, participantTransferID)
	iterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer iterator.Close()

	var transfers []TransferRequest
	for iterator.HasNext() {
		resp, err := iterator.Next()
		if err != nil {
			return nil, err
		}
		var tr TransferRequest
		if err := json.Unmarshal(resp.Value, &tr); err == nil {
			transfers = append(transfers, tr)
		}
	}
	return transfers, nil
}

// GetTokenTransferHistory lists all transfers involving a token ID
func (s *SmartContract) GetTokenTransferHistory(ctx contractapi.TransactionContextInterface, tokenID string) ([]TransferRequest, error) {
	queryString := fmt.Sprintf(`{"selector":{"token_id":"%s"}}`, tokenID)
	iterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer iterator.Close()

	var transfers []TransferRequest
	for iterator.HasNext() {
		resp, err := iterator.Next()
		if err != nil {
			return nil, err
		}
		var tr TransferRequest
		if err := json.Unmarshal(resp.Value, &tr); err == nil {
			transfers = append(transfers, tr)
		}
	}
	return transfers, nil
}

//owner power

func (s *SmartContract) GetTokenParticipantsAndTransactions(ctx contractapi.TransactionContextInterface, tokenID string, callerTransferID string) (map[string]interface{}, error) {

	// Verify caller is token owner
	tokenBytes, err := ctx.GetStub().GetState(tokenID)
	if err != nil || tokenBytes == nil {
		return nil, fmt.Errorf("token not found")
	}
	var token Token
	if err := json.Unmarshal(tokenBytes, &token); err != nil {
		return nil, err
	}
	if token.Owner != callerTransferID {
		return nil, fmt.Errorf("access denied: caller is not the token owner")
	}

	// Query participants linked to this token
	queryString := fmt.Sprintf(`{"selector":{"token_transfer_id":"%s"}}`, tokenID)
	participantIter, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer participantIter.Close()

	var participants []Participant
	for participantIter.HasNext() {
		pResp, err := participantIter.Next()
		if err != nil {
			return nil, err
		}
		var p Participant
		if err := json.Unmarshal(pResp.Value, &p); err == nil {
			participants = append(participants, p)
		}
	}

	// For each participant, fetch related transfer transactions
	participantTransfers := make(map[string][]TransferRequest)
	for _, p := range participants {
		transfers, err := s.GetParticipantTransferHistory(ctx, p.NetworkAddress)
		if err != nil {
			return nil, err
		}
		participantTransfers[p.NetworkAddress] = transfers
	}

	return map[string]interface{}{
		"tokenID":              tokenID,
		"participantCount":     len(participants),
		"participants":         participants,
		"participantTransfers": participantTransfers,
	}, nil
}

// Reuse or redefine this helper function from previous answers
func (s *SmartContract) GetParticipantTransferHistorybyowner(ctx contractapi.TransactionContextInterface, participantTransferID string) ([]TransferRequest, error) {
	queryString := fmt.Sprintf(`{"selector":{"$or":[{"sender_transfer_id":"%s"},{"receiver_transfer_id":"%s"}]}}`, participantTransferID, participantTransferID)
	iterator, err := ctx.GetStub().GetQueryResult(queryString)
	if err != nil {
		return nil, err
	}
	defer iterator.Close()

	var transfers []TransferRequest
	for iterator.HasNext() {
		resp, err := iterator.Next()
		if err != nil {
			return nil, err
		}
		var tr TransferRequest
		if err := json.Unmarshal(resp.Value, &tr); err == nil {
			transfers = append(transfers, tr)
		}
	}
	return transfers, nil
}

func main() {
	cc, err := contractapi.NewChaincode(new(SmartContract))
	if err != nil {
		panic(err)
	}
	if err := cc.Start(); err != nil {
		panic(err)
	}
}
