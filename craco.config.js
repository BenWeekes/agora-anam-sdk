module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      // Add a specific rule for your model file
      const modelFileRule = {
        test: /a74adcb06c3b1b07c36a90271b98305857ec3be1$/,
        type: 'asset/inline',
        generator: {
          dataUrl: content => `data:application/octet-stream;base64,${content.toString('base64')}`
        }
      };

      // Find the oneOf rule array
      const oneOfRule = webpackConfig.module.rules.find(
        (rule) => Array.isArray(rule.oneOf)
      );

      if (oneOfRule) {
        // Insert our rule at the beginning to ensure it takes precedence
        oneOfRule.oneOf.unshift(modelFileRule);
      } else {
        webpackConfig.module.rules.unshift(modelFileRule);
      }

      // Disable source-map-loader for @anam-ai/js-sdk
      webpackConfig.module.rules.forEach(rule => {
        if (rule.oneOf) {
          rule.oneOf.forEach(loader => {
            if (loader.use && Array.isArray(loader.use)) {
              loader.use = loader.use.filter(u => {
                const loaderName = typeof u === 'string' ? u : u.loader;
                return !loaderName || !loaderName.includes('source-map-loader');
              });
            }
          });
        }
      });

      // Alternative: Completely ignore source maps for specific packages
      webpackConfig.ignoreWarnings = [
        {
          module: /@anam-ai\/js-sdk/,
          message: /Failed to parse source map/
        }
      ];

      return webpackConfig;
    },
  },
};