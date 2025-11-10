package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

// Example of how to use the test helper to try different scenarios
func TestQuickFunctionTest(t *testing.T) {
	// Create helper
	h := NewTestHelper()

	// Initialize tokens
	err := h.InitLedgerWithTokens()
	assert.NoError(t, err)

	// 1. Register a participant
	netAddr, err := h.CreateParticipant("Alice", "pass123", "USA")
	assert.NoError(t, err)

	// Verify participant was created
	p, err := h.GetParticipant(netAddr)
	assert.NoError(t, err)
	assert.Equal(t, "Alice", p.Name)

	// 2. Request a token
	err = h.Contract.RequestTokenRequest(h.Ctx, "Alice", netAddr, "pass123", "USA", "123456")
	assert.NoError(t, err)

	// Verify request was created
	tr, err := h.GetTokenRequest(netAddr)
	assert.NoError(t, err)
	assert.Equal(t, "PENDING", tr.Status)

	// 3. Approve as admin
	h.SetAsAdmin()
	err = h.Contract.ApproveTokenRequest(h.Ctx, netAddr)
	assert.NoError(t, err)

	// 4. Check participant got token
	p, _ = h.GetParticipant(netAddr)
	assert.NotEmpty(t, p.TokenID)
	assert.True(t, p.Approved)

	// 5. Try to mint coins
	mintReqID := "mintrequest_" + p.TokenID + "_" + netAddr
	err = h.Contract.RequestMintCoins(h.Ctx, netAddr, "pass123", 100)
	assert.NoError(t, err)

	// Verify mint request
	mr, err := h.GetMintRequest(mintReqID)
	assert.NoError(t, err)
	assert.Equal(t, 100, mr.Amount)

	// 6. Approve mint request
	err = h.Contract.ApproveMintRequest(h.Ctx, mintReqID)
	assert.NoError(t, err)

	// Check token was minted
	token, err := h.GetToken(p.TokenID)
	assert.NoError(t, err)
	assert.Equal(t, 100, token.Minted)
}

// Example of testing just one function with different inputs
func TestTryDifferentInputs(t *testing.T) {
	h := NewTestHelper()

	// Test case 1: Valid registration
	addr1, err := h.CreateParticipant("Bob", "pass456", "Canada")
	assert.NoError(t, err)
	assert.NotEmpty(t, addr1)

	// Test case 2: Try duplicate registration
	_, err = h.CreateParticipant("Bob", "pass456", "Canada")
	assert.Error(t, err) // Should fail as participant exists

	// Test case 3: Different country
	addr3, err := h.CreateParticipant("Bob", "pass456", "UK")
	assert.NoError(t, err) // Should work as it's different details
	assert.NotEqual(t, addr1, addr3)

	// Get and verify details
	p1, _ := h.GetParticipant(addr1)
	p3, _ := h.GetParticipant(addr3)
	assert.Equal(t, "Canada", p1.Country)
	assert.Equal(t, "UK", p3.Country)
}
