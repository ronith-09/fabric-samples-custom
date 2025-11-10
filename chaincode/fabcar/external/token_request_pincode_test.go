package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestRequestTokenWithPincode(t *testing.T) {
	// Create our test helper
	h := NewTestHelper()

	// Test cases
	tests := []struct {
		name            string
		participantName string
		password        string
		country         string
		pincode         string
		expectError     bool
		errorMessage    string
	}{
		{
			name:            "Valid pincode",
			participantName: "Alice",
			password:        "pass123",
			country:         "USA",
			pincode:         "123456",
			expectError:     false,
		},
		{
			name:            "Invalid pincode - too short",
			participantName: "Bob",
			password:        "pass456",
			country:         "Canada",
			pincode:         "12345",
			expectError:     true,
			errorMessage:    "invalid pincode: must be 6 digits",
		},
		{
			name:            "Invalid pincode - too long",
			participantName: "Charlie",
			password:        "pass789",
			country:         "UK",
			pincode:         "1234567",
			expectError:     true,
			errorMessage:    "invalid pincode: must be 6 digits",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Register a new participant for each test
			netAddr, err := h.CreateParticipant(tt.participantName, tt.password, tt.country)
			assert.NoError(t, err)

			// Try to request token with pincode
			err = h.Contract.RequestTokenRequest(h.Ctx, tt.participantName, netAddr, tt.password, tt.country, tt.pincode)

			if tt.expectError {
				assert.Error(t, err)
				assert.Contains(t, err.Error(), tt.errorMessage)
			} else {
				assert.NoError(t, err)

				// Verify the request was stored with correct pincode
				request, err := h.GetTokenRequest(netAddr)
				assert.NoError(t, err)
				assert.Equal(t, tt.pincode, request.Pincode)
				assert.Equal(t, "PENDING", request.Status)
			}
		})
	}
}

// Test the full token request flow with pincode
func TestTokenRequestFlowWithPincode(t *testing.T) {
	h := NewTestHelper()

	// 1. Create participant
	name := "Dave"
	pass := "pass123"
	country := "India"
	pincode := "999999"

	netAddr, err := h.CreateParticipant(name, pass, country)
	assert.NoError(t, err)

	// 2. Request token with pincode
	err = h.Contract.RequestTokenRequest(h.Ctx, name, netAddr, pass, country, pincode)
	assert.NoError(t, err)

	// 3. Verify request details
	request, err := h.GetTokenRequest(netAddr)
	assert.NoError(t, err)
	assert.Equal(t, pincode, request.Pincode)
	assert.Equal(t, "PENDING", request.Status)

	// 4. Approve request as admin
	h.SetAsAdmin()
	err = h.Contract.ApproveTokenRequest(h.Ctx, netAddr)
	assert.NoError(t, err)

	// 5. Verify final state
	request, err = h.GetTokenRequest(netAddr)
	assert.NoError(t, err)
	assert.Equal(t, "APPROVED", request.Status)
	assert.NotEmpty(t, request.TokenID)
}
