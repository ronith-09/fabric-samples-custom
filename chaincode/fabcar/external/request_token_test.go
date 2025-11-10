package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
)

// TestRequestTokenRequest_Variations tests different scenarios for token requests
func TestRequestTokenRequest_Variations(t *testing.T) {
	tests := []struct {
		name          string
		setupState    func(*mockStub)
		inputName     string
		inputAddr     string
		inputPass     string
		inputCountry  string
		expectError   bool
		errorContains string
	}{
		{
			name: "successful request with matching details",
			setupState: func(stub *mockStub) {
				// Setup existing participant
				p := Participant{
					Name:           "Alice",
					NetworkAddress: "addr123",
					PasswordHash:   "pass123hash",
					Country:        "USA",
					Approved:       false,
					TokenID:        "",
				}
				pb, _ := json.Marshal(p)
				stub.State["addr123"] = pb
			},
			inputName:    "Alice",
			inputAddr:    "addr123",
			inputPass:    "pass123hash",
			inputCountry: "USA",
			expectError:  false,
		},
		{
			name: "non-existent participant",
			setupState: func(stub *mockStub) {
				// Empty state - no participant
			},
			inputName:     "Bob",
			inputAddr:     "addr456",
			inputPass:     "somepass",
			inputCountry:  "UK",
			expectError:   true,
			errorContains: "participant not found",
		},
		{
			name: "mismatched participant details",
			setupState: func(stub *mockStub) {
				p := Participant{
					Name:           "Charlie",
					NetworkAddress: "addr789",
					PasswordHash:   "correctpass",
					Country:        "Canada",
					Approved:       false,
					TokenID:        "",
				}
				pb, _ := json.Marshal(p)
				stub.State["addr789"] = pb
			},
			inputName:     "Charlie",
			inputAddr:     "addr789",
			inputPass:     "wrongpass", // Intentionally wrong password
			inputCountry:  "Canada",
			expectError:   true,
			errorContains: "details do not match",
		},
		{
			name: "already has pending request",
			setupState: func(stub *mockStub) {
				// Setup participant
				p := Participant{
					Name:           "Dave",
					NetworkAddress: "addr101",
					PasswordHash:   "pass101",
					Country:        "France",
					Approved:       false,
					TokenID:        "",
				}
				pb, _ := json.Marshal(p)
				stub.State["addr101"] = pb

				// Add existing pending request
				req := TokenRequest{
					RequestID:   "tokenrequest_addr101",
					NetworkAddr: "addr101",
					Status:      "PENDING",
					TokenID:     "",
				}
				rb, _ := json.Marshal(req)
				stub.State["tokenrequest_addr101"] = rb
			},
			inputName:    "Dave",
			inputAddr:    "addr101",
			inputPass:    "pass101",
			inputCountry: "France",
			expectError:  false, // Current logic allows multiple requests
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cc := new(SmartContract)
			stub := &mockStub{State: make(map[string][]byte)}

			// Setup test state
			tt.setupState(stub)

			ctx := &mockContext{
				stub:           stub,
				clientIdentity: &mockClientIdentity{},
			}

			// Execute the request
			err := cc.RequestTokenRequest(ctx, tt.inputName, tt.inputAddr, tt.inputPass, tt.inputCountry, "123456") // Default pincode for existing tests

			// Verify expectations
			if tt.expectError {
				assert.Error(t, err)
				if tt.errorContains != "" {
					assert.Contains(t, err.Error(), tt.errorContains)
				}
			} else {
				assert.NoError(t, err)

				// Verify request was stored
				reqID := "tokenrequest_" + tt.inputAddr
				reqBytes, ok := stub.State[reqID]
				assert.True(t, ok, "token request should be stored")

				var storedReq TokenRequest
				err = json.Unmarshal(reqBytes, &storedReq)
				assert.NoError(t, err)
				assert.Equal(t, tt.inputAddr, storedReq.NetworkAddr)
				assert.Equal(t, "PENDING", storedReq.Status)
			}
		})
	}
}
