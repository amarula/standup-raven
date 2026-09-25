const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const buildProperties = require('../build_properties.json');
const fs = require('fs');
const propertiesParser = require('properties-file');

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';

    const config = {
        mode: isProduction ? 'production' : 'development',
        // Source maps are useful locally, but there is no reason to ship one
        // inside the plugin bundle.
        devtool: isProduction ? false : 'inline-source-map',
        entry: ['./src/index.jsx'],
        resolve: {
            modules: [
                'src',
                'node_modules',
            ],
            extensions: [
                '.js',
                '.jsx',
            ],
        },
        module: {
            rules: [
                {
                    test: /\.(js|jsx)$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env', '@babel/preset-react'],
                        },
                    },
                },
                {
                    test: /\.svg$/,
                    use: {
                        loader: 'svg-inline-loader',
                        options: {
                            removeSVGTagAttrs: false,
                        },
                    },
                },
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader'],
                },
            ],
        },
        plugins: [
            new CopyWebpackPlugin({
                patterns: [
                    {from: 'src/assets/images', to: 'static/'},
                ],
            }),
        ],
        // These are provided by the Mattermost web app itself. See
        // https://developers.mattermost.com/integrate/plugins/components/webapp/
        externals: {
            react: 'React',
            redux: 'Redux',
            'react-dom': 'ReactDOM',
            'react-redux': 'ReactRedux',
            'prop-types': 'PropTypes',
            'react-bootstrap': 'ReactBootstrap',
        },
        output: {
            path: path.join(__dirname, '/dist'),
            publicPath: '/',
            filename: 'main.js',
        },
    };

    if (buildProperties.sentry.enabled) {
        config.plugins.push(sentryWebpackPlugin(buildProperties.sentry));
    }

    return config;
};

// Sentry is disabled in every shipped build, and its webpack plugin is still on
// the v1 line, so it is only loaded when it is actually asked for.
function sentryWebpackPlugin(sentrySettings) {
    generateSentryCLIConfig(sentrySettings);

    // eslint-disable-next-line global-require
    const SentryWebpackPlugin = require('@sentry/webpack-plugin');
    return new SentryWebpackPlugin({
        include: '.',
        ignoreFile: '.sentrycliignore',
        ignore: ['node_modules', 'webpack.config.js'],
        configFile: 'sentry.properties',
    });
}

function generateSentryCLIConfig(sentrySettings) {
    const sentryCLIConfig = {
        'defaults.url': sentrySettings.server_url,
        'defaults.org': sentrySettings.org,
        'defaults.project': sentrySettings.project,
        'auth.token': sentrySettings.auth_token,
    };

    fs.writeFileSync('./sentry.properties', propertiesParser.stringify(sentryCLIConfig));
}
