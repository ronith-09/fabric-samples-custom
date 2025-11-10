package main

import (
	"encoding/json"
	"fmt"
)

// TestHelper provides easy methods to test chaincode functions
type TestHelper struct {
	Stub     *mockStub
	Ctx      *mockContext
	Contract *SmartContract
}

// NewTestHelper creates a new test helper with initialized state
func NewTestHelper() *TestHelper {
	stub := &mockStub{State: make(map[string][]byte)}
	ctx := &mockContext{
		stub:           stub,
		clientIdentity: &mockClientIdentity{},
	}
	return &TestHelper{
		Stub:     stub,
		Ctx:      ctx,
		Contract: new(SmartContract),
	}
}

// CreateParticipant adds a test participant to the ledger
func (h *TestHelper) CreateParticipant(name, password, country string) (string, error) {
	return h.Contract.SubmitRegistration(h.Ctx, name, password, country)
}

// GetParticipant retrieves a participant from the ledger
func (h *TestHelper) GetParticipant(networkAddress string) (*Participant, error) {
	data, err := h.Stub.GetState(networkAddress)
	if err != nil || data == nil {
		return nil, fmt.Errorf("participant not found")
	}
	var p Participant
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, err
	}
	return &p, nil
}

// GetToken retrieves a token from the ledger
func (h *TestHelper) GetToken(tokenID string) (*Token, error) {
	data, err := h.Stub.GetState(tokenID)
	if err != nil || data == nil {
		return nil, fmt.Errorf("token not found")
	}
	var t Token
	if err := json.Unmarshal(data, &t); err != nil {
		return nil, err
	}
	return &t, nil
}

// InitLedgerWithTokens initializes the ledger with tokens
func (h *TestHelper) InitLedgerWithTokens() error {
	return h.Contract.InitLedger(h.Ctx)
}

// GetTokenRequest gets a token request from the ledger
func (h *TestHelper) GetTokenRequest(networkAddress string) (*TokenRequest, error) {
	reqID := "tokenrequest_" + networkAddress
	data, err := h.Stub.GetState(reqID)
	if err != nil || data == nil {
		return nil, fmt.Errorf("token request not found")
	}
	var tr TokenRequest
	if err := json.Unmarshal(data, &tr); err != nil {
		return nil, err
	}
	return &tr, nil
}

// GetMintRequest gets a mint request from the ledger
func (h *TestHelper) GetMintRequest(requestID string) (*MintRequest, error) {
	data, err := h.Stub.GetState(requestID)
	if err != nil || data == nil {
		return nil, fmt.Errorf("mint request not found")
	}
	var mr MintRequest
	if err := json.Unmarshal(data, &mr); err != nil {
		return nil, err
	}
	return &mr, nil
}

// SetAsAdmin makes the test context use admin identity
func (h *TestHelper) SetAsAdmin() {
	h.Ctx.clientIdentity = &mockClientIdentity{} // default returns Org1MSP
}

// SetAsNonAdmin makes the test context use non-admin identity
func (h *TestHelper) SetAsNonAdmin() {
	h.Ctx.clientIdentity = &mockNonAdminIdentity{} // returns Org2MSP
}
