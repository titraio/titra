const { defineConfig } = require('@meteorjs/rspack')
const path = require('path')

/**
 * Rspack configuration for Meteor projects.
 */
module.exports = defineConfig((Meteor) => ({
  module: {
    rules: [
      // ignore TypeScript declaration files (but only outside of node_modules we want to check)
      {
        test: /\.d\.ts$/,
        exclude: /node_modules/,
        loader: 'ignore-loader',
      },
      // ignore TypeScript definition files in dayjs entirely
      {
        test: /dayjs.*\.d\.ts$/,
        type: 'asset/source',
      },
      // Handle SCSS files: Compile with sass-loader, then let Rspack handle the CSS
      {
        test: /\.s[ac]ss$/i,
        type: 'css/auto', // 'css/auto' allows Rspack to also handle CSS modules if you ever need them
        use: [
          {
            loader: 'sass-loader',
            options: {
              sassOptions: {
                // This helps sass-loader easily resolve bare imports like 'bootstrap/...'
                includePaths: [path.resolve(__dirname, 'node_modules')],
              },
            },
          },
        ],
      },
      {
        test: /\.m?js$/,
        resolve: {
          fullySpecified: false,
        },
      },
    ],
  },
  resolve: {
    // make sure webpack resolves the extensions we use and skip .d.ts
    // Added .scss and .sass here just to be safe
    extensions: ['.js', '.jsx', '.mjs', '.ts', '.tsx', '.json', '.scss', '.sass'],
    extensionAlias: {
      '.js': ['.ts', '.js'],
    },
    // allow imports without full specifier so that packages with ESM can work
    fullySpecified: false,
  },
  stats: {
    warningsFilter: [
      /Critical dependency: the request of a dependency is an expression/,
      /export.*was not found/,
      /Unable to resolve loader/,
      /Module not found/,
      /TypeError.*Cannot read properties/,
    ],
  },
}))
