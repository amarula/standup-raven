package util

import "github.com/mattermost/mattermost/server/public/model"

func EmptyAppError() *model.AppError {
	return model.NewAppError("", "", nil, "", 0)
}
