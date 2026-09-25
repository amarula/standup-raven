<img src="assets/images/banner.png" width="300px">

#

## 🚦 Getting Started

These instructions will get you a copy of the project up and running on your local machine for development and testing purposes. 

See [deployment notes](deployment.md) on how to deploy the project on a live system.

### 🔑 Prerequisites

Set up your development environment for building, running, and testing the Standup Raven.

#### 👨‍💻 Obtaining Source

    $ git clone git@github.com:standup-raven/standup-raven.git

#### Go

Requires go version 1.26.7 or later (see the `go` directive in `go.mod`)

    https://golang.org/doc/install
    
#### NodeJS

Requires NodeJS 22 or later, built and tested against NodeJS 24

    https://nodejs.org/en/download

#### Make

On Ubuntu -

    $ sudo apt-get install build-essential
    
On MacOS, install XCode command line tools. 

#### HTTPie

You need this only if you want to use `$ make deploy` for deployments to Mattermost instances.

On MacOS

    $ brew install httpie
    
On Ubuntu

    $ apt-get install httpie
    
For other platforms, refer to the [official installation guide](https://github.com/jakubroztocil/httpie#id3).

### 👨‍💻 Building

Once you have fetched the repo, simply run `$ make dist` from the repo.

This will produce one artifact per platform in the `/dist` directory. The
platforms come from the `server.executables` map in `plugin.json`, so add an
entry there to build for another one.

| Flavor              | Distribution |
| ------------------- | ------------ |
| Linux (x86-64)      | `mattermost-plugin-standup-raven-vx.y.z-linux-amd64.tar.gz`  |
| Linux (arm64)       | `mattermost-plugin-standup-raven-vx.y.z-linux-arm64.tar.gz`  |
| MacOS (Intel)       | `mattermost-plugin-standup-raven-vx.y.z-darwin-amd64.tar.gz` |
| MacOS (Apple silicon) | `mattermost-plugin-standup-raven-vx.y.z-darwin-arm64.tar.gz` |
| Windows (x86-64)    | `mattermost-plugin-standup-raven-vx.y.z-windows-amd64.tar.gz`|

Tagged releases are built and published by the `Release` workflow in
`.github/workflows/release.yml`, so pushing a `vx.y.z` tag is all a release
needs.

## 💯 Running Tests

Following command will run the server tests -

    $ make test
    
## 👞 Running Style Check

This will run server and webapp style checks -

    $ make check-style
    
You can also run style checks for the server and webapp individually.

    $ make check-style-server # server style check
    $ make check-style-webapp # webapp style check
