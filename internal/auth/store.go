package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/zalando/go-keyring"
)

// Store wraps keyring access with typed Credentials marshaling.
type Store struct {
	inner          *keyringStore
	fallbackDir    string
	warnOnce       sync.Once
	keyringOK      bool // tracks if keyring is actually working
	keyringChecked bool // tracks if we've tested keyring availability
}

// keyringStore wraps the actual keyring implementation.
type keyringStore struct {
	serviceName string
}

// NewStore creates a credential store.
func NewStore(fallbackDir string) *Store {
	s := &Store{
		inner: &keyringStore{
			serviceName: serviceName,
		},
		fallbackDir: fallbackDir,
		keyringOK:   true, // assume OK until proven otherwise
	}
	return s
}

// isKeyringDisabled checks if keyring should be disabled via env or config.
func (s *Store) isKeyringDisabled() bool {
	// Check environment variable first
	if os.Getenv("SERVICENOW_NO_KEYRING") != "" {
		return true
	}
	return false
}

// checkKeyring tests if the keyring is actually working by doing a test operation.
// This detects cases where the keyring library loads but the secret service isn't available.
func (s *Store) checkKeyring() bool {
	if s.keyringChecked {
		return s.keyringOK
	}
	s.keyringChecked = true

	if s.isKeyringDisabled() {
		s.keyringOK = false
		return false
	}

	// Try a test operation - set and immediately delete a test value
	testKey := "_jsn_keyring_test_"
	testValue := "test"

	err := keyring.Set(s.inner.serviceName, testKey, testValue)
	if err != nil {
		s.keyringOK = false
		s.warnKeyringUnavailable(err)
		return false
	}

	// Try to read it back
	_, err = keyring.Get(s.inner.serviceName, testKey)
	if err != nil {
		s.keyringOK = false
		s.warnKeyringUnavailable(err)
		return false
	}

	// Clean up
	_ = keyring.Delete(s.inner.serviceName, testKey)

	s.keyringOK = true
	return true
}

// Load retrieves credentials for the given origin.
func (s *Store) Load(origin string) (*Credentials, error) {
	// If keyring is disabled or not working, use file
	if !s.checkKeyring() {
		return s.loadFromFile(origin)
	}

	// Try keyring first
	secret, err := keyring.Get(s.inner.serviceName, origin)
	if err == keyring.ErrNotFound {
		return s.loadFromFile(origin)
	}
	if err != nil {
		// Keyring error - mark as not working and fall back to file
		s.keyringOK = false
		s.warnKeyringUnavailable(err)
		return s.loadFromFile(origin)
	}

	// Handle empty or corrupted data from keyring
	if secret == "" {
		return s.loadFromFile(origin)
	}

	var creds Credentials
	if err := json.Unmarshal([]byte(secret), &creds); err != nil {
		// Corrupted data in keyring - try file as fallback
		return s.loadFromFile(origin)
	}
	return &creds, nil
}

// Save stores credentials for the given origin.
func (s *Store) Save(origin string, creds *Credentials) error {
	data, err := json.Marshal(creds)
	if err != nil {
		return err
	}

	// If keyring is disabled or not working, use file
	if !s.checkKeyring() {
		return s.saveToFile(origin, creds)
	}

	// Delete any existing entry first (fresh start)
	_ = keyring.Delete(s.inner.serviceName, origin)

	// Try keyring
	if err := keyring.Set(s.inner.serviceName, origin, string(data)); err != nil {
		// Keyring failed - mark as not working and fall back to file
		s.keyringOK = false
		s.warnKeyringUnavailable(err)
		return s.saveToFile(origin, creds)
	}

	return nil
}

// Delete removes credentials for the given origin.
func (s *Store) Delete(origin string) error {
	// Try to delete from keyring if it might be there
	if s.checkKeyring() {
		_ = keyring.Delete(s.inner.serviceName, origin) // Ignore error - may not exist
	}
	return s.deleteFromFile(origin)
}

// loadFromFile loads credentials from the fallback file.
func (s *Store) loadFromFile(origin string) (*Credentials, error) {
	path := s.credentialsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}

	var creds map[string]Credentials
	if err := json.Unmarshal(data, &creds); err != nil {
		return nil, err
	}

	c, ok := creds[origin]
	if !ok {
		return nil, fmt.Errorf("no credentials found for %s", origin)
	}
	return &c, nil
}

// saveToFile saves credentials to the fallback file.
func (s *Store) saveToFile(origin string, creds *Credentials) error {
	path := s.credentialsPath()
	if err := os.MkdirAll(filepath.Dir(path), 0755); err != nil {
		return err
	}

	var existing map[string]Credentials
	data, err := os.ReadFile(path)
	if err == nil {
		_ = json.Unmarshal(data, &existing) // Ignore error - will start fresh if invalid
	}
	if existing == nil {
		existing = make(map[string]Credentials)
	}

	existing[origin] = *creds

	data, err = json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

// deleteFromFile removes credentials from the fallback file.
func (s *Store) deleteFromFile(origin string) error {
	path := s.credentialsPath()
	data, err := os.ReadFile(path)
	if err != nil {
		return nil
	}

	var existing map[string]Credentials
	if err := json.Unmarshal(data, &existing); err != nil {
		return nil
	}

	delete(existing, origin)

	data, err = json.MarshalIndent(existing, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(path, data, 0600)
}

// credentialsPath returns the path to the fallback credentials file.
func (s *Store) credentialsPath() string {
	return filepath.Join(s.fallbackDir, "credentials.json")
}

// warnKeyringUnavailable prints a warning when keyring is not available.
func (s *Store) warnKeyringUnavailable(err error) {
	s.warnOnce.Do(func() {
		fmt.Fprintf(os.Stderr, "warning: system keyring not available (%v)\n", err)
		fmt.Fprintln(os.Stderr, "         falling back to file-based credential storage")
		fmt.Fprintln(os.Stderr, "         (set SERVICENOW_NO_KEYRING=1 to suppress this warning)")
	})
}

// UsingKeyring returns true if the store is using the system keyring.
func (s *Store) UsingKeyring() bool {
	return s.checkKeyring()
}
