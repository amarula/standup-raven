package util

func HasHave(count int) string {
	if count == 1 || count == -1 {
		return "has"
	}

	return "have"
}

func SingularPlural(count int) string {
	if count >= -1 && count <= 1 {
		return ""
	}

	return "s"
}

// IsAre picks the verb to agree with a count, the way HasHave does.
func IsAre(count int) string {
	if count == 1 || count == -1 {
		return "is"
	}

	return "are"
}
