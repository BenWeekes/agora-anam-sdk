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

      return webpackConfig;
    },
  },
};