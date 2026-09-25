package otime

import (
	"testing"
	"time"

	// Keep the tests independent of the host's zoneinfo, the same way the
	// plugin binary is.
	_ "time/tzdata"

	"github.com/stretchr/testify/assert"
)

// An unresolvable timezone used to leave a nil *time.Location to be handed to
// time.In, which panics and takes the plugin process down with it.
func TestNowWithUnknownTimezoneDoesNotPanic(t *testing.T) {
	previousDefault := DefaultLocation
	DefaultLocation = nil
	defer func() { DefaultLocation = previousDefault }()

	assert.NotPanics(t, func() {
		assert.Equal(t, time.UTC.String(), Now("Not/A_Real_Zone").Location().String())
	})
}

func TestNowWithUnknownTimezoneFallsBackToDefaultLocation(t *testing.T) {
	kolkata, err := time.LoadLocation("Asia/Kolkata")
	assert.Nil(t, err)

	previousDefault := DefaultLocation
	DefaultLocation = kolkata
	defer func() { DefaultLocation = previousDefault }()

	assert.Equal(t, kolkata.String(), Now("Not/A_Real_Zone").Location().String())
}

func TestNowReportsUnknownTimezone(t *testing.T) {
	previousDefault := DefaultLocation
	previousHook := OnInvalidTimezone
	defer func() {
		DefaultLocation = previousDefault
		OnInvalidTimezone = previousHook
	}()

	var reported string
	OnInvalidTimezone = func(timezone string, err error) {
		reported = timezone
		assert.NotNil(t, err)
	}

	Now("Not/A_Real_Zone")
	assert.Equal(t, "Not/A_Real_Zone", reported)
}
