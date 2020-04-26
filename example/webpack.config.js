const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = {
    entry: {
        main: [path.join(__dirname, 'main.js')]
    },
    output: {
        path: path.join(__dirname, 'build'),
        filename: '[name].min.js',
        libraryTarget: 'umd',
        umdNamedDefine: true
    },
    resolve: {
        extensions: ['.js']
    },
    module: {
        rules: [
          {
            test: /\.wasm$/,
            type: 'javascript/auto',
            use: [
              {
                loader: path.join(__dirname, '../src/index.js')
              },
            ],
          },
        ]
    },
  plugins: [
    new HtmlWebpackPlugin({
      chunksSortMode: 'dependency',
      template: path.resolve('./example', 'index.html'),
    })
  ],
};
