package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

type SmartContract struct {
	contractapi.Contract
}

type Participant struct {
	Name           string `json:"name"`
	NetworkAddress string `json:"network_address"`
	ClientID       string `json:"client_id"`
	Approved       bool   `json:"approved"`
	PasswordHash   string `json:"password_hash"`
	Country        string `json:"country"`
	TokenID        string `json:"token_id"`
}

type Token struct {
	TokenID   string `json:"token_id"`
	Owner     string `json:"owner"`
	Available bool   `json:"available"`
	Minted    int    `json:"minted"`
}

type TokenRequest struct {
	RequestID   string `json:"request_id"`
	NetworkAddr string `json:"network_addr"`
	Status      string `json:"status"` // PENDING, APPROVED
	TokenID     string `json:"token_id"`
	Pincode     string `json:"pincode"` // Added pincode field
}

type MintRequest struct {
	RequestID   string `json:"request_id"`
	TokenID     string `json:"token_id"`
	RequestedBy string `json:"requested_by"`
	Amount      int    `json:"amount"`
	Approved    bool   `json:"approved"`
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
func (s *SmartContract) RequestTokenRequest(ctx contractapi.TransactionContextInterface, name, networkAddress, passwordHash, country, pincode string) error {
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

	// Validate pincode format (example: must be 6 digits)
	if len(pincode) != 6 {
		return fmt.Errorf("invalid pincode: must be 6 digits")
	}

	reqID := "tokenrequest_" + networkAddress
	req := TokenRequest{
		RequestID:   reqID,
		NetworkAddr: networkAddress,
		Status:      "PENDING",
		TokenID:     "",
		Pincode:     pincode,
	}
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
		"networkAddress": p.NetworkAddress,
		"tokenID":        t.TokenID,
		"mintedCoins":    t.Minted,
	}, nil
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
