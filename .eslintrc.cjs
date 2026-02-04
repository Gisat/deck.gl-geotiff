module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    'react/react-in-jsx-scope': 'off',
    'react/prop-types': 'off',
    'max-len': 'off',
    'no-plusplus': 'off',
    'no-tabs': 'off',
    'no-mixed-spaces-and-tabs': 'off',
    'no-unused-vars': 'warn',
  },
  settings: {
    react: { version: 'detect' },
  },
};
