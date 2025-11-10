package main

import (
	"crypto/x509"

	"github.com/hyperledger/fabric-chaincode-go/pkg/cid"
	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// mockStub holds an in-memory map for ledger state
type mockStub struct {
	shim.ChaincodeStubInterface
	State map[string][]byte
}

func (m *mockStub) GetState(key string) ([]byte, error) {
	return m.State[key], nil
}

func (m *mockStub) PutState(key string, value []byte) error {
	m.State[key] = value
	return nil
}

// mockClientIdentity mocks the client identity
type mockClientIdentity struct{}

func (m *mockClientIdentity) GetID() (string, error) {
	return "test-client-id", nil
}

func (m *mockClientIdentity) GetMSPID() (string, error) {
	return "Org1MSP", nil // Admin MSP
}

func (m *mockClientIdentity) GetAttributeValue(attr string) (string, bool, error) {
	return "", false, nil
}

func (m *mockClientIdentity) AssertAttributeValue(attr, val string) error {
	return nil
}

func (m *mockClientIdentity) GetX509Certificate() (*x509.Certificate, error) {
	return nil, nil
}

// mockNonAdminIdentity mocks a non-admin client identity
type mockNonAdminIdentity struct{ mockClientIdentity }

func (m *mockNonAdminIdentity) GetMSPID() (string, error) {
	return "Org2MSP", nil // Non-admin MSP
}

// mockContext implements TransactionContextInterface
type mockContext struct {
	contractapi.TransactionContext
	stub           shim.ChaincodeStubInterface
	clientIdentity cid.ClientIdentity
}

func (m *mockContext) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

func (m *mockContext) GetClientIdentity() cid.ClientIdentity {
	return m.clientIdentity
}
