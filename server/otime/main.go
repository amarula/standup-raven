package otime

import (
	"fmt"
	"strings"
	"time"
)

type OTime struct {
	time.Time
}

const (
	layoutTime            = "15:04"
	layoutTimeWithSeconds = "15:04:05"
	layoutDate            = "20060102"
)

var nilTime = (time.Time{}).UnixNano()

// DefaultLocation is the default timezone to be used when creating a new standup config.
// TODO will need to remove this and use channel-specific location
// when adding per-channel timezone setting
var DefaultLocation *time.Location

// OnInvalidTimezone, when set, is called with a timezone name that could not be
// resolved. The plugin assigns it at activation; otime cannot call the logger
// directly because logger imports config, which imports otime.
var OnInvalidTimezone func(timezone string, err error)

// resolveLocation looks a timezone name up, falling back to DefaultLocation and
// then UTC. It never returns nil: time.In(nil) panics, which would take down the
// whole plugin process from inside the scheduler.
func resolveLocation(timezone string) *time.Location {
	location, err := time.LoadLocation(timezone)
	if err == nil {
		return location
	}

	if OnInvalidTimezone != nil {
		OnInvalidTimezone(timezone, err)
	}

	if DefaultLocation != nil {
		return DefaultLocation
	}

	return time.UTC
}

func Parse(value string) (OTime, error) {
	argTime, err := time.Parse(layoutTime, value)
	if err != nil {
		return OTime{}, err
	}

	now := time.Now()
	argTime = time.Date(now.Year(), now.Month(), now.Day(), argTime.Hour(), argTime.Minute(), 0, 0, DefaultLocation)
	return OTime{argTime}, nil
}

func Now(timezone string) OTime {
	now := time.Now()
	return OTime{now.In(resolveLocation(timezone))}
}

// GetTime returns time with format like "15:04"
func (ct OTime) GetTime(timezone string) OTime {
	now, _ := time.Parse(layoutTime, ct.Format(layoutTime))
	return OTime{now.In(resolveLocation(timezone))}
}

// GetTimeWithSeconds returns time with format like "15:04:05"
func (ct OTime) GetTimeWithSeconds(timezone string) OTime {
	now, _ := time.Parse(layoutTimeWithSeconds, ct.Format(layoutTimeWithSeconds))
	return OTime{now.In(resolveLocation(timezone))}
}

func (ct OTime) GetTimeString() string {
	return ct.Format(layoutTime)
}

// GetDate returns date with format like "20060102"
func (ct OTime) GetDate(timezone string) OTime {
	now, _ := time.Parse(layoutDate, ct.Format(layoutDate))
	return OTime{now.In(resolveLocation(timezone))}
}

func (ct OTime) GetDateString() string {
	return ct.Format(layoutDate)
}

func (ct *OTime) UnmarshalJSON(b []byte) (err error) {
	s := strings.Trim(string(b), "\"")
	if s == "null" {
		ct.Time = time.Time{}
		return
	}
	t, err := Parse(s)
	if err != nil {
		return err
	}

	ct.Time = t.Time
	return
}

func (ct OTime) MarshalJSON() ([]byte, error) {
	if ct.UnixNano() == nilTime {
		return []byte("null"), nil
	}
	return []byte(fmt.Sprintf("\"%s\"", ct.Format(layoutTime))), nil
}
